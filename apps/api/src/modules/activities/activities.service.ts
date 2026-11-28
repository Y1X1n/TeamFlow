import { Injectable } from '@nestjs/common';
import type { ActivityType } from '@teamflow/shared/enums';
import type { Prisma } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  taskId?: string | null;
  type: ActivityType;
  payload: Prisma.InputJsonValue;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, input: ActivityInput): Promise<void> {
    await tx.activity.create({
      data: {
        projectId: input.projectId,
        actorId: input.actorId,
        taskId: input.taskId ?? null,
        type: input.type,
        payload: input.payload,
      },
    });
  }

  async list(projectId: string, cursor: string | undefined, limit: number) {
    return this.query({ projectId }, cursor, limit);
  }

  async listForTask(taskId: string, cursor: string | undefined, limit: number) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    return this.query({ taskId }, cursor, limit);
  }

  private async query(
    where: { projectId: string } | { taskId: string },
    cursor: string | undefined,
    limit: number,
  ) {
    const cursorId = decodeCursor(cursor);
    const rows = await this.prisma.activity.findMany({
      where,
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((activity) => ({
        id: activity.id,
        type: activity.type,
        actor: activity.actor
          ? {
              userId: activity.actor.id,
              name: activity.actor.name,
              avatarUrl: activity.actor.avatarUrl,
            }
          : null,
        taskId: activity.taskId,
        payload: activity.payload,
        createdAt: activity.createdAt,
      })),
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!.id) : null,
    };
  }
}
