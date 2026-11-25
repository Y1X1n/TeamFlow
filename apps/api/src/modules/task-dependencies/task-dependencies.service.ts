import { Injectable } from '@nestjs/common';
import type { CreateTaskDependencyInput } from '@teamflow/shared/schemas';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { BoardEventsService } from '../events/events.module';

type RelatedTask = {
  id: string;
  title: string;
  columnId: string;
  completedAt: Date | null;
  column: { id: string; name: string; isDone: boolean };
};

const RELATED_TASK_SELECT = {
  id: true,
  title: true,
  columnId: true,
  completedAt: true,
  column: { select: { id: true, name: true, isDone: true } },
} as const;

function dependencyRef(task: RelatedTask) {
  return {
    taskId: task.id,
    title: task.title,
    columnId: task.columnId,
    columnName: task.column.name,
    completed: task.completedAt !== null || task.column.isDone,
  };
}

@Injectable()
export class TaskDependenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly events: BoardEventsService,
  ) {}

  private async summarize(taskId: string) {
    const [blockedByRows, blockingRows] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { taskId, blockedBy: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { blockedBy: { select: RELATED_TASK_SELECT } },
      }),
      this.prisma.taskDependency.findMany({
        where: { blockedById: taskId, task: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { task: { select: RELATED_TASK_SELECT } },
      }),
    ]);
    return {
      blockedBy: blockedByRows.map((row) => dependencyRef(row.blockedBy)),
      blocking: blockingRows.map((row) => dependencyRef(row.task)),
    };
  }

  private async assertAcyclic(projectId: string, taskId: string, blockedByTaskId: string) {
    const rows = await this.prisma.taskDependency.findMany({
      where: {
        task: { projectId, deletedAt: null },
        blockedBy: { deletedAt: null },
      },
      select: { taskId: true, blockedById: true },
    });
    const graph = new Map<string, string[]>();
    for (const row of rows) {
      const list = graph.get(row.taskId) ?? [];
      list.push(row.blockedById);
      graph.set(row.taskId, list);
    }
    const stack = [blockedByTaskId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        throw new DomainError('DEPENDENCY_CYCLE', 409, '该依赖会形成循环，无法添加');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of graph.get(current) ?? []) stack.push(next);
    }
  }

  async add(userId: string, taskId: string, input: CreateTaskDependencyInput) {
    const blockedByTaskId = input.blockedByTaskId;
    if (taskId === blockedByTaskId) {
      throw new DomainError('DEPENDENCY_SELF', 422, '任务不能依赖自身');
    }

    const [task, blocker] = await Promise.all([
      this.prisma.task.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, projectId: true, title: true },
      }),
      this.prisma.task.findFirst({
        where: { id: blockedByTaskId, deletedAt: null },
        select: { id: true, projectId: true, title: true },
      }),
    ]);
    if (!task || !blocker) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    if (task.projectId !== blocker.projectId) {
      throw new DomainError('DEPENDENCY_CROSS_PROJECT', 422, '只能依赖同一项目内的任务');
    }

    const existing = await this.prisma.taskDependency.findUnique({
      where: { taskId_blockedById: { taskId, blockedById: blockedByTaskId } },
      select: { id: true },
    });
    if (existing) return this.summarize(taskId);

    await this.assertAcyclic(task.projectId, taskId, blockedByTaskId);

    await this.prisma.$transaction(async (tx) => {
      await tx.taskDependency.create({
        data: { taskId, blockedById: blockedByTaskId, createdById: userId },
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId,
        type: 'TASK_DEPENDENCY_ADDED',
        payload: {
          taskId,
          title: task.title,
          blockedByTaskId,
          blockedByTitle: blocker.title,
        },
      });
    });

    await this.events.publish(task.projectId, 'task.updated', { taskId });
    return this.summarize(taskId);
  }

  async remove(userId: string, taskId: string, blockedByTaskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, projectId: true, title: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');

    const removed = await this.prisma.$transaction(async (tx) => {
      const dependency = await tx.taskDependency.findUnique({
        where: { taskId_blockedById: { taskId, blockedById: blockedByTaskId } },
        select: { id: true, blockedBy: { select: { title: true } } },
      });
      if (!dependency) return false;
      await tx.taskDependency.delete({ where: { id: dependency.id } });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId,
        type: 'TASK_DEPENDENCY_REMOVED',
        payload: {
          taskId,
          title: task.title,
          blockedByTaskId,
          blockedByTitle: dependency.blockedBy.title,
        },
      });
      return true;
    });

    if (removed) {
      await this.events.publish(task.projectId, 'task.updated', { taskId });
    }
    return { ...(await this.summarize(taskId)), removed };
  }
}
