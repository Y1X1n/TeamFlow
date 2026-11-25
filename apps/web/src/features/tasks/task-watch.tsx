'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { TaskDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from './task-utils';

interface TaskWatchProps {
  taskId: string;
  watching: boolean;
  watcherCount: number;
  disabled: boolean;
}

interface WatchResponse {
  watching: boolean;
  watcherCount: number;
}

export function TaskWatch({ taskId, watching, watcherCount, disabled }: TaskWatchProps) {
  const queryClient = useQueryClient();

  const watchMutation = useMutation<WatchResponse, Error, boolean, { previous?: TaskDetail }>({
    mutationFn: (next) =>
      api<WatchResponse>(`/tasks/${taskId}/watch`, { method: next ? 'POST' : 'DELETE' }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(queryKeys.task(taskId));
      queryClient.setQueryData<TaskDetail>(queryKeys.task(taskId), (current) => {
        if (!current) return current;
        const delta = next === current.watching ? 0 : next ? 1 : -1;
        return {
          ...current,
          watching: next,
          watcherCount: Math.max(0, current.watcherCount + delta),
        };
      });
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<TaskDetail>(queryKeys.task(taskId), (current) =>
        current
          ? { ...current, watching: data.watching, watcherCount: data.watcherCount }
          : current,
      );
      toast.success(data.watching ? '已关注该任务' : '已取消关注');
    },
    onError: (error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.task(taskId), context.previous);
      }
      toast.error(getErrorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
    },
  });

  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
        {watcherCount} 人关注
      </span>
      <Button
        type="button"
        variant={watching ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={watching}
        disabled={disabled || watchMutation.isPending}
        onClick={() => watchMutation.mutate(!watching)}
      >
        {watchMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : watching ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {watching ? '已关注' : '关注'}
      </Button>
    </div>
  );
}
