'use client';

import { AlertTriangle, Bot, History, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { describeActivity } from '@/features/activities/activity-description';
import type { Activity } from '@/lib/types';
import { avatarColor, cn, formatDateTime } from '@/lib/utils';
import type { PrioritySlice, UpcomingEntry, WorkloadEntry } from './overview-utils';

export type MetricTone = 'default' | 'success' | 'danger' | 'warning' | 'muted';

const TONE_STYLES: Record<MetricTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-destructive/10 text-destructive',
  warning: 'bg-amber-100 text-amber-700',
  muted: 'bg-muted text-muted-foreground',
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  tone?: MetricTone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        </div>
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            TONE_STYLES[tone],
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

const WORKLOAD_SEGMENTS = [
  { key: 'done', label: '已完成', className: 'bg-emerald-500' },
  { key: 'open', label: '进行中', className: 'bg-indigo-400' },
  { key: 'overdue', label: '逾期', className: 'bg-rose-500' },
] as const;

export function WorkloadCard({ workload }: { workload: WorkloadEntry[] }) {
  const hasAnyTask = workload.some((entry) => entry.total > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">成员工作负载</CardTitle>
        <p className="text-xs text-muted-foreground">
          按分配任务统计每位成员的完成、进行中与逾期占比。
        </p>
      </CardHeader>
      <CardContent>
        {!hasAnyTask ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            还没有任务被指派给成员，分配任务后可查看负载分布。
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {WORKLOAD_SEGMENTS.map((segment) => (
                <span key={segment.key} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn('h-2 w-2 rounded-full', segment.className)}
                    aria-hidden="true"
                  />
                  {segment.label}
                </span>
              ))}
            </div>
            <ul className="space-y-4">
              {workload.map((entry) => {
                const openOnly = Math.max(0, entry.open - entry.overdue);
                const percent = (count: number) =>
                  entry.total > 0 ? (count / entry.total) * 100 : 0;
                return (
                  <li key={entry.userId} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar
                          name={entry.name}
                          src={entry.avatarUrl}
                          color={avatarColor(entry.userId)}
                          className="h-6 w-6 text-[10px]"
                        />
                        <span className="truncate text-sm font-medium">{entry.name}</span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        未完成 {entry.open} · 逾期 {entry.overdue} · 已完成 {entry.done}
                      </span>
                    </div>
                    <div
                      className="flex h-2 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${entry.name}：未完成 ${entry.open} 项，其中逾期 ${entry.overdue} 项，已完成 ${entry.done} 项`}
                    >
                      {entry.done > 0 ? (
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${percent(entry.done)}%` }}
                        />
                      ) : null}
                      {openOnly > 0 ? (
                        <div
                          className="h-full bg-indigo-400"
                          style={{ width: `${percent(openOnly)}%` }}
                        />
                      ) : null}
                      {entry.overdue > 0 ? (
                        <div
                          className="h-full bg-rose-500"
                          style={{ width: `${percent(entry.overdue)}%` }}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  URGENT: 'bg-rose-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-indigo-500',
  LOW: 'bg-slate-300',
};

export function PriorityCard({
  priority,
  openTaskCount,
}: {
  priority: PrioritySlice[];
  openTaskCount: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">未完成任务优先级分布</CardTitle>
        <p className="text-xs text-muted-foreground">
          共 {openTaskCount} 项未完成任务，优先处理紧急与高优先级事项。
        </p>
      </CardHeader>
      <CardContent>
        {openTaskCount === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            所有任务都已完成，暂无待办分布。
          </p>
        ) : (
          <>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={priority
                .map((slice) => `${TASK_PRIORITY_LABELS[slice.priority]} ${slice.count} 项`)
                .join('，')}
            >
              {priority.map((slice) =>
                slice.count > 0 ? (
                  <div
                    key={slice.priority}
                    className={cn('h-full', PRIORITY_COLORS[slice.priority])}
                    style={{ width: `${(slice.count / openTaskCount) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {priority.map((slice) => (
                <li
                  key={slice.priority}
                  className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn('h-2 w-2 rounded-full', PRIORITY_COLORS[slice.priority])}
                      aria-hidden="true"
                    />
                    {TASK_PRIORITY_LABELS[slice.priority]}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{slice.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingCard({
  projectId,
  upcoming,
}: {
  projectId: string;
  upcoming: UpcomingEntry[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">即将到期</CardTitle>
        <p className="text-xs text-muted-foreground">按截止时间排序的前 5 项未完成任务。</p>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无设置了截止时间的未完成任务。
          </p>
        ) : (
          <ul className="divide-y">
            {upcoming.map(({ task, columnName, overdue }) => (
              <li key={task.id}>
                <Link
                  href={`/projects/${projectId}?task=${task.id}`}
                  className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                  <Badge variant="muted" className="shrink-0">
                    {columnName}
                  </Badge>
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {overdue ? '已逾期 · ' : ''}
                    {formatDateTime(task.dueDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentActivityCard({
  activities,
  names,
  isLoading,
  isError,
  onRetry,
}: {
  activities: Activity[];
  names: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const recent = activities.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          最近活动
        </CardTitle>
        <p className="text-xs text-muted-foreground">项目内最新的任务、评论与成员动态。</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">正在加载项目动态…</span>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-2" aria-hidden="true">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-col items-center gap-2 py-4 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">项目动态加载失败。</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无项目动态。
          </p>
        ) : (
          <ul className="space-y-3">
            {recent.map((activity) => {
              const description = describeActivity(activity, names);
              const actorName = activity.actor?.name ?? '系统';
              return (
                <li key={activity.id} className="flex items-start gap-2.5">
                  {activity.actor ? (
                    <UserAvatar
                      name={activity.actor.name}
                      src={activity.actor.avatarUrl}
                      color={avatarColor(activity.actor.userId)}
                      className="h-6 w-6 shrink-0 text-[10px]"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">{actorName}</span>{' '}
                      <span className="text-muted-foreground">{description.text}</span>
                    </p>
                    {description.meta ? (
                      <p className="text-xs text-muted-foreground">{description.meta}</p>
                    ) : null}
                  </div>
                  <time
                    className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
                    dateTime={activity.createdAt}
                  >
                    {formatDateTime(activity.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
