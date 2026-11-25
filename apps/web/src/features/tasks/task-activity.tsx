'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Activity, Paginated } from '@/lib/types';
import { avatarColor, formatDateTime } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from './task-utils';
import { activityTypeLabel, summarizeActivityPayload } from './task-types';

interface TaskActivityProps {
  taskId: string;
}

const initialCursor: string | null = null;

export function TaskActivity({ taskId }: TaskActivityProps) {
  const activitiesQuery = useInfiniteQuery({
    queryKey: queryKeys.taskActivities(taskId),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : '';
      return api<Paginated<Activity>>(`/tasks/${taskId}/activities?limit=20${cursor}`);
    },
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const activities = activitiesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (activitiesQuery.isLoading) {
    return (
      <div className="mt-3 space-y-3" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (activitiesQuery.isError) {
    return (
      <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        活动加载失败（{getErrorMessage(activitiesQuery.error)}）。
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-1"
          onClick={() => void activitiesQuery.refetch()}
        >
          重试
        </Button>
      </div>
    );
  }

  if (activities.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">暂无活动记录。</p>;
  }

  return (
    <div className="mt-3">
      <ol className="space-y-3" aria-label="任务活动">
        {activities.map((activity) => {
          const summary = summarizeActivityPayload(activity.payload);
          const actor = activity.actor;
          return (
            <li key={activity.id} className="flex gap-2.5">
              {actor ? (
                <UserAvatar
                  name={actor.name}
                  src={actor.avatarUrl}
                  color={avatarColor(actor.userId)}
                  className="mt-0.5 h-6 w-6 text-[10px]"
                />
              ) : (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <History className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-5">
                  <span className="font-medium">{actor?.name ?? '系统'}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {activityTypeLabel(activity.type)}
                  </span>
                </p>
                {summary.title && summary.title !== summary.detail ? (
                  <p className="mt-0.5 truncate text-xs text-foreground/80">「{summary.title}」</p>
                ) : null}
                {summary.detail ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{summary.detail}</p>
                ) : null}
                {summary.excerpt ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    “{summary.excerpt}”
                  </p>
                ) : null}
                <time
                  className="mt-0.5 block text-[11px] text-muted-foreground"
                  dateTime={activity.createdAt}
                >
                  {formatDateTime(activity.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>

      {activitiesQuery.hasNextPage ? (
        <div className="mt-3 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={activitiesQuery.isFetchingNextPage}
            onClick={() => void activitiesQuery.fetchNextPage()}
          >
            {activitiesQuery.isFetchingNextPage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            加载更多活动
          </Button>
        </div>
      ) : null}
    </div>
  );
}
