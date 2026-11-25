'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  notificationHref,
  notificationMeta,
  notificationSummary,
} from '@/features/notifications/notification-meta';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Notification, NotificationPage } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { QueryError } from './query-error';

export function NotificationsSummary() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.notifications(true), 'dashboard-summary'],
    queryFn: () => api<NotificationPage>('/notifications?unreadOnly=true&limit=3'),
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <section
      aria-labelledby="notifications-heading"
      className="rounded-xl border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 p-5 pb-3">
        <h2
          id="notifications-heading"
          className="flex flex-wrap items-center gap-2 text-lg font-semibold"
        >
          通知摘要
          {unreadCount > 0 ? <Badge variant="default">{unreadCount} 条未读</Badge> : null}
        </h2>
        <Link
          href="/inbox"
          className="inline-flex items-center gap-0.5 rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          查看全部
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="px-3 pb-3">
        {isPending ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-start gap-2.5 p-2">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <QueryError
            className="m-2"
            message={error instanceof ApiError ? error.message : '通知加载失败，请稍后重试。'}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-2 py-8 text-center">
            <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">暂无未读通知</p>
            <Link
              href="/inbox"
              className="rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              去通知中心看看
            </Link>
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((notification) => (
              <li key={notification.id}>
                <SummaryItem notification={notification} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SummaryItem({ notification }: { notification: Notification }) {
  const info = notificationMeta(notification.type);
  const summary = notificationSummary(notification);
  const href = notificationHref(notification) ?? '/inbox';

  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          info.tone,
        )}
        aria-hidden="true"
      >
        <info.icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{summary.title}</span>
        {summary.detail ? (
          <span className="line-clamp-1 block text-xs text-muted-foreground">{summary.detail}</span>
        ) : null}
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {info.label} · {formatDateTime(notification.createdAt)}
        </span>
      </span>
    </Link>
  );
}
