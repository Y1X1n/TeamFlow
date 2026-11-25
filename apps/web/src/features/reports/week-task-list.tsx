'use client';

import { AlertTriangle, CheckCircle2, Lock, Timer } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { WeekTaskRef } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';

type WeekTaskTone = 'default' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<WeekTaskTone, { box: string; icon: string }> = {
  default: { box: 'border-border', icon: 'text-muted-foreground' },
  success: { box: 'border-emerald-200/70', icon: 'text-emerald-600' },
  warning: { box: 'border-amber-200/70', icon: 'text-amber-600' },
  danger: { box: 'border-rose-200/70', icon: 'text-rose-600' },
};

function TaskMeta({ task }: { task: WeekTaskRef }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>{task.columnName}</span>
      <span>{task.assigneeName ?? '未指派'}</span>
      {task.dueDate ? <span>截止 {formatDateTime(task.dueDate)}</span> : null}
      {task.completedAt ? <span>完成于 {formatDateTime(task.completedAt)}</span> : null}
      {task.reason ? (
        <Badge variant={task.reason.includes('逾期') ? 'destructive' : 'warning'}>
          {task.reason}
        </Badge>
      ) : task.blockedByCount > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-amber-700">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {task.blockedByCount} 个依赖
        </span>
      ) : null}
    </div>
  );
}

export function WeekTaskList({
  title,
  tasks,
  emptyText,
  projectId,
  tone = 'default',
  max = 4,
  icon,
}: {
  title: string;
  tasks: WeekTaskRef[];
  emptyText: string;
  projectId: string;
  tone?: WeekTaskTone;
  max?: number;
  icon?: 'check' | 'timer' | 'alert';
}) {
  const Icon = icon === 'check' ? CheckCircle2 : icon === 'alert' ? AlertTriangle : Timer;
  const styles = TONE_STYLES[tone];
  const shown = tasks.slice(0, max);
  const hidden = tasks.length - shown.length;

  return (
    <section className={cn('rounded-lg border p-3.5', styles.box)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className={cn('h-4 w-4', styles.icon)} aria-hidden="true" />
          {title}
        </h4>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {shown.map((task) => (
            <li key={task.taskId}>
              <Link
                href={`/projects/${projectId}?task=${encodeURIComponent(task.taskId)}`}
                className="block truncate rounded-sm text-sm text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {task.title}
              </Link>
              <TaskMeta task={task} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">还有 {hidden} 个任务未展示</p>
      ) : null}
    </section>
  );
}
