'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CheckCircle2, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { avatarColor, cn } from '@/lib/utils';
import type { BoardColumn, MemberSummary, TaskCard } from '@/lib/types';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import { TaskLabelBadge } from '@/features/tasks/task-label';
import { isTaskPriority } from '@/features/tasks/task-utils';
import { COLUMN_DROPPABLE_PREFIX, columnDotClass } from './board-utils';
import { groupTasksForColumn, UNLABELED_GROUP_KEY } from './board-grouping';
import type { BoardGroupBy, BoardTaskGroup } from './board-grouping';
import { QuickAddTask } from './quick-add-task';
import { SortableTaskCard } from './task-card';

interface BoardColumnViewProps {
  column: BoardColumn;
  domId?: string;
  colorIndex: number;
  tasks: TaskCard[];
  groupBy: BoardGroupBy;
  membersById: Map<string, MemberSummary>;
  canMove: boolean;
  canAssign: boolean;
  canCreate: boolean;
  currentUserId: string | null;
  nextColumn: { id: string; name: string } | null;
  lockedTaskNames: Record<string, string>;
  pendingClaimTaskId?: string;
  pendingMoveTaskId?: string;
  pendingDuplicateTaskId?: string;
  quickAddOpen: boolean;
  projectId: string;
  selectionMode: boolean;
  selectionDisabled?: boolean;
  selectedIds: Set<string>;
  onToggleQuickAdd: (columnId: string) => void;
  onCloseQuickAdd: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleSelected: (taskId: string, selected: boolean) => void;
  onClaimTask: (task: TaskCard) => void;
  onMoveTask: (task: TaskCard, target: { id: string; name: string }) => void;
  onDuplicateTask: (task: TaskCard) => void;
}

function BoardGroupHeader({
  group,
  groupBy,
}: {
  group: BoardTaskGroup;
  groupBy: Exclude<BoardGroupBy, 'none'>;
}) {
  const assignee = group.tasks[0]?.assignee ?? null;

  return (
    <div className="flex items-center gap-1.5 px-1">
      {groupBy === 'assignee' && assignee ? (
        <UserAvatar
          name={assignee.name}
          src={assignee.avatarUrl}
          color={avatarColor(assignee.userId)}
          className="h-5 w-5"
        />
      ) : null}
      {groupBy === 'priority' && isTaskPriority(group.key) ? (
        <PriorityBadge priority={group.key} />
      ) : null}
      {groupBy === 'label' ? (
        group.key === UNLABELED_GROUP_KEY ? (
          <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
            {group.label}
          </Badge>
        ) : (
          <TaskLabelBadge label={group.label} />
        )
      ) : null}
      {groupBy === 'assignee' ? (
        <span className="truncate text-xs font-medium text-muted-foreground">{group.label}</span>
      ) : null}
      <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px]">
        {group.tasks.length}
      </Badge>
    </div>
  );
}

export function BoardColumnView({
  column,
  domId,
  colorIndex,
  tasks,
  groupBy,
  membersById,
  canMove,
  canAssign,
  canCreate,
  currentUserId,
  nextColumn,
  lockedTaskNames,
  pendingClaimTaskId,
  pendingMoveTaskId,
  pendingDuplicateTaskId,
  quickAddOpen,
  projectId,
  selectionMode,
  selectionDisabled,
  selectedIds,
  onToggleQuickAdd,
  onCloseQuickAdd,
  onOpenTask,
  onToggleSelected,
  onClaimTask,
  onMoveTask,
  onDuplicateTask,
}: BoardColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_DROPPABLE_PREFIX}${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  const activeGroupBy = groupBy === 'none' ? null : groupBy;

  const groups = useMemo(
    () => (activeGroupBy ? groupTasksForColumn(tasks, activeGroupBy, membersById) : []),
    [activeGroupBy, tasks, membersById],
  );

  const sortableItems =
    activeGroupBy === null
      ? tasks.map((task) => task.id)
      : groups.flatMap((group) => group.tasks.map((task) => task.id));

  const renderTaskCard = (task: TaskCard, dragEnabled: boolean) => (
    <SortableTaskCard
      key={task.id}
      task={task}
      canMove={dragEnabled}
      canAssign={canAssign}
      canCreate={canCreate}
      currentUserId={currentUserId}
      nextColumn={nextColumn}
      lockedByName={lockedTaskNames[task.id]}
      claimPending={pendingClaimTaskId === task.id}
      movePending={pendingMoveTaskId === task.id}
      duplicatePending={pendingDuplicateTaskId === task.id}
      selectable={selectionMode}
      selected={selectedIds.has(task.id)}
      selectionDisabled={selectionDisabled}
      onToggleSelected={onToggleSelected}
      onOpen={onOpenTask}
      onClaim={onClaimTask}
      onMove={onMoveTask}
      onDuplicate={onDuplicateTask}
    />
  );

  return (
    <section
      id={domId}
      aria-label={`列：${column.name}`}
      className="flex max-h-[calc(100dvh_-_15rem)] w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border border-border/70 bg-muted/40 shadow-sm sm:w-80"
    >
      <header className="flex items-center gap-2 rounded-t-2xl border-b border-border/60 bg-background/50 px-3 py-2.5">
        <span
          className={cn('h-2.5 w-2.5 rounded-full', columnDotClass(colorIndex))}
          aria-hidden="true"
        />
        <h2 className="truncate text-sm font-semibold">{column.name}</h2>
        {column.isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="完成列" />
        ) : null}
        <Badge variant="muted" className="ml-auto px-2 py-0 text-[11px]">
          {tasks.length}
        </Badge>
        {canCreate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            aria-label={`在列「${column.name}」快速新建任务`}
            aria-expanded={quickAddOpen}
            title="快速新建任务"
            onClick={() => onToggleQuickAdd(column.id)}
          >
            <Plus
              className={cn('h-3.5 w-3.5 transition-transform', quickAddOpen && 'rotate-45')}
              aria-hidden="true"
            />
          </Button>
        ) : null}
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto p-2 transition-colors duration-150 scrollbar-thin',
          isOver && 'bg-accent/50',
        )}
      >
        {quickAddOpen ? (
          <QuickAddTask
            projectId={projectId}
            columnId={column.id}
            columnName={column.name}
            onClose={onCloseQuickAdd}
          />
        ) : null}
        <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
          {activeGroupBy === null
            ? tasks.map((task) => renderTaskCard(task, canMove))
            : groups.map((group) => (
                <div
                  key={group.key}
                  role="group"
                  aria-label={`${group.label}：${group.tasks.length} 个任务`}
                  className="space-y-2"
                >
                  <BoardGroupHeader group={group} groupBy={activeGroupBy} />
                  <div className="space-y-2">
                    {group.tasks.map((task) => renderTaskCard(task, false))}
                  </div>
                </div>
              ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <div
            className={cn(
              'flex min-h-[96px] items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground',
              isOver && activeGroupBy === null && 'border-primary text-primary',
            )}
          >
            {activeGroupBy ? '暂无任务' : '拖拽任务到此处'}
          </div>
        ) : null}
        <div className="h-2" aria-hidden="true" />
      </div>
    </section>
  );
}
