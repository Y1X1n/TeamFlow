import { Global, Logger, Module } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';

export const BOARD_EVENTS_CHANNEL = 'teamflow:board-events';

export type BoardEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.moved'
  | 'column.deleted'
  | 'project.member.changed';

export interface BoardEvent {
  v: 1;
  eventId: string;
  projectId: string;
  type: BoardEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class BoardEventsService {
  private readonly logger = new Logger(BoardEventsService.name);

  constructor(private readonly redis: RedisService) {}

  async publish(
    projectId: string,
    type: BoardEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: BoardEvent = {
      v: 1,
      eventId: randomUUID(),
      projectId,
      type,
      occurredAt: new Date().toISOString(),
      payload,
    };
    try {
      await this.redis.publish(BOARD_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`Board event publish failed: ${(error as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [BoardEventsService],
  exports: [BoardEventsService],
})
export class EventsModule {}
