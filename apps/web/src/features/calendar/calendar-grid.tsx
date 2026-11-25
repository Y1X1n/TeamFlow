'use client';

import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { UserAvatar } from '@/components/ui/avatar';
import type { TaskCard } from '@/lib/types';
import { avatarColor, cn, initials } from '@/lib/utils';
import { PRIORITY_DOT_CLASSES, isTaskOverdue } from './calendar-utils';
import type { MonthCell } from './calendar-utils';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
const MAX_DAY_CHIPS = 3;

interface MonthGridProps {
  cells: MonthCell[];
  projectId: string;
  monthLabel: string;
  selectedKey: string;
  tasksByDay: Map<string, TaskCard[]>;
  onSelectDay: (dateKey: string) => void;
}

export function MonthGrid({
  cells,
  projectId,
  monthLabel,
  selectedKey,
  tasksByDay,
  onSelectDay,
}: MonthGridProps) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <div className="min-w-[640px]" role="group" aria-label={`${monthLabel}任务日历`}>
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={label}
              className={cn(
                'border-b bg-muted/40 px-1 py-2 text-center text-[11px] font-medium text-muted-foreground sm:text-xs',
                index >= 5 && 'text-muted-foreground/70',
              )}
            >
              {label}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((cell, dayIndex) => (
              <DayCell
                key={cell.dateKey}
                cell={cell}
                projectId={projectId}
                selected={selectedKey === cell.dateKey}
                tasks={tasksByDay.get(cell.dateKey) ?? []}
                isLastRow={weekIndex === 5}
                isLastColumn={dayIndex === 6}
                onSelectDay={onSelectDay}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({
  cell,
  projectId,
  selected,
  tasks,
  isLastRow,
  isLastColumn,
  onSelectDay,
}: {
  cell: MonthCell;
  projectId: string;
  selected: boolean;
  tasks: TaskCard[];
  isLastRow: boolean;
  isLastColumn: boolean;
  onSelectDay: (dateKey: string) => void;
}) {
  const visibleTasks = tasks.slice(0, MAX_DAY_CHIPS);
  const hiddenCount = tasks.length - visibleTasks.length;

  const handleCellClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('a,button')) return;
    onSelectDay(cell.dateKey);
  };

  return (
    <div
      onClick={handleCellClick}
      className={cn(
        'relative flex h-28 cursor-pointer flex-col overflow-hidden p-1 transition-colors hover:bg-muted/50 sm:h-32 sm:p-1.5',
        !isLastColumn && 'border-r',
        !isLastRow && 'border-b',
        cell.inCurrentMonth ? 'bg-card' : 'bg-muted/30',
        selected && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onSelectDay(cell.dateKey)}
          aria-pressed={selected}
          aria-current={cell.isToday ? 'date' : undefined}
          aria-label={`选择 ${cell.dateKey}${cell.isToday ? '（今天）' : ''}${
            tasks.length > 0 ? `，${tasks.length} 个任务` : ''
          }`}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            cell.isToday
              ? 'bg-primary font-semibold text-primary-foreground'
              : cell.inCurrentMonth
                ? 'text-foreground hover:bg-accent'
                : 'text-muted-foreground',
            selected && !cell.isToday && 'bg-primary/10 font-semibold text-primary',
          )}
        >
          {cell.dayNumber}
        </button>
        {cell.isToday ? (
          <span
            className="hidden text-[10px] font-medium text-primary sm:inline"
            aria-hidden="true"
          >
            今天
          </span>
        ) : null}
      </div>

      <div className="mt-1 min-h-0 flex-1 space-y-0.5">
        {visibleTasks.map((task) => (
          <TaskChip key={task.id} task={task} projectId={projectId} muted={!cell.inCurrentMonth} />
        ))}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => onSelectDay(cell.dateKey)}
            aria-label={`选择 ${cell.dateKey} 查看其余 ${hiddenCount} 个任务`}
            className="block min-h-6 w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{hiddenCount}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TaskChip({
  task,
  projectId,
  muted,
}: {
  task: TaskCard;
  projectId: string;
  muted: boolean;
}) {
  const overdue = isTaskOverdue(task);
  const completed = task.completedAt !== null;
  const assignee = task.assignee;

  return (
    <Link
      href={`/projects/${projectId}?task=${encodeURIComponent(task.id)}`}
      aria-label={`${task.title}，${TASK_PRIORITY_LABELS[task.priority]}优先级${
        overdue ? '，已逾期' : ''
      }${completed ? '，已完成' : ''}`}
      className={cn(
        'flex h-6 items-center gap-1 rounded px-1 text-[10px] leading-none transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[11px]',
        muted ? 'text-muted-foreground' : 'text-foreground',
        overdue && 'font-medium text-destructive',
        completed && 'text-muted-foreground line-through',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          overdue ? 'bg-destructive' : PRIORITY_DOT_CLASSES[task.priority],
          completed && 'opacity-50',
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {assignee ? (
        <>
          <span
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-medium text-white sm:hidden',
              avatarColor(assignee.userId),
            )}
            aria-hidden="true"
          >
            {initials(assignee.name).slice(0, 1)}
          </span>
          <UserAvatar
            name={assignee.name}
            src={assignee.avatarUrl}
            color={avatarColor(assignee.userId)}
            className="hidden h-4 w-4 shrink-0 sm:flex"
          />
        </>
      ) : null}
    </Link>
  );
}
