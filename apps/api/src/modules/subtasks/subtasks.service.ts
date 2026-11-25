import { Injectable } from '@nestjs/common';
import { SUBTASK_MAX_PER_TASK } from '@teamflow/shared/enums';
import type { CreateSubtaskInput, UpdateSubtaskInput } from '@teamflow/shared/schemas';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { AccessService } from '../permissions/access.service';

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
  ) {}

  private serialize(subtask: {
    id: string;
    taskId: string;
    title: string;
    isDone: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      isDone: subtask.isDone,
      position: subtask.position,
      createdAt: subtask.createdAt,
      updatedAt: subtask.updatedAt,
    };
  }

  private async activeTask(taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true, projectId: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    return task;
  }

  async list(taskId: string) {
    await this.activeTask(taskId);
    const items = await this.prisma.taskSubtask.findMany({
      where: { taskId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      items: items.map((item) => this.serialize(item)),
      progress: {
        total: items.length,
        done: items.filter((item) => item.isDone).length,
      },
    };
  }

  async create(userId: string, taskId: string, input: CreateSubtaskInput) {
    const task = await this.activeTask(taskId);
    await this.access.getContext(userId, task.projectId);

    const count = await this.prisma.taskSubtask.count({ where: { taskId } });
    if (count >= SUBTASK_MAX_PER_TASK) {
      throw new DomainError(
        'VALIDATION_ERROR',
        400,
        `每个任务最多 ${SUBTASK_MAX_PER_TASK} 个子任务`,
      );
    }
    const last = await this.prisma.taskSubtask.findFirst({
      where: { taskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;

    const subtask = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskSubtask.create({
        data: { taskId, title: input.title, position },
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId,
        type: 'TASK_UPDATED',
        payload: {
          taskId,
          title: task.title,
          changes: {
            subtaskId: created.id,
            action: 'subtask_created',
            subtaskTitle: created.title,
          },
        },
      });
      return created;
    });
    return this.serialize(subtask);
  }

  private async findForWrite(subtaskId: string) {
    const subtask = await this.prisma.taskSubtask.findUnique({
      where: { id: subtaskId },
      include: { task: { select: { id: true, title: true, projectId: true, deletedAt: true } } },
    });
    if (!subtask || subtask.task.deletedAt) {
      throw new DomainError('NOT_FOUND', 404, 'Subtask not found');
    }
    return subtask;
  }

  async update(userId: string, subtaskId: string, input: UpdateSubtaskInput) {
    const subtask = await this.findForWrite(subtaskId);
    const access = await this.access.getContext(userId, subtask.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.taskSubtask.update({
        where: { id: subtaskId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
        },
      });
      await this.activities.record(tx, {
        projectId: subtask.task.projectId,
        actorId: userId,
        taskId: subtask.taskId,
        type: 'TASK_UPDATED',
        payload: {
          taskId: subtask.taskId,
          title: subtask.task.title,
          changes: {
            subtaskId,
            action: input.isDone !== undefined ? 'subtask_toggled' : 'subtask_updated',
            isDone: result.isDone,
          },
        },
      });
      return result;
    });
    return this.serialize(updated);
  }

  async remove(userId: string, subtaskId: string): Promise<void> {
    const subtask = await this.findForWrite(subtaskId);
    const access = await this.access.getContext(userId, subtask.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    await this.prisma.$transaction(async (tx) => {
      await tx.taskSubtask.delete({ where: { id: subtaskId } });
      await this.activities.record(tx, {
        projectId: subtask.task.projectId,
        actorId: userId,
        taskId: subtask.taskId,
        type: 'TASK_UPDATED',
        payload: {
          taskId: subtask.taskId,
          title: subtask.task.title,
          changes: { subtaskId, action: 'subtask_deleted', subtaskTitle: subtask.title },
        },
      });
    });
  }
}
