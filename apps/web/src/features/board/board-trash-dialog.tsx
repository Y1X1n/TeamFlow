'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { TaskDetail, TrashTask } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import { getErrorMessage } from '@/features/tasks/task-utils';

interface BoardTrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  canRestore: boolean;
}

export function BoardTrashDialog({
  open,
  onOpenChange,
  projectId,
  canRestore,
}: BoardTrashDialogProps) {
  const queryClient = useQueryClient();
  const trashKey = queryKeys.trash(projectId);
  const trashQuery = useQuery<TrashTask[], Error>({
    queryKey: trashKey,
    queryFn: () => api<TrashTask[]>(`/projects/${projectId}/trash`),
    enabled: open,
  });

  const restoreTask = useMutation<TaskDetail, Error, string>({
    mutationFn: (taskId) => api<TaskDetail>(`/tasks/${taskId}/restore`, { method: 'POST' }),
    onSuccess: (task) => {
      toast.success(`已恢复任务「${task.title}」`);
      queryClient.setQueryData<TrashTask[]>(trashKey, (previous) =>
        previous ? previous.filter((item) => item.id !== task.id) : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void queryClient.invalidateQueries({ queryKey: trashKey });
      void queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const pendingTaskId = restoreTask.isPending ? restoreTask.variables : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            回收站
          </DialogTitle>
          <DialogDescription>
            已删除任务可恢复到原看板列末尾；原列已删除时恢复到剩余列末尾。任务依赖关系会保留。
          </DialogDescription>
        </DialogHeader>

        {!canRestore ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            项目已归档，当前只能查看回收站，无法恢复任务。
          </p>
        ) : null}

        {trashQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground" aria-live="polite">
            正在加载回收站…
          </p>
        ) : trashQuery.isError ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-destructive">{getErrorMessage(trashQuery.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void trashQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : (trashQuery.data?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            回收站是空的。
          </p>
        ) : (
          <ul className="space-y-2">
            {trashQuery.data?.map((task) => {
              const pending = pendingTaskId === task.id;
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>看板列：{task.columnName}</span>
                      {task.assignee ? (
                        <span className="inline-flex items-center gap-1">
                          <UserAvatar
                            name={task.assignee.name}
                            src={task.assignee.avatarUrl}
                            className="h-4 w-4 text-[8px]"
                          />
                          {task.assignee.name}
                        </span>
                      ) : (
                        <span>未指派</span>
                      )}
                      <span>删除于 {formatDateTime(task.deletedAt)}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => restoreTask.mutate(task.id)}
                    disabled={!canRestore || restoreTask.isPending}
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    恢复
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
