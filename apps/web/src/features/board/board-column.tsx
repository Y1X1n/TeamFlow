'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CheckCircle2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BoardColumn, TaskCard } from '@/lib/types';
import { COLUMN_DROPPABLE_PREFIX, columnDotClass } from './board-utils';
import { QuickAddTask } from './quick-add-task';
import { SortableTaskCard } from './task-card';

interface BoardColumnViewProps {
  column: BoardColumn;
  colorIndex: number;
  tasks: TaskCard[];
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
  onToggleQuickAdd: (columnId: string) => void;
  onCloseQuickAdd: () => void;
  onOpenTask: (taskId: string) => void;
  onClaimTask: (task: TaskCard) => void;
  onMoveTask: (task: TaskCard, target: { id: string; name: string }) => void;
  onDuplicateTask: (task: TaskCard) => void;
}

export function BoardColumnView({
  column,
  colorIndex,
  tasks,
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
  onToggleQuickAdd,
  onCloseQuickAdd,
  onOpenTask,
  onClaimTask,
  onMoveTask,
  onDuplicateTask,
}: BoardColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_DROPPABLE_PREFIX}${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  return (
    <section
      aria-label={`列：${column.name}`}
      className="flex max-h-[calc(100vh_-_15rem)] w-80 shrink-0 flex-col rounded-xl border bg-muted/30"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
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
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              canMove={canMove}
              canAssign={canAssign}
              canCreate={canCreate}
              currentUserId={currentUserId}
              nextColumn={nextColumn}
              lockedByName={lockedTaskNames[task.id]}
              claimPending={pendingClaimTaskId === task.id}
              movePending={pendingMoveTaskId === task.id}
              duplicatePending={pendingDuplicateTaskId === task.id}
              onOpen={onOpenTask}
              onClaim={onClaimTask}
              onMove={onMoveTask}
              onDuplicate={onDuplicateTask}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <div
            className={cn(
              'flex min-h-[96px] items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground',
              isOver && 'border-primary text-primary',
            )}
          >
            拖拽任务到此处
          </div>
        ) : null}
        <div className="h-2" aria-hidden="true" />
      </div>
    </section>
  );
}
