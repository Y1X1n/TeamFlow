'use client';

import Link from 'next/link';
import type { Notification } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { notificationHref, notificationMeta, notificationSummary } from './notification-meta';

interface NotificationRowProps {
  notification: Notification;
  onRead: (notification: Notification) => void;
}

export function NotificationRow({ notification, onRead }: NotificationRowProps) {
  const info = notificationMeta(notification.type);
  const summary = notificationSummary(notification);
  const href = notificationHref(notification);
  const unread = !notification.read;

  const rowClass = cn(
    'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    unread ? 'bg-primary/[0.04]' : undefined,
  );

  const content = (
    <>
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', info.tone)}
        aria-hidden="true"
      >
        <info.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{info.label}</span>
          {unread ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              未读
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {formatDateTime(notification.createdAt)}
          </span>
        </span>
        <span className="mt-1 block text-sm font-medium">{summary.title}</span>
        {summary.detail ? (
          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
            {summary.detail}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={rowClass} onClick={() => onRead(notification)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={rowClass} onClick={() => onRead(notification)}>
      {content}
    </button>
  );
}
