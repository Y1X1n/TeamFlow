import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

interface StreamNotification {
  id: string;
  type: string;
  payload: unknown;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class NotificationEventsService {
  private readonly subject = new Subject<{ userId: string; notification: StreamNotification }>();

  emit(userId: string, notification: StreamNotification): void {
    this.subject.next({ userId, notification });
  }

  forUser(userId: string): Observable<MessageEvent> {
    return merge(
      this.subject.pipe(
        filter((event) => event.userId === userId),
        map((event) => ({ type: 'notification', data: event.notification })),
      ),
      interval(15_000).pipe(map(() => ({ type: 'heartbeat', data: { ok: true } }))),
    );
  }
}
