'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { SUBTASK_MAX_PER_TASK, SUBTASK_TITLE_MAX_LENGTH } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Subtask } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TaskAiDialog } from './task-ai-dialog';
import { getErrorMessage } from './task-utils';

interface TaskSubtasksProps {
  taskId: string;
  projectId: string;
  taskTitle: string;
  canUpdate: boolean;
  archived: boolean;
}

interface SubtasksResponse {
  items: Subtask[];
  progress: { total: number; done: number };
}

export function TaskSubtasks({
  taskId,
  projectId,
  taskTitle,
  canUpdate,
  archived,
}: TaskSubtasksProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Subtask | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const subtasksQuery = useQuery<SubtasksResponse, Error>({
    queryKey: queryKeys.subtasks(taskId),
    queryFn: () => api<SubtasksResponse>(`/tasks/${taskId}/subtasks`),
  });
  const items = subtasksQuery.data?.items ?? [];
  const progress = subtasksQuery.data?.progress ?? { total: 0, done: 0 };
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.subtasks(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
  };

  const addSubtask = useMutation<Subtask, Error, string>({
    mutationFn: (title) =>
      api<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } }),
    onSuccess: () => {
      setDraft('');
      toast.success('子任务已添加');
      invalidateAll();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleSubtask = useMutation<
    Subtask,
    Error,
    { subtaskId: string; isDone: boolean },
    { previous?: SubtasksResponse }
  >({
    mutationFn: ({ subtaskId, isDone }) =>
      api<Subtask>(`/subtasks/${subtaskId}`, { method: 'PATCH', body: { isDone } }),
    onMutate: async ({ subtaskId, isDone }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.subtasks(taskId) });
      const previous = queryClient.getQueryData<SubtasksResponse>(queryKeys.subtasks(taskId));
      queryClient.setQueryData<SubtasksResponse>(queryKeys.subtasks(taskId), (current) => {
        if (!current) return current;
        const nextItems = current.items.map((item) =>
          item.id === subtaskId ? { ...item, isDone } : item,
        );
        return {
          items: nextItems,
          progress: {
            total: nextItems.length,
            done: nextItems.filter((item) => item.isDone).length,
          },
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.subtasks(taskId), context.previous);
      }
      toast.error(getErrorMessage(error));
    },
    onSettled: () => invalidateAll(),
  });

  const deleteSubtask = useMutation<void, Error, Subtask>({
    mutationFn: (subtask) => api<void>(`/subtasks/${subtask.id}`, { method: 'DELETE' }),
    onSuccess: (_data, subtask) => {
      toast.success(`子任务「${subtask.title}」已删除`);
      invalidateAll();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) {
      toast.error('请输入子任务标题');
      return;
    }
    if (progress.total >= SUBTASK_MAX_PER_TASK) {
      toast.error(`每个任务最多 ${SUBTASK_MAX_PER_TASK} 个子任务`);
      return;
    }
    addSubtask.mutate(title);
  };

  const aiButtonDisabled = archived || !canUpdate;

  return (
    <section aria-labelledby="subtasks-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="subtasks-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          子任务
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={aiButtonDisabled}
          aria-haspopup="dialog"
          onClick={() => setAiDialogOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          AI 拆解
        </Button>
      </div>

      {progress.total > 0 ? (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`子任务进度 ${progress.done}/${progress.total}`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progress.done >= progress.total ? 'bg-emerald-500' : 'bg-primary/70',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {subtasksQuery.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : subtasksQuery.isError ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          子任务加载失败。
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-1"
            onClick={() => void subtasksQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {archived ? '暂无子任务。' : '暂无子任务，手动添加或使用 AI 拆解。'}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((subtask) => {
            const toggling =
              toggleSubtask.isPending && toggleSubtask.variables?.subtaskId === subtask.id;
            return (
              <li key={subtask.id} className="group flex items-start gap-2 rounded-md px-1 py-1">
                <Checkbox
                  id={`subtask-${subtask.id}`}
                  className="mt-0.5"
                  checked={subtask.isDone}
                  disabled={!canUpdate || toggling}
                  aria-label={`切换「${subtask.title}」完成状态`}
                  onCheckedChange={(checked) =>
                    toggleSubtask.mutate({ subtaskId: subtask.id, isDone: checked === true })
                  }
                />
                <label
                  htmlFor={`subtask-${subtask.id}`}
                  className={cn(
                    'min-w-0 flex-1 cursor-default break-words text-sm leading-5',
                    subtask.isDone && 'text-muted-foreground line-through',
                    canUpdate && 'cursor-pointer',
                  )}
                >
                  {subtask.title}
                </label>
                {canUpdate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`删除子任务「${subtask.title}」`}
                    disabled={deleteSubtask.isPending}
                    onClick={() => setDeleteTarget(subtask)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canUpdate ? (
        <form className="mt-3 flex items-center gap-2" onSubmit={handleAdd}>
          <label htmlFor="new-subtask-input" className="sr-only">
            新子任务标题
          </label>
          <Input
            id="new-subtask-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="添加子任务，回车确认"
            maxLength={SUBTASK_TITLE_MAX_LENGTH}
            disabled={addSubtask.isPending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim() || addSubtask.isPending}
            aria-label="添加子任务"
          >
            {addSubtask.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            添加
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {archived ? '项目已归档，子任务不可修改。' : '你没有修改子任务的权限。'}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除子任务"
        description={
          deleteTarget ? `确定删除子任务「${deleteTarget.title}」吗？删除后无法恢复。` : ''
        }
        confirmLabel="删除子任务"
        destructive
        loading={deleteSubtask.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteSubtask.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <TaskAiDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        taskId={taskId}
        projectId={projectId}
        taskTitle={taskTitle}
        canUpdate={canUpdate}
        archived={archived}
      />
    </section>
  );
}
