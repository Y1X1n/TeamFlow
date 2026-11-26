'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  Announcements,
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { TaskPriority } from '@teamflow/shared/enums';
import { comparePositions } from '@teamflow/shared/fractional';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import type { BoardData, MemberSummary, TaskCard, TaskDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { BoardColumnView } from './board-column';
import { BoardHeader } from './board-header';
import { BoardToolbar } from './board-toolbar';
import { CreateTaskDialog } from './create-task-dialog';
import { TaskCardOverlay } from './task-card';
import { useBoardSync } from './hooks/use-board-sync';
import type { BoardGroupBy } from './board-grouping';
import {
  COLUMN_DROPPABLE_PREFIX,
  buildColumnTaskIds,
  columnIdFromOver,
  dropTargetTypeFromOver,
  resolveDrop,
} from './board-utils';
import type { DropResolution, DueFilter } from './board-utils';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { getErrorMessage } from '@/features/tasks/task-utils';

type CompletionIntent =
  | { kind: 'drag'; task: TaskCard; resolution: DropResolution; columnName: string }
  | { kind: 'next'; task: TaskCard; target: { id: string; name: string } };

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    '按空格或回车键拾起任务，使用方向键移动到目标位置，再按空格或回车键放下任务；按 Esc 键取消拖动。',
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    const taskCollision = pointerCollisions.find((collision) => {
      const container = args.droppableContainers.find(
        (item) => String(item.id) === String(collision.id),
      );
      const data: Record<string, unknown> | undefined = container?.data.current;
      return data?.type === 'task';
    });
    return taskCollision ? [taskCollision] : pointerCollisions;
  }
  return closestCorners(args);
};

function BoardPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">正在加载看板</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="w-80 shrink-0 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed p-10 text-center"
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold">看板加载失败</h1>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={onRetry}>
          重试
        </Button>
        <Button asChild variant="outline">
          <Link href="/">返回工作台</Link>
        </Button>
      </div>
    </div>
  );
}

