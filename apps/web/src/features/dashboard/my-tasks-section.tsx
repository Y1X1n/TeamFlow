'use client';

import { useQuery } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { TaskCard } from '@/lib/types';
import { cn, formatDateTime, isOverdue } from '@/lib/utils';
import { QueryError } from './query-error';

export interface MyTask extends TaskCard {
  project: { id: string; name: string; color: string };
}

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

const PRIORITY_VARIANTS: Record<TaskPriority, BadgeProps['variant']> = {
  LOW: 'muted',
  MEDIUM: 'default',
  HIGH: 'warning',
  URGENT: 'destructive',
};

function dueLabel(task: MyTask): string {
  if (task.completedAt) return `完成于 ${formatDateTime(task.completedAt)}`;
  if (!task.dueDate) return '无截止时间';
  return formatDateTime(task.dueDate);
}

export function MyTasksSection() {
  const [status, setStatus] = useState<MyTaskStatus>('open');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.myTasks(status, 50),
    queryFn: () => api<{ items: MyTask[] }>(`/users/me/tasks?status=${status}&limit=50`),
  });

  const tasks = data?.items ?? [];

  return (
    <section aria-labelledby="my-tasks-heading" className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div>
          <h2 id="my-tasks-heading" className="text-lg font-semibold">
            分配给我的任务
          </h2>
          <p className="text-xs text-muted-foreground">跨项目查看你的待办与截止时间。</p>
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
                'rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                status === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-2">
        {isPending ? (
          <div className="space-y-1 px-1 pb-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <QueryError
            className="m-2"
            message={error instanceof ApiError ? error.message : '任务加载失败，请稍后重试。'}
            onRetry={() => void refetch()}
          />
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <ListTodo className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{EMPTY_TEXT[status]}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.completedAt);
              return (
                <li key={task.id}>
                  <Link
                    href={`/projects/${task.project.id}?task=${task.id}`}
                    className="flex flex-col gap-1.5 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-2.5">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: task.project.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {task.project.name}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 pl-5 sm:shrink-0 sm:pl-0">
                      <Badge variant={PRIORITY_VARIANTS[task.priority]} className="shrink-0">
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </Badge>
                      <span
                        className={cn(
                          'shrink-0 text-right text-xs',
                          overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {overdue ? `已逾期 · ${dueLabel(task)}` : dueLabel(task)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
