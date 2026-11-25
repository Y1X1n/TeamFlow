import { Injectable } from '@nestjs/common';
import { comparePositions, positionBetween } from '@teamflow/shared/fractional';
import { TASK_DESCRIPTION_MAX_BYTES } from '@teamflow/shared/enums';
import type {
  CreateColumnInput,
  CreateTaskInput,
  MoveColumnInput,
  MoveTaskInput,
  UpdateColumnInput,
  UpdateTaskInput,
} from '@teamflow/shared/schemas';
import { Prisma } from '@prisma/client';
import type { ProjectRole } from '@teamflow/shared/enums';
import { DomainError } from '../../common/domain-error';
import { serializeTaskCard } from '../../common/serializers';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { BoardEventsService } from '../events/events.module';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../permissions/access.service';

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: {
    assignee: { select: { id: true; name: true; avatarUrl: true } };
    createdBy: { select: { id: true; name: true } };
    subtasks: true;
    watchers: { select: { userId: true } };
    blockedByDependencies: {
      select: {
        blockedBy: {
          select: {
            id: true;
            title: true;
            columnId: true;
            completedAt: true;
            deletedAt: true;
            column: { select: { id: true; name: true; isDone: true } };
          };
        };
      };
    };
    blockingDependencies: {
      select: {
        task: {
          select: {
            id: true;
            title: true;
            columnId: true;
            completedAt: true;
            deletedAt: true;
            column: { select: { id: true; name: true; isDone: true } };
          };
        };
      };
    };
    _count: { select: { comments: true; attachments: true; watchers: true } };
  };
}>;

type RelatedTask = {
  id: string;
  title: string;
  columnId: string;
  completedAt: Date | null;
  deletedAt: Date | null;
  column: { id: string; name: string; isDone: boolean };
};

