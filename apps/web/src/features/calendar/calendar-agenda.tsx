'use client';

import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import Link from 'next/link';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import type { TaskCard } from '@/lib/types';
import { avatarColor, cn } from '@/lib/utils';
import { PRIORITY_DOT_CLASSES, formatDateKeyLabel, isTaskOverdue } from './calendar-utils';

const MAX_NO_DUE_TASKS = 10;
const MAX_AGENDA_TASKS = 20;

export function SelectedDayAgenda({
  projectId,
  dateKey,
  tasks,
  columnNames,
}: {
  projectId: string;
  dateKey: string;
  tasks: TaskCard[];
  columnNames: Map<string, string>;
}) {
  const visibleTasks = tasks.slice(0, MAX_AGENDA_TASKS);
  const hiddenCount = tasks.length - visibleTasks.length;

  return (
    <Card role="region" aria-labelledby={`calendar-agenda-${dateKey}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id={`calendar-agenda-${dateKey}`} className="text-base">
            当日截止任务
          </CardTitle>
          <Badge variant="muted">{tasks.length} 项</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateKeyLabel(dateKey)} · 点击任务可在看板抽屉中查看详情。
        </p>
        <p className="sr-only" aria-live="polite">
          已选择 {formatDateKeyLabel(dateKey)}，共 {tasks.length} 项到期任务。
        </p>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            这一天没有到期的任务。
          </p>
        ) : (
          <>
            <ul className="-mx-2 divide-y">
              {visibleTasks.map((task) => (
                <AgendaTaskItem
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  columnName={columnNames.get(task.columnId) ?? '未知列'}
                />
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                另有 {hiddenCount} 项未显示，请在看板中查看全部任务。
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaTaskItem({
  task,
  projectId,
  columnName,
}: {
  task: TaskCard;
  projectId: string;
  columnName: string;
}) {
  const completed = task.completedAt !== null;
  const overdue = isTaskOverdue(task);

  return (
    <li>
      <Link
        href={`/projects/${projectId}?task=${encodeURIComponent(task.id)}`}
        className="group flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            overdue ? 'bg-destructive' : PRIORITY_DOT_CLASSES[task.priority],
            completed && 'opacity-50',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'text-sm font-medium group-hover:underline',
                completed && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </span>
            <PriorityBadge priority={task.priority} />
            {overdue ? (
              <Badge variant="destructive" className="px-2 py-0 text-[11px]">
                已逾期
              </Badge>
            ) : null}
            {completed ? (
              <Badge variant="success" className="px-2 py-0 text-[11px]">
                已完成
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {task.assignee ? (
                <UserAvatar
                  name={task.assignee.name}
                  src={task.assignee.avatarUrl}
                  color={avatarColor(task.assignee.userId)}
                  className="h-4 w-4"
                />
              ) : null}
              {task.assignee?.name ?? '未指派'}
            </span>
            <span>{columnName}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function NoDueTaskList({ projectId, tasks }: { projectId: string; tasks: TaskCard[] }) {
  const visibleTasks = tasks.slice(0, MAX_NO_DUE_TASKS);
  const hiddenCount = tasks.length - visibleTasks.length;

  return (
    <Card role="region" aria-labelledby="calendar-no-due">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="calendar-no-due" className="text-base">
            无截止时间
          </CardTitle>
          <Badge variant="muted">{tasks.length} 项</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          未完成任务中暂无未设置截止时间的任务，设置后会出现在日历中。
        </p>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无未设置截止时间的未完成任务。
          </p>
        ) : (
          <>
            <ul className="-mx-2 divide-y">
              {visibleTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/projects/${projectId}?task=${encodeURIComponent(task.id)}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        PRIORITY_DOT_CLASSES[task.priority],
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {TASK_PRIORITY_LABELS[task.priority]}
                    </span>
                    {task.assignee ? (
                      <UserAvatar
                        name={task.assignee.name}
                        src={task.assignee.avatarUrl}
                        color={avatarColor(task.assignee.userId)}
                        className="h-5 w-5 shrink-0"
                      />
                    ) : (
                      <span className="shrink-0 text-[11px] text-muted-foreground">未指派</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                另有 {hiddenCount} 项未显示，请在看板中查看全部任务。
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