export function BoardPage({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTaskId = searchParams.get('task');

  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [groupBy, setGroupBy] = useState<BoardGroupBy>('none');
  const [createOpen, setCreateOpen] = useState(false);
  const [quickAddColumnId, setQuickAddColumnId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completionIntent, setCompletionIntent] = useState<CompletionIntent | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  const { connectionStatus, presence, applyPositions } = useBoardSync({
    projectId,
    userId: user?.id ?? null,
    enabled: Boolean(user?.id),
    draggingTaskId: activeId,
    selectedTaskId,
  });

  const boardQuery = useQuery<BoardData, Error>({
    queryKey: queryKeys.board(projectId),
    queryFn: () => api<BoardData>(`/projects/${projectId}/board`),
    refetchInterval: connectionStatus === 'disconnected' ? 10_000 : false,
  });

  useEffect(() => {
    if (boardQuery.data) applyPositions();
  }, [boardQuery.data, applyPositions]);

  useEffect(
    () => () => {
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    },
    [],
  );

  const openTask = useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('task', taskId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeTask = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const board = boardQuery.data;
  const permissions = board?.myPermissions ?? [];
  const archived = board?.project.archived ?? false;
  const canMove = !archived && permissions.includes('task:move');
  const canCreate = !archived && permissions.includes('task:create');
  const canAssign =
    !archived && permissions.includes('task:update') && permissions.includes('task:assign');
  const currentUserId = user?.id ?? null;

  const columns = useMemo(
    () =>
      board
        ? [...board.columns].sort(
            (a, b) => comparePositions(a.position, b.position) || a.id.localeCompare(b.id),
          )
        : [],
    [board],
  );

  const tasks = useMemo(() => board?.tasks ?? [], [board]);
  const members = useMemo(() => board?.members ?? [], [board]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const membersById = useMemo(
    () => new Map<string, MemberSummary>(members.map((member) => [member.userId, member])),
    [members],
  );

  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    return tasks.filter((task) => {
      if (keyword && !task.title.toLowerCase().includes(keyword)) return false;
      if (assigneeFilter === 'unassigned') {
        if (task.assignee) return false;
      } else if (assigneeFilter !== 'all' && task.assignee?.userId !== assigneeFilter) {
        return false;
      }
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (dueFilter !== 'all') {
        const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
        const pending = due !== null && !task.completedAt;
        if (dueFilter === 'none' && due !== null) return false;
        if (dueFilter === 'overdue' && !(pending && due < now)) return false;
        if (
          dueFilter === 'today' &&
          !(pending && due >= startOfToday.getTime() && due <= endOfToday.getTime())
        )
          return false;
        if (dueFilter === 'week' && !(pending && due >= now && due <= weekEnd)) return false;
      }
      return true;
    });
  }, [tasks, search, assigneeFilter, priorityFilter, dueFilter]);

  const columnTaskIds = useMemo(
    () => buildColumnTaskIds(columns, filteredTasks, null),
    [columns, filteredTasks],
  );

  const tasksByColumn = useMemo(() => {
    const result: Record<string, TaskCard[]> = {};
    for (const column of columns) {
      const ids = columnTaskIds[column.id] ?? [];
      result[column.id] = ids.flatMap((id) => {
        const task = taskById.get(id);
        return task ? [task] : [];
      });
    }
    return result;
  }, [columns, columnTaskIds, taskById]);

  const lockedTaskNames = useMemo(() => {
    const result: Record<string, string> = {};
    for (const entry of presence) {
      if (!entry.draggingTaskId) continue;
      result[entry.draggingTaskId] = membersById.get(entry.userId)?.name ?? '其他成员';
    }
    return result;
  }, [presence, membersById]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const taskTitle = useCallback(
    (id: UniqueIdentifier) => taskById.get(String(id))?.title ?? '任务',
    [taskById],
  );

  const overLabel = useCallback(
    (id: UniqueIdentifier) => {
      const task = taskById.get(String(id));
      if (task) return `任务「${task.title}」`;
      const column = columns.find((item) => `${COLUMN_DROPPABLE_PREFIX}${item.id}` === String(id));
      return column ? `列「${column.name}」` : '目标位置';
    },
    [columns, taskById],
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) =>
        `已拾起任务「${taskTitle(active.id)}」，使用方向键移动，空格键放下，Esc 键取消。`,
      onDragOver: ({ active, over }) =>
        over
          ? `任务「${taskTitle(active.id)}」正处于${overLabel(over.id)}附近。`
          : `任务「${taskTitle(active.id)}」正在移动。`,
      onDragEnd: ({ active, over }) =>
        over
          ? `任务「${taskTitle(active.id)}」已放置在${overLabel(over.id)}附近。`
          : `任务「${taskTitle(active.id)}」已放下，位置未改变。`,
      onDragCancel: ({ active }) => `已取消拖动任务「${taskTitle(active.id)}」。`,
    }),
    [overLabel, taskTitle],
  );

  const claimTaskMutation = useMutation<TaskCard, Error, TaskCard>({
    mutationFn: (task) =>
      api<TaskCard>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: { assigneeId: currentUserId },
      }),
    onSuccess: (task) => {
      toast.success(`已认领任务「${task.title}」`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const moveNextMutation = useMutation<
    TaskCard,
    Error,
    { task: TaskCard; columnId: string; columnName: string; force?: boolean }
  >({
    mutationFn: ({ task, columnId, force }) =>
      api<TaskCard>(`/tasks/${task.id}/move`, {
        method: 'PATCH',
        body: { columnId, beforeTaskId: null, ...(force ? { force: true } : {}) },
      }),
    onSuccess: (task, variables) => {
      toast.success(`任务「${task.title}」已移到「${variables.columnName}」`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const duplicateTaskMutation = useMutation<TaskDetail, Error, TaskCard>({
    mutationFn: (task) => api<TaskDetail>(`/tasks/${task.id}/duplicate`, { method: 'POST' }),
    onSuccess: (copy) => {
      queryClient.setQueryData(queryKeys.task(copy.id), copy);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      toast.success(`已创建副本「${copy.title}」`, {
        action: { label: '打开', onClick: () => openTask(copy.id) },
      });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const pendingClaimTaskId = claimTaskMutation.isPending
    ? claimTaskMutation.variables?.id
    : undefined;
  const pendingMoveTaskId = moveNextMutation.isPending
    ? moveNextMutation.variables?.task.id
    : undefined;
  const pendingDuplicateTaskId = duplicateTaskMutation.isPending
    ? duplicateTaskMutation.variables?.id
    : undefined;

  const handleClaimTask = (task: TaskCard) => {
    if (!currentUserId) return;
    claimTaskMutation.mutate(task);
  };

  const handleMoveTask = (task: TaskCard, target: { id: string; name: string }) => {
    const targetColumn = columns.find((column) => column.id === target.id);
    if (targetColumn?.isDone && !task.completedAt && task.blockedByCount > 0) {
      setCompletionIntent({ kind: 'next', task, target });
      return;
    }
    moveNextMutation.mutate({ task, columnId: target.id, columnName: target.name });
  };

  const handleDuplicateTask = (task: TaskCard) => {
    duplicateTaskMutation.mutate(task);
  };

  const toggleQuickAdd = (columnId: string) => {
    setQuickAddColumnId((previous) => (previous === columnId ? null : columnId));
  };

  const handleGroupByChange = (value: BoardGroupBy) => {
    setGroupBy(value);
    setActiveId(null);
  };

  const applyMove = async (task: TaskCard, resolution: DropResolution, force = false) => {
    const boardKey = queryKeys.board(projectId);
    await queryClient.cancelQueries({ queryKey: boardKey });
    const snapshot = queryClient.getQueryData<BoardData>(boardKey);
    queryClient.setQueryData<BoardData>(boardKey, (previous) =>
      previous
        ? {
            ...previous,
            tasks: previous.tasks.map((item) =>
              item.id === task.id
                ? {
                    ...item,
                    columnId: resolution.columnId,
                    position: resolution.position,
                    completedAt: resolution.completedAt,
                    updatedAt: new Date().toISOString(),
                  }
                : item,
            ),
          }
        : previous,
    );
    try {
      const updated = await api<TaskCard>(`/tasks/${task.id}/move`, {
        method: 'PATCH',
        body: {
          columnId: resolution.columnId,
          beforeTaskId: resolution.beforeTaskId,
          ...(force ? { force: true } : {}),
        },
      });
      queryClient.setQueryData<BoardData>(boardKey, (previous) =>
        previous
          ? {
              ...previous,
              tasks: previous.tasks.map((item) => (item.id === updated.id ? updated : item)),
            }
          : previous,
      );
    } catch (error) {
      if (snapshot) queryClient.setQueryData(boardKey, snapshot);
      toast.error(getErrorMessage(error));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const task = taskById.get(id);
    if (!task || !canMove || groupBy !== 'none' || lockedTaskNames[id]) return;
    setActiveId(id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const id = String(event.active.id);
    const task = taskById.get(id);
    setActiveId(null);
    if (!task || !event.over || !canMove || groupBy !== 'none') return;
    const over = event.over;
    const overColumnId = columnIdFromOver(over, taskById);
    if (!overColumnId) return;

    const baseLists = buildColumnTaskIds(columns, filteredTasks, null);
    const targetList = baseLists[overColumnId] ?? [];
    let index = targetList.length;
    if (overColumnId === task.columnId) {
      index = Math.max(0, (baseLists[task.columnId] ?? []).indexOf(task.id));
    } else if (dropTargetTypeFromOver(over) === 'task') {
      const overIndex = targetList.indexOf(String(over.id));
      if (overIndex >= 0) index = overIndex;
    }

    const resolution = resolveDrop({
      activeTask: task,
      preview: { taskId: task.id, columnId: overColumnId, index },
      columns,
      tasks: filteredTasks,
      overId: String(over.id),
      overColumnId,
      overType: dropTargetTypeFromOver(over),
    });
    if (!resolution || resolution.unchanged) return;
    const targetColumn = columns.find((column) => column.id === resolution.columnId);
    if (targetColumn?.isDone && !task.completedAt && task.blockedByCount > 0) {
      const intent: CompletionIntent = {
        kind: 'drag',
        task,
        resolution,
        columnName: targetColumn.name,
      };
      // dnd-kit blocks document clicks for 50ms after drag end; open later so the
      // confirmation button cannot swallow the first click.
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        setCompletionIntent(intent);
      }, 80);
      return;
    }
    void applyMove(task, resolution);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeTask = activeId ? taskById.get(activeId) : undefined;

  if (boardQuery.isLoading) return <BoardPageSkeleton />;

  if (boardQuery.isError || !board) {
    return (
      <BoardErrorState
        message={boardQuery.error ? getErrorMessage(boardQuery.error) : '项目不存在或无权访问'}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh_-_8rem)] flex-col">
      <BoardHeader
        project={board.project}
        members={members}
        onlineUserIds={presence.map((entry) => entry.userId)}
        canCreateTask={canCreate}
        onCreateTask={() => setCreateOpen(true)}
      />

      {archived ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          该项目已归档，当前为只读模式，无法新建或修改任务。
        </div>
      ) : null}

      <BoardToolbar
        search={search}
        onSearchChange={setSearch}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        dueFilter={dueFilter}
        onDueFilterChange={setDueFilter}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
        members={members}
        totalCount={tasks.length}
        filteredCount={filteredTasks.length}
        canManageColumns={!archived && permissions.includes('board:manage')}
        projectId={projectId}
        connectionStatus={connectionStatus}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="mt-4 flex flex-1 items-start gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {columns.length === 0 ? (
            <div className="w-full rounded-xl border border-dashed p-10 text-center">
              <p className="text-sm font-medium">该项目还没有看板列</p>
              <p className="mt-1 text-xs text-muted-foreground">创建看板列后即可开始管理任务。</p>
              {!archived && permissions.includes('board:manage') ? (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/projects/${projectId}/settings`}>前往设置创建列</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            columns.map((column, index) => {
              const next = columns[index + 1];
              return (
                <BoardColumnView
                  key={column.id}
                  column={column}
                  colorIndex={index}
                  tasks={tasksByColumn[column.id] ?? []}
                  groupBy={groupBy}
                  membersById={membersById}
                  canMove={canMove && groupBy === 'none'}
                  canAssign={canAssign}
                  canCreate={canCreate}
                  currentUserId={currentUserId}
                  nextColumn={next ? { id: next.id, name: next.name } : null}
                  lockedTaskNames={lockedTaskNames}
                  pendingClaimTaskId={pendingClaimTaskId}
                  pendingMoveTaskId={pendingMoveTaskId}
                  pendingDuplicateTaskId={pendingDuplicateTaskId}
                  quickAddOpen={quickAddColumnId === column.id}
                  projectId={projectId}
                  onToggleQuickAdd={toggleQuickAdd}
                  onCloseQuickAdd={() => setQuickAddColumnId(null)}
                  onOpenTask={openTask}
                  onClaimTask={handleClaimTask}
                  onMoveTask={handleMoveTask}
                  onDuplicateTask={handleDuplicateTask}
                />
              );
            })
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        columns={columns}
        members={members}
      />

      <ConfirmDialog
        open={completionIntent !== null}
        onOpenChange={(open) => {
          if (!open) setCompletionIntent(null);
        }}
        title="任务仍有未完成依赖"
        description={
          completionIntent
            ? `任务「${completionIntent.task.title}」还有 ${completionIntent.task.blockedByCount} 个未完成依赖。强制完成会忽略这些依赖，可在任务详情中查看具体阻塞任务。`
            : ''
        }
        confirmLabel="仍要完成"
        destructive
        loading={completionIntent?.kind === 'next' && moveNextMutation.isPending}
        onConfirm={() => {
          const intent = completionIntent;
          if (!intent) return;
          if (intent.kind === 'drag') {
            void applyMove(intent.task, intent.resolution, true);
          } else {
            moveNextMutation.mutate({
              task: intent.task,
              columnId: intent.target.id,
              columnName: intent.target.name,
              force: true,
            });
          }
          setCompletionIntent(null);
        }}
      />

      {selectedTaskId ? (
        <TaskDrawer
          taskId={selectedTaskId}
          projectId={projectId}
          board={board}
          open
          onClose={closeTask}
          currentUserId={user?.id ?? ''}
        />
      ) : null}
    </div>
  );
}
