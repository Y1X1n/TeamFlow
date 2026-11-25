'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Link2, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BoardColumn, TaskCard, TaskDependencyRef, TaskDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from './task-utils';

interface TaskDependenciesProps {
  taskId: string;
  projectId: string;
  blockedBy: TaskDependencyRef[];
  blocking: TaskDependencyRef[];
  tasks: TaskCard[];
  columns: BoardColumn[];
  canUpdate: boolean;
  archived: boolean;
}

interface DependencySummary {
  blockedBy: TaskDependencyRef[];
  blocking: TaskDependencyRef[];
}

export function TaskDependencies({
  taskId,
  projectId,
  blockedBy,
  blocking,
  tasks,
  columns,
  canUpdate,
  archived,
}: TaskDependenciesProps) {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const blockerIds = new Set(blockedBy.map((dependency) => dependency.taskId));
  const columnNames = new Map(columns.map((column) => [column.id, column.name]));
  const candidates = tasks
    .filter((task) => task.id !== taskId && !blockerIds.has(task.id) && !task.completedAt)
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'));
  const pendingBlockers = blockedBy.filter((dependency) => !dependency.completed);
  const pendingBlocking = blocking.filter((dependency) => !dependency.completed);

  function applySummary(summary: DependencySummary) {
    queryClient.setQueryData<TaskDetail>(queryKeys.task(taskId), (previous) =>
      previous
        ? {
            ...previous,
            blockedBy: summary.blockedBy,
            blocking: summary.blocking,
            blockedByCount: summary.blockedBy.filter((dependency) => !dependency.completed).length,
            blockingCount: summary.blocking.filter((dependency) => !dependency.completed).length,
          }
        : previous,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
  }

  const addDependency = useMutation<DependencySummary, Error, string>({
    mutationFn: (blockedByTaskId) =>
      api<DependencySummary>(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: { blockedByTaskId },
      }),
    onSuccess: (summary) => {
      setSelectedTaskId('');
      applySummary(summary);
      toast.success('依赖已添加，完成该任务前需先完成阻塞任务');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeDependency = useMutation<
    DependencySummary & { removed: boolean },
    Error,
    TaskDependencyRef
  >({
    mutationFn: (dependency) =>
      api<DependencySummary & { removed: boolean }>(
        `/tasks/${taskId}/dependencies/${dependency.taskId}`,
        { method: 'DELETE' },
      ),
    onSuccess: (summary, dependency) => {
      applySummary(summary);
      if (summary.removed) toast.success(`已移除对「${dependency.title}」的依赖`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <section aria-labelledby="dependencies-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="dependencies-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          依赖
          <span className="text-xs font-normal text-muted-foreground">
            {blockedBy.length > 0 ? `${blockedBy.length} 个` : '无'}
          </span>
          {pendingBlockers.length > 0 ? (
            <Badge variant="warning">{pendingBlockers.length} 个未完成</Badge>
          ) : blockedBy.length > 0 ? (
            <Badge variant="muted">均已满足</Badge>
          ) : null}
        </h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        存在未完成依赖时，任务不能被标记为完成；强制完成会在看板上二次确认。
      </p>

      {blockedBy.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          暂无阻塞依赖。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {blockedBy.map((dependency) => {
            const pending =
              removeDependency.isPending &&
              removeDependency.variables?.taskId === dependency.taskId;
            return (
              <li
                key={dependency.taskId}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                {dependency.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Link2 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{dependency.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dependency.columnName} · {dependency.completed ? '已完成' : '未完成'}
                  </p>
                </div>
                <Badge variant={dependency.completed ? 'muted' : 'warning'}>
                  {dependency.completed ? '已满足' : '阻塞中'}
                </Badge>
                {canUpdate && !archived ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`移除对「${dependency.title}」的依赖`}
                    disabled={pending}
                    onClick={() => removeDependency.mutate(dependency)}
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canUpdate && !archived && candidates.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="h-8 flex-1" aria-label="选择要等待完成的任务">
              <SelectValue placeholder="选择阻塞任务" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {columnNames.get(task.columnId) ?? ''}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={!selectedTaskId || addDependency.isPending}
            onClick={() => addDependency.mutate(selectedTaskId)}
          >
            {addDependency.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            添加依赖
          </Button>
        </div>
      ) : canUpdate && !archived && blockedBy.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">没有可添加的依赖任务。</p>
      ) : null}

      {blocking.length > 0 ? (
        <p
          className={cn(
            'mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
            pendingBlocking.length > 0 && 'text-amber-700',
          )}
        >
          该任务正在阻塞 {pendingBlocking.length} 个未完成任务
          {blocking.length > 0
            ? `：${blocking
                .slice(0, 3)
                .map((dependency) => `「${dependency.title}」`)
                .join('、')}${blocking.length > 3 ? ' 等' : ''}`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
