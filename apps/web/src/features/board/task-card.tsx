'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  GitBranch,
  GripVertical,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Repeat,
  UserPlus,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { TASK_PRIORITY_LABELS, TASK_RECURRENCE_LABELS } from '@teamflow/shared/enums';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { avatarColor, cn, formatDateTime, isOverdue } from '@/lib/utils';
import type { TaskCard } from '@/lib/types';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import { staleTaskDays } from '@/features/tasks/task-age';
import { TaskLabelBadge } from '@/features/tasks/task-label';
import { formatEstimateShort } from '@/features/tasks/task-utils';

interface TaskCardViewProps {
  task: TaskCard;
  onOpen?: (taskId: string) => void;
  dragHandle?: ReactNode;
  actions?: ReactNode;
  lockedByName?: string;
  overlay?: boolean;
  selectable?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  onToggleSelected?: (selected: boolean) => void;
}

export function TaskCardView({
  task,
  onOpen,
  dragHandle,
  actions,
  lockedByName,
  overlay,
  selectable,
  selected,
  selectionDisabled,
  onToggleSelected,
}: TaskCardViewProps) {
  const overdue = isOverdue(task.dueDate, task.completedAt);
  const staleDays = staleTaskDays(task.updatedAt, task.completedAt);
  const estimateLabel = formatEstimateShort(task.estimateMinutes);
  const actualLabel = formatEstimateShort(task.actualMinutes);
  const recurring = task.recurrence !== 'NONE';
  const labels = task.labels.slice(0, 3);
  const extraLabels = task.labels.length - labels.length;
  const a11yParts = [task.title, `${TASK_PRIORITY_LABELS[task.priority]}优先级`];
  if (estimateLabel) a11yParts.push(`预计 ${estimateLabel}`);
  if (actualLabel) a11yParts.push(`实际 ${actualLabel}`);
  if (recurring) a11yParts.push(`重复：${TASK_RECURRENCE_LABELS[task.recurrence]}`);
  a11yParts.push(task.assignee ? `负责人 ${task.assignee.name}` : '未指派');
  if (staleDays !== null) a11yParts.push(`已 ${staleDays} 天未更新`);
  if (task.blockedByCount > 0) a11yParts.push(`被 ${task.blockedByCount} 个任务阻塞`);
  if (task.completedAt) a11yParts.push('已完成');
  const subtaskPercent =
    task.subtaskTotal > 0 ? Math.round((task.subtaskDone / task.subtaskTotal) * 100) : 0;
  const subtasksComplete = task.subtaskTotal > 0 && task.subtaskDone >= task.subtaskTotal;

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {estimateLabel ? (
          <Badge
            variant="outline"
            className="gap-0.5 px-1.5 py-0 text-[10px] font-normal"
            title={`预计工时 ${estimateLabel}`}
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            预计 {estimateLabel}
          </Badge>
        ) : null}
        {actualLabel ? (
          <Badge
            variant="outline"
            className="gap-0.5 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            title={`实际工时 ${actualLabel}`}
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            实际 {actualLabel}
          </Badge>
        ) : null}
        {recurring ? (
          <Badge
            variant="outline"
            className="gap-0.5 px-1.5 py-0 text-[10px] font-normal"
            title={`重复：${TASK_RECURRENCE_LABELS[task.recurrence]}`}
          >
            <Repeat className="h-3 w-3" aria-hidden="true" />
            {TASK_RECURRENCE_LABELS[task.recurrence]}
          </Badge>
        ) : null}
        {task.completedAt ? (
          <span className="inline-flex items-center text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">已完成</span>
          </span>
        ) : null}
        {task.blockedByCount > 0 ? (
          <Badge
            variant="warning"
            className="gap-0.5 px-1.5 py-0 text-[10px] font-normal"
            title={`被 ${task.blockedByCount} 个未完成任务阻塞`}
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            阻塞 {task.blockedByCount}
          </Badge>
        ) : null}
        {staleDays !== null ? (
          <Badge
            variant="outline"
            className="gap-0.5 whitespace-nowrap border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700"
            title={`任务已 ${staleDays} 天未更新，建议检查进度`}
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {staleDays} 天未更新
          </Badge>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1.5 line-clamp-2 text-sm font-medium leading-5',
          task.completedAt && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </p>
      {labels.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {labels.map((label) => (
            <TaskLabelBadge key={label} label={label} />
          ))}
          {extraLabels > 0 ? (
            <span className="text-[10px] text-muted-foreground">+{extraLabels}</span>
          ) : null}
        </div>
      ) : null}
      {task.subtaskTotal > 0 ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>子任务</span>
            <span className="tabular-nums">
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          </div>
          <div
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`子任务进度 ${task.subtaskDone}/${task.subtaskTotal}`}
            aria-valuemin={0}
            aria-valuemax={task.subtaskTotal}
            aria-valuenow={task.subtaskDone}
          >
            <div
              className={cn(
                'h-full rounded-full',
                subtasksComplete ? 'bg-emerald-500' : 'bg-primary/70',
              )}
              style={{ width: `${subtaskPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.assignee ? (
            <>
              <UserAvatar
                name={task.assignee.name}
                src={task.assignee.avatarUrl}
                color={avatarColor(task.assignee.userId)}
                className="h-5 w-5"
              />
              <span className="truncate">{task.assignee.name}</span>
            </>
          ) : (
            <span>未指派</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.dueDate ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5',
                overdue && 'font-medium text-destructive',
              )}
              title={overdue ? '已逾期' : '截止时间'}
            >
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {formatDateTime(task.dueDate)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-0.5" title="评论数">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">评论</span>
            {task.commentCount}
          </span>
          <span className="inline-flex items-center gap-0.5" title="附件数">
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">附件</span>
            {task.attachmentCount}
          </span>
          {task.blockingCount > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 text-amber-700"
              title={`正在阻塞 ${task.blockingCount} 个任务`}
            >
              <GitBranch className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">阻塞下游任务</span>
              {task.blockingCount}
            </span>
          ) : null}
        </div>
      </div>
      {lockedByName ? (
        <p className="mt-2 rounded bg-amber-50 px-1.5 py-1 text-[11px] text-amber-700">
          {lockedByName} 正在拖动此任务
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-[box-shadow,border-color] duration-150 ease-out',
        overlay ? 'w-80 rotate-2 shadow-xl' : 'hover:border-primary/20 hover:shadow-md',
        selected && 'border-primary/50 ring-1 ring-primary/20',
      )}
    >
      <div className="flex items-start gap-2">
        {selectable ? (
          <Checkbox
            checked={Boolean(selected)}
            onCheckedChange={(checked) => onToggleSelected?.(checked === true)}
            disabled={selectionDisabled}
            aria-label={`选择任务：${task.title}`}
            className="mt-0.5 shrink-0"
          />
        ) : null}
        {onOpen ? (
          <button
            type="button"
            onClick={() => {
              if (selectable) onToggleSelected?.(!selected);
              else onOpen(task.id);
            }}
            disabled={selectable && selectionDisabled}
            aria-pressed={selectable ? Boolean(selected) : undefined}
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={
              selectable
                ? `${selected ? '取消选择' : '选择'}任务：${task.title}`
                : `打开任务：${a11yParts.join('，')}`
            }
          >
            {body}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{body}</div>
        )}
        {actions}
        {dragHandle}
      </div>
    </div>
  );
}

interface SortableTaskCardProps {
  task: TaskCard;
  canMove: boolean;
  canAssign: boolean;
  canCreate: boolean;
  currentUserId: string | null;
  nextColumn: { id: string; name: string } | null;
  lockedByName?: string;
  claimPending: boolean;
  movePending: boolean;
  duplicatePending: boolean;
  selectable?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  onToggleSelected?: (taskId: string, selected: boolean) => void;
  onOpen: (taskId: string) => void;
  onClaim: (task: TaskCard) => void;
  onMove: (task: TaskCard, target: { id: string; name: string }) => void;
  onDuplicate: (task: TaskCard) => void;
}

export function SortableTaskCard({
  task,
  canMove,
  canAssign,
  canCreate,
  currentUserId,
  nextColumn,
  lockedByName,
  claimPending,
  movePending,
  duplicatePending,
  selectable,
  selected,
  selectionDisabled,
  onToggleSelected,
  onOpen,
  onClaim,
  onMove,
  onDuplicate,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', taskId: task.id, columnId: task.columnId, title: task.title },
    disabled: !canMove || Boolean(lockedByName) || Boolean(selectable),
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const showClaim =
    canAssign && Boolean(currentUserId) && task.assignee?.userId !== currentUserId;
  const showMove = canMove && nextColumn !== null;
  const showDuplicate = canCreate;
  const hasActions = showClaim || showMove || showDuplicate;

  const actions = hasActions ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`任务快捷操作：${task.title}`}
          className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity before:absolute before:-inset-1 before:content-[''] hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:opacity-100 group-hover/task:opacity-100 md:h-auto md:w-auto md:opacity-60"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showClaim ? (
          <DropdownMenuItem disabled={claimPending || movePending} onSelect={() => onClaim(task)}>
            {claimPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            认领给我
          </DropdownMenuItem>
        ) : null}
        {showMove && nextColumn ? (
          <DropdownMenuItem
            disabled={movePending || claimPending}
            onSelect={() => onMove(task, nextColumn)}
          >
            {movePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            移到「{nextColumn.name}」
          </DropdownMenuItem>
        ) : null}
        {showDuplicate ? (
          <DropdownMenuItem
            disabled={duplicatePending || claimPending || movePending}
            onSelect={() => onDuplicate(task)}
          >
            {duplicatePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            复制任务
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  const dragHandle = canMove ? (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      disabled={Boolean(lockedByName)}
      aria-label={lockedByName ? `${lockedByName} 正在拖动此任务` : `拖动任务：${task.title}`}
      className="mt-0.5 flex h-10 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 group-hover/task:opacity-100 md:h-auto md:w-auto"
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button>
  ) : undefined;

  return (
    <div ref={setNodeRef} style={style} className="group/task">
      <TaskCardView
        task={task}
        onOpen={onOpen}
        dragHandle={selectable ? undefined : dragHandle}
        actions={selectable ? undefined : actions}
        lockedByName={lockedByName}
        selectable={selectable}
        selected={selected}
        selectionDisabled={selectionDisabled}
        onToggleSelected={
          selectable && onToggleSelected
            ? (nextSelected) => onToggleSelected(task.id, nextSelected)
            : undefined
        }
      />
    </div>
  );
}

export function TaskCardOverlay({ task }: { task: TaskCard }) {
  return <TaskCardView task={task} overlay />;
}
