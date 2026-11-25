'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NOTIFICATION_TYPES, type NotificationType } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { NOTIFICATION_DESCRIPTIONS, notificationMeta } from './notification-meta';

interface NotificationPreferencesResponse {
  preferences: Record<string, boolean>;
}

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PREFERENCE_GROUPS: ReadonlyArray<{ title: string; types: readonly NotificationType[] }> = [
  {
    title: '任务动态',
    types: ['TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_DUE_SOON', 'TASK_OVERDUE'],
  },
  {
    title: '评论与互动',
    types: ['TASK_COMMENTED', 'COMMENT_REPLY', 'COMMENT_REACTION', 'MENTION'],
  },
  {
    title: '项目与成员',
    types: ['MEMBER_JOINED', 'MEMBER_REMOVED', 'ROLE_CHANGED'],
  },
  {
    title: '报告与邀请',
    types: ['WEEKLY_REPORT', 'INVITE'],
  },
];

function buildPreferences(source: Record<string, boolean>): Record<NotificationType, boolean> {
  const next = {} as Record<NotificationType, boolean>;
  for (const type of NOTIFICATION_TYPES) {
    next[type] = source[type] ?? true;
  }
  return next;
}

function preferencesKey(source: Record<string, boolean> | undefined): string {
  if (!source) return 'loading';
  return NOTIFICATION_TYPES.map((type) => `${type}:${source[type] ?? true}`).join('|');
}

export function NotificationPreferencesDialog({
  open,
  onOpenChange,
}: NotificationPreferencesDialogProps) {
  const preferencesQuery = useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: () => api<NotificationPreferencesResponse>('/notifications/preferences'),
    enabled: open,
    staleTime: 60_000,
  });

  const data = preferencesQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>通知偏好</DialogTitle>
          <DialogDescription>
            选择希望接收的通知类型。关闭某类通知后，对应事件将不再生成通知与实时提醒。
          </DialogDescription>
        </DialogHeader>

        {preferencesQuery.isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : preferencesQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>
              {preferencesQuery.error instanceof ApiError
                ? preferencesQuery.error.message
                : '通知偏好加载失败，请稍后重试。'}
            </span>
            <Button variant="outline" size="sm" onClick={() => void preferencesQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : data ? (
          <PreferencesForm
            key={preferencesKey(data.preferences)}
            initial={data.preferences}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface PreferencesFormProps {
  initial: Record<string, boolean>;
  onClose: () => void;
}

function PreferencesForm({ initial, onClose }: PreferencesFormProps) {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<Record<NotificationType, boolean>>(() =>
    buildPreferences(initial),
  );

  const enabledCount = NOTIFICATION_TYPES.filter((type) => preferences[type] ?? true).length;
  const allEnabled = enabledCount === NOTIFICATION_TYPES.length;

  const saveMutation = useMutation({
    mutationFn: (payload: Record<NotificationType, boolean>) =>
      api<NotificationPreferencesResponse>('/notifications/preferences', {
        method: 'PUT',
        body: { preferences: payload },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.notificationPreferences, result);
      toast.success('通知偏好已保存');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '保存通知偏好失败，请稍后重试。');
    },
  });

  const pending = saveMutation.isPending;

  function setAll(value: boolean) {
    const next = {} as Record<NotificationType, boolean>;
    for (const type of NOTIFICATION_TYPES) next[type] = value;
    setPreferences(next);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        saveMutation.mutate(preferences);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">按事件类型选择是否接收提醒</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAll(!allEnabled)}
          disabled={pending}
        >
          {allEnabled ? '全部关闭' : '全部开启'}
        </Button>
      </div>

      <div className="max-h-[52vh] space-y-5 overflow-y-auto pr-1">
        {PREFERENCE_GROUPS.map((group) => (
          <fieldset key={group.title} disabled={pending}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </legend>
            <div className="space-y-2">
              {group.types.map((type) => {
                const meta = notificationMeta(type);
                const id = `notification-preference-${type.toLowerCase().replace(/_/g, '-')}`;
                const active = preferences[type] ?? true;
                return (
                  <label
                    key={type}
                    htmlFor={id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border p-3 transition-colors',
                      pending
                        ? 'cursor-not-allowed opacity-70'
                        : 'cursor-pointer hover:bg-muted/40',
                    )}
                  >
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={active}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        setPreferences((previous) => ({ ...previous, [type]: value === true }))
                      }
                    />
                    <span className="flex min-w-0 flex-1 items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          meta.tone,
                        )}
                        aria-hidden="true"
                      >
                        <meta.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{meta.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {NOTIFICATION_DESCRIPTIONS[type]}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <DialogFooter className="sm:items-center sm:justify-between">
        <Badge variant="muted">
          已启用 {enabledCount}/{NOTIFICATION_TYPES.length} 项
        </Badge>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            保存偏好
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
