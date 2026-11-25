import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  notificationPreferencesSchema,
  notificationsQuerySchema,
  type NotificationPreferencesInput,
  type NotificationsQuery,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { NotificationEventsService } from './notification-events.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly events: NotificationEventsService,
  ) {}

  @Sse('stream')
  stream(@CurrentUser() user: { id: string }): Observable<MessageEvent> {
    return this.events.forUser(user.id);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: { id: string }) {
    return this.notifications.preferences(user.id);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(notificationPreferencesSchema))
    body: NotificationPreferencesInput,
  ) {
    return this.notifications.updatePreferences(user.id, body.preferences);
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query(new ZodValidationPipe(notificationsQuerySchema)) query: NotificationsQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: { id: string }) {
    return this.notifications.readAll(user.id);
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: { id: string }, @Param('notificationId') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
