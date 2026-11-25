'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ListTodo, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { MyTask } from '@/lib/types';
import { cn, formatDateTime, isOverdue } from '@/lib/utils';

const STATUS_TABS = [
  { value: 'open', label: '待处理' },
  { value: 'overdue', label: '已逾期' },
  { value: 'done', label: '已完成' },
] as const;

type MyTaskStatus = (typeof STATUS_TABS)[number]['value'];

const EMPTY_TEXT: Record<MyTaskStatus, string> = {
  open: '暂无待处理任务，享受片刻轻松。',
  overdue: '没有逾期任务，节奏把握得不错。',
  done: '还没有完成的任务，去推进第一个吧。',
};

const EMPTY_HINT: Record<MyTaskStatus, string> = {
  open: '有新任务指派给你时，会自动出现在这里。',
  overdue: '截止时间已过但仍未完成的任务会集中显示在这里。',
  done: '完成的任务会保留记录，方便回顾本周产出。',
};

interface ProjectGroup {
  project: MyTask['project'];
  tasks: MyTask[];
}

function groupByProject(tasks: MyTask[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const task of tasks) {
    const existing = groups.get(task.project.id);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(task.project.id, { project: task.project, tasks: [task] });
    }
  }
  return [...groups.values()];
}

function dueText(task: MyTask): string {
  if (task.completedAt) return `完成于 ${formatDateTime(task.completedAt)}`;
  if (!task.dueDate) return '无截止时间';
  return `截止 ${formatDateTime(task.dueDate)}`;
}

export function MyTasksPage() {
  const [status, setStatus] = useState<MyTaskStatus>('open');

  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: queryKeys.myTasks(status),
    queryFn: () => api<{ items: MyTask[] }>(`/users/me/tasks?status=${status}&limit=100`),
  });

  const tasks = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupByProject(tasks), [tasks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            跨项目汇总分配给你的任务，按状态与项目分组查看。
          </p>
        </div>
        {status === 'overdue' ? (
          <span className="text-xs text-muted-foreground">逾期任务会同时出现在待处理中。</span>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="任务状态"
        className="inline-flex rounded-lg border bg-muted/50 p-0.5"
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              status === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={`${STATUS_TABS.find((tab) => tab.value === status)?.label ?? ''}任务`}
      >
        {isPending ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only">正在加载任务…</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 2 }, (_, row) => (
                    <div key={row} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="ml-auto h-5 w-12 rounded-full" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center"
          >
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {error instanceof ApiError ? error.message : '任务加载失败，请稍后重试。'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ListTodo className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">{EMPTY_TEXT[status]}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{EMPTY_HINT[status]}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/">返回工作台</Link>
            </Button>
          </Card>
        ) : (
          <div className={cn('space-y-4', isFetching && 'opacity-70 transition-opacity')}>
            {groups.map((group) => (
              <Card key={group.project.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: group.project.color }}
                      aria-hidden="true"
                    />
                    <Link
                      href={`/projects/${group.project.id}`}
                      className="truncate text-sm font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {group.project.name}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.tasks.length} 项任务</span>
                </div>
                <ul className="divide-y divide-border">
                  {group.tasks.map((task) => {
                    const overdue = isOverdue(task.dueDate, task.completedAt);
                    return (
                      <li key={task.id}>
                        <Link
                          href={`/projects/${task.project.id}?task=${task.id}`}
                          className="flex flex-col gap-1.5 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: task.project.color }}
                              aria-hidden="true"
                            />
                            <span className="truncate text-sm font-medium">{task.title}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <PriorityBadge priority={task.priority} />
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-xs',
                                overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                              )}
                            >
                              {overdue ? (
                                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : null}
                              {overdue ? `已逾期 · ${dueText(task)}` : dueText(task)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
