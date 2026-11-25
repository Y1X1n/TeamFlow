'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { AlertTriangle, BellOff, CheckCheck, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Notification, NotificationPage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NotificationPreferencesDialog } from './notification-preferences-dialog';
import { NotificationRow } from './notification-row';

const PAGE_SIZE = 20;

export function InboxView() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const queryClient = useQueryClient();

  const notificationsQuery = useInfiniteQuery<
    NotificationPage,
    Error,
    InfiniteData<NotificationPage>,
    readonly unknown[],
    string | null
  >({
    queryKey: queryKeys.notifications(unreadOnly),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        unreadOnly: unreadOnly ? 'true' : 'false',
        limit: String(PAGE_SIZE),
      });
      if (pageParam) params.set('cursor', pageParam);
      return api<NotificationPage>(`/notifications?${params.toString()}`);
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api<Notification>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '标记已读失败，请稍后重试。');
    },
  });

  const markAll = useMutation({
    mutationFn: () => api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(
        result.updated > 0 ? `已将 ${result.updated} 条通知标为已读` : '当前没有未读通知',
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '操作失败，请稍后重试。');
    },
  });

  const items = notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = notificationsQuery.data?.pages.at(0)?.unreadCount ?? 0;
  const isPending = notificationsQuery.isPending;
  const isError = notificationsQuery.isError;

  function handleRead(notification: Notification) {
    if (!notification.read) markRead.mutate(notification.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">通知中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            任务指派、评论提醒与项目动态都会汇总在这里。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPreferencesOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            通知偏好
          </Button>
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || unreadCount === 0}
          >
            {markAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
            )}
            全部已读
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div
            role="tablist"
            aria-label="通知筛选"
            className="inline-flex rounded-lg border bg-muted/50 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !unreadOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              全部
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={unreadOnly}
              onClick={() => setUnreadOnly(true)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                unreadOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              只看未读
              {unreadCount > 0 ? ` (${unreadCount})` : ''}
            </button>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isPending
              ? '正在加载…'
              : `共 ${items.length} 条${unreadCount > 0 ? ` · ${unreadCount} 条未读` : ''}`}
          </p>
        </div>

        {isPending ? (
          <InboxSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {notificationsQuery.error instanceof ApiError
                ? notificationsQuery.error.message
                : '通知加载失败，请稍后重试。'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void notificationsQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BellOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-medium">{unreadOnly ? '没有未读通知' : '暂无通知'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {unreadOnly
                ? '所有通知都已读完，可以安心专注手头的工作。'
                : '当有人指派任务、评论或邀请你加入项目时，会在这里提醒你。'}
            </p>
            {unreadOnly ? (
              <Button variant="link" size="sm" onClick={() => setUnreadOnly(false)}>
                查看全部通知
              </Button>
            ) : (
              <Button variant="link" size="sm" asChild>
                <Link href="/">返回工作台</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={handleRead}
              />
            ))}
          </div>
        )}

        {!isPending && !isError && items.length > 0 ? (
          notificationsQuery.hasNextPage ? (
            <div className="border-t px-4 py-3 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void notificationsQuery.fetchNextPage()}
                disabled={notificationsQuery.isFetchingNextPage}
              >
                {notificationsQuery.isFetchingNextPage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {notificationsQuery.isFetchingNextPage ? '正在加载…' : '加载更多'}
              </Button>
            </div>
          ) : (
            <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
              已经到底啦
            </p>
          )
        ) : null}
      </Card>

      <NotificationPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
