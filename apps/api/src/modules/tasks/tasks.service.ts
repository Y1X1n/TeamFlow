import { Injectable } from '@nestjs/common';
import { comparePositions, positionBetween } from '@teamflow/shared/fractional';
import { nextRecurringDueDate } from '@teamflow/shared/recurrence';
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

  /**
   * 同一列的 position 计算必须串行化，否则并发创建/移动会拿到相同 position。
   * advisory lock 在事务结束时自动释放。
   */
  private async lockColumn(tx: Prisma.TransactionClient, columnId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`column:${columnId}`}))`;
  }

  private async lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project:${projectId}`}))`;
  }

  private async nextPositionIn(
    tx: Prisma.TransactionClient,
    columnId: string,
    excludeTaskId?: string,
  ): Promise<string> {
    const tasks = await tx.task.findMany({
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

  private async positionBeforeIn(
    tx: Prisma.TransactionClient,
    columnId: string,
    beforeTaskId: string | null | undefined,
    excludeTaskId?: string,
  ): Promise<string> {
    const tasks = await tx.task.findMany({
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

    const completedAt = column.isDone ? new Date() : null;
    const { created: task, position } = await this.prisma.$transaction(async (tx) => {
      await this.lockColumn(tx, column.id);
      const position = await this.nextPositionIn(tx, column.id);
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
          estimateMinutes: input.estimateMinutes ?? null,
          actualMinutes: input.actualMinutes ?? null,
          recurrence: input.recurrence ?? 'NONE',
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
      return { created, position };
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

    const suffix = '（副本）';
    const title = `${source.title.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
    let assigneeId = access.permissions.includes('task:assign') ? source.assigneeId : null;
    if (assigneeId) {
      const stillMember = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: source.projectId, userId: assigneeId } },
        select: { userId: true },
      });
      if (!stillMember) assigneeId = null;
    }
    const completedAt = targetColumn.isDone ? new Date() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockColumn(tx, targetColumn.id);
      const position = await this.nextPositionIn(tx, targetColumn.id);
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
          estimateMinutes: source.estimateMinutes,
          actualMinutes: null,
          recurrence: 'NONE',
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
      return { copy, position };
    });

    await this.events.publish(source.projectId, 'task.created', {
      taskId: created.copy.id,
      columnId: targetColumn.id,
      position: created.position,
    });
    return this.detail(created.copy.id, userId);
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
    if (input.estimateMinutes !== undefined) {
      if (input.estimateMinutes !== (task.estimateMinutes ?? null)) {
        changes.estimateMinutes = [task.estimateMinutes ?? null, input.estimateMinutes];
      }
    }
    if (input.actualMinutes !== undefined) {
      if (input.actualMinutes !== (task.actualMinutes ?? null)) {
        changes.actualMinutes = [task.actualMinutes ?? null, input.actualMinutes];
      }
    }
    if (input.recurrence !== undefined && input.recurrence !== task.recurrence) {
      changes.recurrence = [task.recurrence, input.recurrence];
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
      if (input.estimateMinutes !== undefined) data.estimateMinutes = input.estimateMinutes;
      if (input.actualMinutes !== undefined) data.actualMinutes = input.actualMinutes;
      if (input.recurrence !== undefined) data.recurrence = input.recurrence;
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

    let completedAt = task.completedAt;
    let activityType: 'TASK_MOVED' | 'TASK_COMPLETED' | 'TASK_REOPENED' = 'TASK_MOVED';
    if (target.isDone && !completedAt) {
      completedAt = new Date();
      activityType = 'TASK_COMPLETED';
    } else if (!target.isDone && completedAt) {
      completedAt = null;
      activityType = 'TASK_REOPENED';
    }

    const position = await this.prisma.$transaction(async (tx) => {
      await this.lockColumn(tx, target.id);
      const nextPosition = await this.positionBeforeIn(
        tx,
        target.id,
        input.beforeTaskId,
        task.columnId === target.id ? task.id : undefined,
      );
      await tx.task.update({
        where: { id: task.id },
        data: { columnId: target.id, position: nextPosition, completedAt },
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
          toPosition: nextPosition,
        },
      });
      return nextPosition;
    });
    await this.events.publish(task.projectId, 'task.moved', {
      taskId: task.id,
      columnId: target.id,
      position,
      completedAt: completedAt ? completedAt.toISOString() : null,
    });

    // 仅在「本次完成」时生成下一次任务，避免重复完成同一任务时反复创建。
    const becameCompleted = activityType === 'TASK_COMPLETED';
    if (becameCompleted && task.recurrence !== 'NONE') {
      await this.createNextRecurrence(task, target.isDone);
    }

    return this.card(
      await this.taskInclude(task.id),
      await this.roleOf(task.projectId, task.assigneeId),
    );
  }

  /**
   * 生成重复任务的下一实例：复制内容与负责人，截止时间按规则顺延，放入第一个未完成列末尾。
   *
   * 使用 `recurrenceGeneratedAt` 做幂等保护：只有把该字段从 null 或旧值条件更新成功的那一次才会创建。
   * position 在事务内计算，避免并发完成多个重复任务时拿到相同的列尾位置。
   */
  private async createNextRecurrence(task: TaskWithRelations, completedInDoneColumn: boolean) {
    if (!completedInDoneColumn) return;
    const columns = await this.columnsOf(task.projectId);
    const targetColumn = columns.find((column) => !column.isDone);
    // 所有列都标记为完成时没有合法落点，跳过生成，避免产生「完成列中的未完成任务」。
    if (!targetColumn) return;

    const dueDate = nextRecurringDueDate(task.recurrence, task.dueDate);
    const assigneeRole = task.assigneeId
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: task.projectId, userId: task.assigneeId } },
          select: { role: true },
        })
      : null;
    // 成员被移除后 assigneeId 仍留在任务上，生成下一实例时不再沿用。
    const assigneeId = assigneeRole ? task.assigneeId : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: {
          id: task.id,
          recurrence: { not: 'NONE' },
          OR: [
            { recurrenceGeneratedAt: null },
            { recurrenceGeneratedAt: { lt: task.updatedAt } },
          ],
        },
        data: { recurrenceGeneratedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      await this.lockColumn(tx, targetColumn.id);
      const existing = this.sortedByPosition(
        await tx.task.findMany({
          where: { columnId: targetColumn.id, deletedAt: null },
          select: { id: true, position: true },
        }),
      );
      const position = positionBetween(existing.at(-1)?.position ?? null, null);

      const next = await tx.task.create({
        data: {
          projectId: task.projectId,
          columnId: targetColumn.id,
          title: task.title,
          description:
            task.description === null ? undefined : (task.description as Prisma.InputJsonValue),
          priority: task.priority,
          assigneeId,
          createdById: task.createdById,
          dueDate,
          estimateMinutes: task.estimateMinutes,
          recurrence: task.recurrence,
          labels: task.labels,
          position,
        },
      });
      if (task.subtasks.length > 0) {
        await tx.taskSubtask.createMany({
          data: task.subtasks.map((subtask) => ({
            taskId: next.id,
            title: subtask.title,
            position: subtask.position,
          })),
        });
      }
      // 沿用原任务的关注者（含手动关注），并确保创建者与负责人被关注。
      const watcherIds = new Set(task.watchers.map((watcher) => watcher.userId));
      watcherIds.add(task.createdById);
      if (assigneeId) watcherIds.add(assigneeId);
      await tx.taskWatcher.createMany({
        data: [...watcherIds].map((watcherId) => ({ taskId: next.id, userId: watcherId })),
        skipDuplicates: true,
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: task.createdById,
        taskId: next.id,
        type: 'TASK_CREATED',
        payload: {
          taskId: next.id,
          title: next.title,
          columnId: targetColumn.id,
          recurringFromTaskId: task.id,
        },
      });
      return { next, position };
    });

    if (!created) return;
    await this.events.publish(task.projectId, 'task.created', {
      taskId: created.next.id,
      columnId: targetColumn.id,
      position: created.position,
    });
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const task = await this.taskInclude(taskId);
    await this.prisma.$transaction(async (tx) => {
      // 保留依赖关系，恢复任务后可继续生效；未删除任务不会统计已删除任务。
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

  async trash(userId: string, projectId: string) {
    const access = await this.access.getContext(userId, projectId);
    if (!access.permissions.includes('task:delete')) {
      throw new DomainError('FORBIDDEN', 403, 'Missing permission task:delete');
    }
    const tasks = await this.prisma.task.findMany({
      where: { projectId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        column: { select: { id: true, name: true } },
      },
    });
    return tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      columnId: task.columnId,
      columnName: task.column.name,
      priority: task.priority,
      assignee: task.assignee
        ? {
            userId: task.assignee.id,
            name: task.assignee.name,
            avatarUrl: task.assignee.avatarUrl,
          }
        : null,
      dueDate: task.dueDate,
      estimateMinutes: task.estimateMinutes,
      actualMinutes: task.actualMinutes,
      recurrence: task.recurrence,
      labels: task.labels,
      deletedAt: task.deletedAt,
    }));
  }

  private async assertRestoreAcyclic(taskId: string, projectId: string) {
    const rows = await this.prisma.taskDependency.findMany({
      where: { task: { projectId } },
      select: {
        taskId: true,
        blockedById: true,
        task: { select: { deletedAt: true } },
        blockedBy: { select: { deletedAt: true } },
      },
    });
    const graph = new Map<string, string[]>();
    for (const row of rows) {
      const taskActive = row.taskId === taskId || row.task.deletedAt === null;
      const blockerActive = row.blockedById === taskId || row.blockedBy.deletedAt === null;
      if (!taskActive || !blockerActive) continue;
      const list = graph.get(row.taskId) ?? [];
      list.push(row.blockedById);
      graph.set(row.taskId, list);
    }

    const stack = [...(graph.get(taskId) ?? [])];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        throw new DomainError(
          'DEPENDENCY_CYCLE',
          409,
          '恢复任务会形成依赖循环，请先调整任务依赖',
        );
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of graph.get(current) ?? []) stack.push(next);
    }
  }

  async restore(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: { not: null } },
      include: { column: { select: { id: true, isDone: true, projectId: true } } },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    const access = await this.access.getContext(userId, task.projectId);
    if (!access.permissions.includes('task:delete')) {
      throw new DomainError('FORBIDDEN', 403, 'Missing permission task:delete');
    }
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');

    await this.assertRestoreAcyclic(task.id, task.projectId);
    if (task.column.isDone && !task.completedAt) {
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
          `仍有 ${blockers.length} 个未完成依赖${names ? `（${names}）` : ''}，无法恢复到完成列`,
        );
      }
    }

    const completedAt = task.column.isDone ? (task.completedAt ?? new Date()) : null;
    await this.prisma.$transaction(async (tx) => {
      await this.lockColumn(tx, task.columnId);
      const position = await this.nextPositionIn(tx, task.columnId);
      const restored = await tx.task.updateMany({
        where: { id: task.id, deletedAt: { not: null } },
        data: { deletedAt: null, position, completedAt },
      });
      if (restored.count === 0) {
        throw new DomainError('NOT_FOUND', 404, 'Task is not in trash');
      }
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId: task.id,
        type: 'TASK_RESTORED',
        payload: { taskId: task.id, title: task.title, columnId: task.columnId },
      });
    });
    await this.events.publish(task.projectId, 'task.updated', { taskId: task.id });
    return this.detail(task.id, userId);
  }

  async createColumn(userId: string, projectId: string, input: CreateColumnInput) {
    const { column, position } = await this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);
      const columns = this.sortedByPosition(
        await tx.boardColumn.findMany({ where: { projectId } }),
      );
      const nextPosition = positionBetween(columns.at(-1)?.position ?? null, null);
      const created = await tx.boardColumn.create({
        data: {
          projectId,
          name: input.name,
          isDone: input.isDone ?? false,
          position: nextPosition,
        },
      });
      await this.activities.record(tx, {
        projectId,
        actorId: userId,
        type: 'COLUMN_CREATED',
        payload: { columnId: created.id, name: created.name },
      });
      return { column: created, position: nextPosition };
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

    const position = await this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, column.projectId);
      const columns = this.sortedByPosition(
        await tx.boardColumn.findMany({ where: { projectId: column.projectId } }),
      ).filter((item) => item.id !== columnId);
      if (input.beforeColumnId && !columns.some((item) => item.id === input.beforeColumnId)) {
        throw new DomainError('TASK_NOT_IN_COLUMN', 422, 'Reference column not found');
      }
      const index = input.beforeColumnId
        ? columns.findIndex((item) => item.id === input.beforeColumnId)
        : columns.length;
      const prev = index > 0 ? columns[index - 1]!.position : null;
      const next = index < columns.length ? columns[index]!.position : null;
      const nextPosition = positionBetween(prev, next);
      await tx.boardColumn.update({ where: { id: columnId }, data: { position: nextPosition } });
      await this.activities.record(tx, {
        projectId: column.projectId,
        actorId: userId,
        type: 'COLUMN_UPDATED',
        payload: { columnId, name: column.name, moved: true },
      });
      return nextPosition;
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
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockColumn(tx, columnId);
        if (target) await this.lockColumn(tx, target.id);
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
        // 已删除任务仍引用原列；迁移到目标列（没有可见任务时选另一列），避免外键阻塞删除。
        const trashColumn = target ?? columns.find((item) => item.id !== columnId);
        if (trashColumn) {
          await tx.task.updateMany({
            where: { columnId, deletedAt: { not: null } },
            data: { columnId: trashColumn.id },
          });
        }
        await tx.boardColumn.delete({ where: { id: columnId } });
        await this.activities.record(tx, {
          projectId: column.projectId,
          actorId: userId,
          type: 'COLUMN_DELETED',
          payload: { columnId, name: column.name, movedTasksTo: target?.id ?? null },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2003') {
        throw new DomainError(
          'COLUMN_BUSY',
          409,
          '列中出现了新任务，请刷新后重试删除',
        );
      }
      throw error;
    }

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
