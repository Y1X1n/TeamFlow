'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { TaskCard } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/features/tasks/task-utils';

interface QuickAddTaskProps {
  projectId: string;
  columnId: string;
  columnName: string;
  onClose: () => void;
}

export function QuickAddTask({ projectId, columnId, columnName, onClose }: QuickAddTaskProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = `quick-add-task-${columnId}`;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createTask = useMutation<TaskCard, Error, string>({
    mutationFn: (value) =>
      api<TaskCard>(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: { title: value, columnId },
      }),
    onSuccess: (task) => {
      toast.success(`任务「${task.title}」已创建`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || createTask.isPending) return;
    createTask.mutate(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!createTask.isPending) onClose();
      return;
    }
    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5 rounded-lg border bg-card p-2">
      <label htmlFor={inputId} className="sr-only">
        在列「{columnName}」中新建任务的标题
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入标题，回车创建"
        maxLength={200}
        className="h-8 text-sm"
        disabled={createTask.isPending}
        autoComplete="off"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Esc 取消</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onClose}
            disabled={createTask.isPending}
          >
            取消
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-7 px-2.5"
            disabled={createTask.isPending || title.trim().length === 0}
          >
            {createTask.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {createTask.isPending ? '创建中…' : '创建'}
          </Button>
        </div>
      </div>
    </form>
  );
}