function serializeDependencyRef(task: RelatedTask) {
  return {
    taskId: task.id,
    title: task.title,
    columnId: task.columnId,
    columnName: task.column.name,
    completed: task.completedAt !== null || task.column.isDone,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
    private readonly events: BoardEventsService,
  ) {}

  private sortedByPosition<T extends { position: string; id: string }>(items: T[]): T[] {
    return [...items].sort(
      (a, b) => comparePositions(a.position, b.position) || a.id.localeCompare(b.id),
    );
  }

  private assertDescriptionSize(description: unknown): void {
    if (description === undefined || description === null) return;
    const bytes = Buffer.byteLength(JSON.stringify(description), 'utf8');
    if (bytes > TASK_DESCRIPTION_MAX_BYTES) {
      throw new DomainError('VALIDATION_ERROR', 400, '任务描述超过 100KB 限制');
    }
  }

  private async assertAssignee(projectId: string, assigneeId: string | null | undefined) {
    if (assigneeId === undefined || assigneeId === null) return null;
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { role: true },
    });
    if (!membership) {
      throw new DomainError('ASSIGNEE_NOT_MEMBER', 422, 'Assignee is not a project member');
    }
    return membership.role;
  }

  private async roleOf(projectId: string, userId: string | null): Promise<ProjectRole> {
    if (!userId) return 'MEMBER';
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    return membership?.role ?? 'MEMBER';
  }

  private async taskInclude(taskId: string): Promise<TaskWithRelations> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        createdBy: { select: { id: true, name: true } },
        subtasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        watchers: { select: { userId: true } },
        blockedByDependencies: {
          orderBy: { createdAt: 'asc' },
          select: {
            blockedBy: {
              select: {
                id: true,
                title: true,
                columnId: true,
                completedAt: true,
                deletedAt: true,
                column: { select: { id: true, name: true, isDone: true } },
              },
            },
          },
        },
        blockingDependencies: {
          orderBy: { createdAt: 'asc' },
          select: {
            task: {
              select: {
                id: true,
                title: true,
                columnId: true,
                completedAt: true,
                deletedAt: true,
                column: { select: { id: true, name: true, isDone: true } },
              },
            },
          },
        },
        _count: {
          select: {
            comments: { where: { deletedAt: null } },
            attachments: true,
            watchers: true,
          },
        },
      },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    return task;
  }

  private card(task: TaskWithRelations, role: ProjectRole) {
    return serializeTaskCard(
      {
        ...task,
        commentCount: task._count.comments,
        attachmentCount: task._count.attachments,
        subtaskTotal: task.subtasks.length,
        subtaskDone: task.subtasks.filter((subtask) => subtask.isDone).length,
        blockedByCount: task.blockedByDependencies.filter(
          (dependency) => !dependency.blockedBy.deletedAt && !dependency.blockedBy.completedAt,
        ).length,
        blockingCount: task.blockingDependencies.filter(
          (dependency) => !dependency.task.deletedAt && !dependency.task.completedAt,
        ).length,
      },
      role,
    );
  }

  private serializeColumn(
    column: { id: string; projectId: string; name: string; position: string; isDone: boolean },
    taskCount: number,
  ) {
    return {
      id: column.id,
      projectId: column.projectId,
      name: column.name,
      position: column.position,
      isDone: column.isDone,
      taskCount,
    };
  }

  private async detail(taskId: string, userId: string) {
    const task = await this.taskInclude(taskId);
    const role = await this.roleOf(task.projectId, task.assigneeId);
    return {
      ...this.card(task, role),
      description: task.description ?? null,
      createdBy: { userId: task.createdBy.id, name: task.createdBy.name },
      subtasks: task.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        isDone: subtask.isDone,
        position: subtask.position,
        createdAt: subtask.createdAt,
        updatedAt: subtask.updatedAt,
      })),
      watching: task.watchers.some((watcher) => watcher.userId === userId),
      watcherCount: task._count.watchers,
      blockedBy: task.blockedByDependencies
        .filter((dependency) => !dependency.blockedBy.deletedAt)
        .map((dependency) => serializeDependencyRef(dependency.blockedBy)),
      blocking: task.blockingDependencies
        .filter((dependency) => !dependency.task.deletedAt)
        .map((dependency) => serializeDependencyRef(dependency.task)),
    };
  }

  private async columnsOf(projectId: string) {
    const columns = await this.prisma.boardColumn.findMany({ where: { projectId } });
    return this.sortedByPosition(columns);
  }

  private async nextPosition(columnId: string, excludeTaskId?: string): Promise<string> {
    const tasks = await this.prisma.task.findMany({
      where: {
        columnId,
        deletedAt: null,
        ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
      },
      select: { id: true, position: true },
    });
    const sorted = this.sortedByPosition(tasks);
    return positionBetween(sorted.at(-1)?.position ?? null, null);
  }

  private async positionBefore(
    columnId: string,
    beforeTaskId: string | null | undefined,
    excludeTaskId?: string,
  ): Promise<string> {
    const tasks = await this.prisma.task.findMany({
      where: {
        columnId,
        deletedAt: null,
        ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
      },
      select: { id: true, position: true },
    });
    const sorted = this.sortedByPosition(tasks);
    if (!beforeTaskId) {
      return positionBetween(sorted.at(-1)?.position ?? null, null);
    }
    if (beforeTaskId === excludeTaskId) {
      throw new DomainError('TASK_NOT_IN_COLUMN', 422, 'Cannot place a task before itself');
    }
    const index = sorted.findIndex((task) => task.id === beforeTaskId);
    if (index < 0) {
      throw new DomainError('TASK_NOT_IN_COLUMN', 422, 'Reference task is not in target column');
    }
    const before = sorted[index]!;
    const prev = index > 0 ? sorted[index - 1]!.position : null;
    return positionBetween(prev, before.position);
  }

  async create(userId: string, projectId: string, input: CreateTaskInput) {
    this.assertDescriptionSize(input.description);
    await this.assertAssignee(projectId, input.assigneeId);

    const columns = await this.columnsOf(projectId);
    if (columns.length === 0) {
      throw new DomainError('NOT_FOUND', 404, 'No board columns configured');
    }
    const column = input.columnId ? columns.find((item) => item.id === input.columnId) : columns[0];
    if (!column) {
      throw new DomainError('NOT_FOUND', 404, 'Column not found');
    }

    const position = await this.nextPosition(column.id);
    const completedAt = column.isDone ? new Date() : null;
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          columnId: column.id,
          title: input.title,
          description: (input.description ?? undefined) as Prisma.InputJsonValue | undefined,
          priority: input.priority ?? 'MEDIUM',
          assigneeId: input.assigneeId ?? null,
          createdById: userId,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          labels: input.labels ?? [],
          position,
          completedAt,
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          createdBy: { select: { id: true, name: true } },
          _count: {
            select: { comments: { where: { deletedAt: null } }, attachments: true },
          },
        },
      });
      await this.activities.record(tx, {
        projectId,
        actorId: userId,
        taskId: created.id,
        type: 'TASK_CREATED',
        payload: { taskId: created.id, title: created.title, columnId: column.id },
      });
      const watcherIds = new Set([userId]);
      if (input.assigneeId) watcherIds.add(input.assigneeId);
      await tx.taskWatcher.createMany({
        data: [...watcherIds].map((watcherId) => ({ taskId: created.id, userId: watcherId })),
        skipDuplicates: true,
      });
      return created;
    });

    if (input.assigneeId && input.assigneeId !== userId) {
      await this.notifications.create({
        userId: input.assigneeId,
        type: 'TASK_ASSIGNED',
        payload: { projectId, taskId: task.id, taskTitle: task.title },
      });
    }
    await this.events.publish(projectId, 'task.created', {
      taskId: task.id,
      columnId: column.id,
      position,
    });
    return this.detail(task.id, userId);
  }

  async get(userId: string, taskId: string) {
    return this.detail(taskId, userId);
  }

  async duplicate(userId: string, taskId: string) {
    const source = await this.taskInclude(taskId);
    const access = await this.access.getContext(userId, source.projectId);
    const columns = await this.columnsOf(source.projectId);
    const sourceColumn = columns.find((column) => column.id === source.columnId);
    const targetColumn = columns.find((column) => !column.isDone) ?? sourceColumn ?? columns[0];
    if (!targetColumn) throw new DomainError('NOT_FOUND', 404, 'No board columns configured');

    const position = await this.nextPosition(targetColumn.id);
    const suffix = '（副本）';
    const title = `${source.title.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
    const assigneeId = access.permissions.includes('task:assign') ? source.assigneeId : null;
    const completedAt = targetColumn.isDone ? new Date() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const copy = await tx.task.create({
        data: {
          projectId: source.projectId,
          columnId: targetColumn.id,
          title,
          description:
            source.description === null ? undefined : (source.description as Prisma.InputJsonValue),
          priority: source.priority,
          assigneeId,
          createdById: userId,
          dueDate: source.dueDate,
          labels: source.labels,
          position,
          completedAt,
        },
      });
      if (source.subtasks.length > 0) {
        await tx.taskSubtask.createMany({
          data: source.subtasks.map((subtask) => ({
            taskId: copy.id,
            title: subtask.title,
            position: subtask.position,
          })),
        });
      }
      const watcherIds = new Set([userId]);
      if (assigneeId) watcherIds.add(assigneeId);
      await tx.taskWatcher.createMany({
        data: [...watcherIds].map((watcherId) => ({ taskId: copy.id, userId: watcherId })),
        skipDuplicates: true,
      });
      await this.activities.record(tx, {
        projectId: source.projectId,
        actorId: userId,
        taskId: copy.id,
        type: 'TASK_CREATED',
        payload: {
          taskId: copy.id,
          title: copy.title,
          columnId: targetColumn.id,
          copiedFromTaskId: source.id,
        },
      });
      return copy;
    });

    await this.events.publish(source.projectId, 'task.created', {
      taskId: created.id,
      columnId: targetColumn.id,
      position,
    });
    return this.detail(created.id, userId);
  }

  async setWatch(userId: string, taskId: string, watching: boolean) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    const access = await this.access.getContext(userId, task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    if (watching) {
      await this.prisma.taskWatcher.upsert({
        where: { taskId_userId: { taskId, userId } },
        update: {},
        create: { taskId, userId },
      });
    } else {
      await this.prisma.taskWatcher.deleteMany({ where: { taskId, userId } });
    }
    const watcherCount = await this.prisma.taskWatcher.count({ where: { taskId } });
    return { watching, watcherCount };
  }

  async update(userId: string, taskId: string, input: UpdateTaskInput) {
    const task = await this.taskInclude(taskId);
    const access = await this.access.getContext(userId, task.projectId);
    const assigneeChanging =
      input.assigneeId !== undefined && (input.assigneeId ?? null) !== (task.assigneeId ?? null);
    if (assigneeChanging && !access.permissions.includes('task:assign')) {
      throw new DomainError('FORBIDDEN', 403, 'Missing permission task:assign');
    }
    this.assertDescriptionSize(input.description);
    if (assigneeChanging) await this.assertAssignee(task.projectId, input.assigneeId);

    const changes: Record<string, unknown> = {};
    if (input.title !== undefined && input.title !== task.title) {
      changes.title = [task.title, input.title];
    }
    if (input.priority !== undefined && input.priority !== task.priority) {
      changes.priority = [task.priority, input.priority];
    }
    if (input.description !== undefined) changes.description = 'updated';
    if (input.labels !== undefined) changes.labels = input.labels;
    if (input.dueDate !== undefined) {
      changes.dueDate = [task.dueDate?.toISOString() ?? null, input.dueDate];
    }
    if (assigneeChanging) {
      changes.assigneeId = [task.assigneeId, input.assigneeId ?? null];
    }

    const nextAssign = input.assigneeId ?? null;
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.TaskUncheckedUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) {
        data.description =
          input.description === null ? Prisma.DbNull : (input.description as Prisma.InputJsonValue);
      }
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
      if (input.dueDate !== undefined)
        data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.labels !== undefined) data.labels = input.labels;
      await tx.task.update({ where: { id: task.id }, data });
      if (nextAssign) {
        await tx.taskWatcher.upsert({
          where: { taskId_userId: { taskId: task.id, userId: nextAssign } },
          update: {},
          create: { taskId: task.id, userId: nextAssign },
        });
      }
      if (Object.keys(changes).length > 0) {
        await this.activities.record(tx, {
          projectId: task.projectId,
          actorId: userId,
          taskId: task.id,
          type: assigneeChanging ? 'TASK_ASSIGNED' : 'TASK_UPDATED',
          payload: {
            taskId: task.id,
            title: input.title ?? task.title,
            changes: changes as Prisma.InputJsonValue,
          },
        });
      }
    });

    if (assigneeChanging && nextAssign && nextAssign !== userId) {
      await this.notifications.create({
        userId: nextAssign,
        type: 'TASK_ASSIGNED',
        payload: {
          projectId: task.projectId,
          taskId: task.id,
          taskTitle: input.title ?? task.title,
        },
      });
    }
    if (Object.keys(changes).length > 0) {
      const minuteBucket = Math.floor(Date.now() / 60_000);
      const watcherEntries = task.watchers
        .filter(
          (watcher) =>
            watcher.userId !== userId && !(assigneeChanging && watcher.userId === nextAssign),
        )
        .map((watcher) => ({
          userId: watcher.userId,
          type: 'TASK_UPDATED' as const,
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            taskTitle: input.title ?? task.title,
            changes: changes as Prisma.InputJsonValue,
          },
          dedupeKey: `task-updated:${task.id}:${watcher.userId}:${minuteBucket}`,
        }));
      await this.notifications.createMany(watcherEntries);
    }
    await this.events.publish(task.projectId, 'task.updated', { taskId: task.id });
    return this.detail(task.id, userId);
  }

  async move(userId: string, taskId: string, input: MoveTaskInput) {
    const task = await this.taskInclude(taskId);
    const target = await this.prisma.boardColumn.findFirst({
      where: { id: input.columnId, projectId: task.projectId },
    });
    if (!target) throw new DomainError('NOT_FOUND', 404, 'Column not found');

    if (target.isDone && !task.completedAt && !input.force) {
      const blockers = await this.prisma.taskDependency.findMany({
        where: {
          taskId: task.id,
          blockedBy: { deletedAt: null, completedAt: null },
        },
        select: { blockedBy: { select: { title: true } } },
      });
      if (blockers.length > 0) {
        const names = blockers
          .slice(0, 3)
          .map((blocker) => `「${blocker.blockedBy.title}」`)
          .join('、');
        throw new DomainError(
          'TASK_BLOCKED',
          409,
          `仍有 ${blockers.length} 个未完成依赖${names ? `（${names}）` : ''}，无法标记完成`,
        );
      }
    }

    const position = await this.positionBefore(
      target.id,
      input.beforeTaskId,
      task.columnId === target.id ? task.id : undefined,
    );
    let completedAt = task.completedAt;
    let activityType: 'TASK_MOVED' | 'TASK_COMPLETED' | 'TASK_REOPENED' = 'TASK_MOVED';
    if (target.isDone && !completedAt) {
      completedAt = new Date();
      activityType = 'TASK_COMPLETED';
    } else if (!target.isDone && completedAt) {
      completedAt = null;
      activityType = 'TASK_REOPENED';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: { columnId: target.id, position, completedAt },
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId: task.id,
        type: activityType,
        payload: {
          taskId: task.id,
          title: task.title,
          fromColumnId: task.columnId,
          toColumnId: target.id,
          fromPosition: task.position,
          toPosition: position,
        },
      });
    });
    await this.events.publish(task.projectId, 'task.moved', {
      taskId: task.id,
      columnId: target.id,
      position,
      completedAt: completedAt ? completedAt.toISOString() : null,
    });
    return this.card(
      await this.taskInclude(task.id),
      await this.roleOf(task.projectId, task.assigneeId),
    );
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const task = await this.taskInclude(taskId);
    await this.prisma.$transaction(async (tx) => {
      await tx.taskDependency.deleteMany({
        where: { OR: [{ taskId: task.id }, { blockedById: task.id }] },
      });
      await tx.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId: task.id,
        type: 'TASK_DELETED',
        payload: { taskId: task.id, title: task.title },
      });
    });
    await this.events.publish(task.projectId, 'task.deleted', { taskId: task.id });
  }

  async createColumn(userId: string, projectId: string, input: CreateColumnInput) {
    const columns = await this.columnsOf(projectId);
    const position = positionBetween(columns.at(-1)?.position ?? null, null);
    const column = await this.prisma.$transaction(async (tx) => {
      const created = await tx.boardColumn.create({
        data: {
          projectId,
          name: input.name,
          isDone: input.isDone ?? false,
          position,
        },
      });
      await this.activities.record(tx, {
        projectId,
        actorId: userId,
        type: 'COLUMN_CREATED',
        payload: { columnId: created.id, name: created.name },
      });
      return created;
    });
    await this.events.publish(projectId, 'column.created', {
      columnId: column.id,
      position,
    });
    return this.serializeColumn(column, 0);
  }

  async updateColumn(userId: string, columnId: string, input: UpdateColumnInput) {
    const column = await this.prisma.boardColumn.findUnique({ where: { id: columnId } });
    if (!column) throw new DomainError('NOT_FOUND', 404, 'Column not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDone === true && !column.isDone) {
        const blocked = await tx.taskDependency.findFirst({
          where: {
            task: { columnId, deletedAt: null, completedAt: null },
            blockedBy: { deletedAt: null, completedAt: null },
          },
          select: {
            task: { select: { title: true } },
            blockedBy: { select: { title: true } },
          },
        });
        if (blocked) {
          throw new DomainError(
            'TASK_BLOCKED',
            409,
            `任务「${blocked.task.title}」仍有未完成依赖「${blocked.blockedBy.title}」，无法将整列标记完成`,
          );
        }
        await tx.task.updateMany({
          where: { columnId, deletedAt: null, completedAt: null },
          data: { completedAt: new Date() },
        });
      }
      if (input.isDone === false && column.isDone) {
        await tx.task.updateMany({
          where: { columnId, deletedAt: null, completedAt: { not: null } },
          data: { completedAt: null },
        });
      }
      const result = await tx.boardColumn.update({
        where: { id: columnId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
        },
      });
      await this.activities.record(tx, {
        projectId: column.projectId,
        actorId: userId,
        type: 'COLUMN_UPDATED',
        payload: { columnId, name: result.name, isDone: result.isDone },
      });
      return result;
    });
    await this.events.publish(column.projectId, 'column.updated', { columnId });
    const taskCount = await this.prisma.task.count({ where: { columnId, deletedAt: null } });
    return this.serializeColumn(updated, taskCount);
  }

  async moveColumn(userId: string, columnId: string, input: MoveColumnInput) {
    const column = await this.prisma.boardColumn.findUnique({ where: { id: columnId } });
    if (!column) throw new DomainError('NOT_FOUND', 404, 'Column not found');
    const columns = (await this.columnsOf(column.projectId)).filter((item) => item.id !== columnId);
    if (input.beforeColumnId && !columns.some((item) => item.id === input.beforeColumnId)) {
      throw new DomainError('TASK_NOT_IN_COLUMN', 422, 'Reference column not found');
    }
    const index = input.beforeColumnId
      ? columns.findIndex((item) => item.id === input.beforeColumnId)
      : columns.length;
    const prev = index > 0 ? columns[index - 1]!.position : null;
    const next = index < columns.length ? columns[index]!.position : null;
    const position = positionBetween(prev, next);

    await this.prisma.$transaction(async (tx) => {
      await tx.boardColumn.update({ where: { id: columnId }, data: { position } });
      await this.activities.record(tx, {
        projectId: column.projectId,
        actorId: userId,
        type: 'COLUMN_UPDATED',
        payload: { columnId, name: column.name, moved: true },
      });
    });
    await this.events.publish(column.projectId, 'column.moved', { columnId, position });
    const taskCount = await this.prisma.task.count({ where: { columnId, deletedAt: null } });
    return this.serializeColumn({ ...column, position }, taskCount);
  }

  async deleteColumn(userId: string, columnId: string, moveTasksTo?: string): Promise<void> {
    const column = await this.prisma.boardColumn.findUnique({ where: { id: columnId } });
    if (!column) throw new DomainError('NOT_FOUND', 404, 'Column not found');
    const columns = await this.columnsOf(column.projectId);
    if (columns.length <= 1)
      throw new DomainError('LAST_COLUMN', 409, 'Cannot delete the last column');

    const tasks = await this.sortedByPosition(
      await this.prisma.task.findMany({
        where: { columnId, deletedAt: null },
        select: { id: true, position: true, completedAt: true },
      }),
    );
    let target: { id: string; isDone: boolean; position: string } | null = null;
    if (tasks.length > 0) {
      if (!moveTasksTo) {
        throw new DomainError('COLUMN_NOT_EMPTY', 409, 'Column has tasks; provide moveTasksTo');
      }
      if (moveTasksTo === columnId) {
        throw new DomainError('TASK_NOT_IN_COLUMN', 422, 'Cannot move tasks into the same column');
      }
      target = await this.prisma.boardColumn.findFirst({
        where: { id: moveTasksTo, projectId: column.projectId },
        select: { id: true, isDone: true, position: true },
      });
      if (!target) throw new DomainError('NOT_FOUND', 404, 'Target column not found');
    }

    if (target?.isDone && tasks.length > 0) {
      const blocked = await this.prisma.taskDependency.findFirst({
        where: {
          taskId: { in: tasks.map((task) => task.id) },
          blockedBy: { deletedAt: null, completedAt: null },
        },
        select: {
          task: { select: { title: true } },
          blockedBy: { select: { title: true } },
        },
      });
      if (blocked) {
        throw new DomainError(
          'TASK_BLOCKED',
          409,
          `任务「${blocked.task.title}」仍有未完成依赖「${blocked.blockedBy.title}」，无法移动到完成列`,
        );
      }
    }

    const movedEvents: Array<{ taskId: string; position: string }> = [];
    await this.prisma.$transaction(async (tx) => {
      if (target && tasks.length > 0) {
        const existing = await this.sortedByPosition(
          await tx.task.findMany({
            where: { columnId: target.id, deletedAt: null },
            select: { id: true, position: true },
          }),
        );
        let prev = existing.at(-1)?.position ?? null;
        for (const task of tasks) {
          const position = positionBetween(prev, null);
          prev = position;
          const completedAt = target.isDone ? (task.completedAt ?? new Date()) : null;
          await tx.task.update({
            where: { id: task.id },
            data: { columnId: target.id, position, completedAt },
          });
          movedEvents.push({ taskId: task.id, position });
        }
      }
      await tx.boardColumn.delete({ where: { id: columnId } });
      await this.activities.record(tx, {
        projectId: column.projectId,
        actorId: userId,
        type: 'COLUMN_DELETED',
        payload: { columnId, name: column.name, movedTasksTo: target?.id ?? null },
      });
    });

    await this.events.publish(column.projectId, 'column.deleted', { columnId });
    if (target) {
      for (const moved of movedEvents) {
        await this.events.publish(column.projectId, 'task.moved', {
          taskId: moved.taskId,
          columnId: target.id,
          position: moved.position,
        });
      }
    }
  }
}
