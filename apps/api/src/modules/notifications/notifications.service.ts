import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES, type NotificationType } from '@teamflow/shared/enums';
import type { Prisma } from '@prisma/client';
import { DomainError } from '../../common/domain-error';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  payload: Prisma.InputJsonValue;
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  async createMany(entries: NotificationInput[]): Promise<void> {
    if (entries.length === 0) return;
    const userIds = [...new Set(entries.map((entry) => entry.userId))];
    const types = [...new Set(entries.map((entry) => entry.type))];
    const disabledPreferences = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, type: { in: types }, enabled: false },
      select: { userId: true, type: true },
    });
    const disabled = new Set(
      disabledPreferences.map((preference) => `${preference.userId}:${preference.type}`),
    );
    const allowed = entries.filter((entry) => !disabled.has(`${entry.userId}:${entry.type}`));
    if (allowed.length === 0) return;

    const created = await this.prisma.notification.createManyAndReturn({
      data: allowed.map((entry) => ({
        userId: entry.userId,
        type: entry.type,
        payload: entry.payload,
        dedupeKey: entry.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
    for (const notification of created) {
      this.events.emit(notification.userId, this.serialize(notification));
    }
  }

  async create(entry: NotificationInput): Promise<void> {
    await this.createMany([entry]);
  }

  async list(
    userId: string,
    query: { unreadOnly?: boolean; type?: NotificationType; cursor?: string; limit?: number },
  ) {
    const limit = query.limit ?? 20;
    const cursorId = decodeCursor(query.cursor);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((notification) => this.serialize(notification)),
      unreadCount,
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!.id) : null,
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new DomainError('NOT_FOUND', 404, 'Notification not found');
    if (notification.readAt) return this.serialize(notification);
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
    return this.serialize(updated);
  }

  async readAll(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const stored = new Map(rows.map((row) => [row.type, row.enabled]));
    const preferences = Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, stored.get(type) ?? true]),
    ) as Record<NotificationType, boolean>;
    return { preferences };
  }

  async updatePreferences(userId: string, input: Partial<Record<NotificationType, boolean>>) {
    const entries = Object.entries(input).filter(
      ([type, enabled]) =>
        NOTIFICATION_TYPES.includes(type as NotificationType) && typeof enabled === 'boolean',
    ) as Array<[NotificationType, boolean]>;
    if (entries.length > 0) {
      await this.prisma.$transaction(
        entries.map(([type, enabled]) =>
          this.prisma.notificationPreference.upsert({
            where: { userId_type: { userId, type } },
            update: { enabled },
            create: { userId, type, enabled },
          }),
        ),
      );
    }
    return this.preferences(userId);
  }

  private serialize(notification: {
    id: string;
    type: NotificationType;
    payload: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      read: notification.readAt !== null,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
