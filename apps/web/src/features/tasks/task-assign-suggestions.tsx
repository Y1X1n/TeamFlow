'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, RefreshCw, Sparkles, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS, type ProjectRole } from '@teamflow/shared/enums';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { AssignSuggestionCandidate, AssignSuggestionsResult } from '@/lib/types';
import { avatarColor, cn } from '@/lib/utils';
import { getErrorMessage } from './task-utils';

interface TaskAssignSuggestionsProps {
  projectId: string;
  taskId: string;
  taskTitle: string;
  currentAssigneeId: string | null;
  canAssign: boolean;
  archived: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (userId: string) => Promise<void>;
  onAssigned?: (candidate: AssignSuggestionCandidate) => void;
}

const SUGGESTION_LIMIT = 3;

function suggestionsQueryKey(projectId: string, taskId: string) {
  return ['assign-suggestions', projectId, taskId] as const;
}

function suggestionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有指派任务的权限。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法获取指派推荐。';
      case 'RATE_LIMITED':
        return '推荐请求过于频繁，请稍后再试。';
      case 'NOT_FOUND':
        return '任务不存在或已被删除。';
      default:
        return error.message;
    }
  }
  return getErrorMessage(error);
}

function roleVariant(role: ProjectRole): NonNullable<BadgeProps['variant']> {
  switch (role) {
    case 'OWNER':
      return 'default';
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'secondary';
    default:
      return 'muted';
  }
}

export function TaskAssignSuggestions({
  projectId,
  taskId,
  taskTitle,
  currentAssigneeId,
  canAssign,
  archived,
  open,
  onOpenChange,
  onAssign,
  onAssigned,
}: TaskAssignSuggestionsProps) {
  const [applyingUserId, setApplyingUserId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const suggestionsQuery = useQuery<AssignSuggestionsResult, Error>({
    queryKey: suggestionsQueryKey(projectId, taskId),
    queryFn: () =>
      api<AssignSuggestionsResult>(`/tasks/${taskId}/assign-suggestions`, {
        method: 'POST',
        body: { limit: SUGGESTION_LIMIT },
      }),
    enabled: open && canAssign && !archived,
    retry: false,
    staleTime: 0,
  });

  const result = suggestionsQuery.data;

  function handleOpenChange(next: boolean) {
    if (applyingUserId !== null) return;
    if (!next) setAssignError(null);
    onOpenChange(next);
  }

  async function handleAssign(candidate: AssignSuggestionCandidate) {
    if (candidate.userId === currentAssigneeId || applyingUserId !== null) return;
    setApplyingUserId(candidate.userId);
    setAssignError(null);
    try {
      await onAssign(candidate.userId);
      toast.success(`已指派给 ${candidate.name}`);
      onAssigned?.(candidate);
      setApplyingUserId(null);
      onOpenChange(false);
    } catch (error) {
      setAssignError(getErrorMessage(error));
    } finally {
      setApplyingUserId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            智能推荐负责人
          </DialogTitle>
          <DialogDescription>
            为「{taskTitle}」推荐合适的负责人。推荐结果仅供参考，点击「指派」后才会修改负责人。
          </DialogDescription>
        </DialogHeader>

        {archived ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            项目已归档，无法获取指派推荐。
          </div>
        ) : !canAssign ? (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            你没有指派任务的权限，无法获取推荐。
          </div>
        ) : suggestionsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <span className="sr-only">正在生成推荐…</span>
          </div>
        ) : suggestionsQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>{suggestionErrorText(suggestionsQuery.error)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void suggestionsQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.source === 'ai' ? 'default' : 'secondary'}>
                  {result.source === 'ai' ? 'AI' : '本地规则'}
                </Badge>
                {result.source === 'ai' && result.model ? (
                  <span className="text-xs text-muted-foreground">模型：{result.model}</span>
                ) : null}
              </div>
              {result.notice ? (
                <p className="text-xs text-muted-foreground">{result.notice}</p>
              ) : null}
            </div>

            {result.costNotice ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{result.costNotice}</span>
              </div>
            ) : null}

            {result.candidates.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                没有可用候选人。请先为项目成员添加职能标签，且候选人不能是只读角色。
              </p>
            ) : (
              <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {result.candidates.map((candidate) => {
                  const isCurrent = candidate.userId === currentAssigneeId;
                  const isApplying = applyingUserId === candidate.userId;
                  const matchingSkills = new Set(candidate.skillMatches);
                  return (
                    <li
                      key={candidate.userId}
                      className={cn(
                        'rounded-lg border p-3',
                        isCurrent && 'border-primary/40 bg-primary/5',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          name={candidate.name}
                          src={candidate.avatarUrl}
                          color={avatarColor(candidate.userId)}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium">{candidate.name}</span>
                            <Badge variant={roleVariant(candidate.role)}>
                              {PROJECT_ROLE_LABELS[candidate.role]}
                            </Badge>
                            <Badge variant="outline" className="tabular-nums">
                              推荐分 {Math.round(candidate.score)}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="tabular-nums">进行中 {candidate.openTaskCount}</span>
                            <span
                              className={cn(
                                'tabular-nums',
                                candidate.overdueTaskCount > 0 && 'font-medium text-destructive',
                              )}
                            >
                              逾期 {candidate.overdueTaskCount}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {candidate.skills.length > 0 ? (
                              candidate.skills.map((skill) => {
                                const matched = matchingSkills.has(skill);
                                return (
                                  <Badge
                                    key={skill}
                                    variant={matched ? 'default' : 'outline'}
                                    className="gap-1 font-normal"
                                    title={matched ? '与任务匹配的职能标签' : undefined}
                                  >
                                    {matched ? (
                                      <Check className="h-3 w-3" aria-hidden="true" />
                                    ) : null}
                                    {skill}
                                  </Badge>
                                );
                              })
                            ) : (
                              <span className="text-xs text-muted-foreground">未设置职能标签</span>
                            )}
                          </div>

                          {candidate.reasons.length > 0 ? (
                            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                              {candidate.reasons.map((reason, index) => (
                                <li key={`${candidate.userId}-reason-${index}`}>{reason}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>

                        <div className="shrink-0 self-start">
                          <Button
                            type="button"
                            size="sm"
                            variant={isCurrent ? 'outline' : 'default'}
                            disabled={isCurrent || applyingUserId !== null}
                            aria-label={
                              isCurrent
                                ? `${candidate.name} 是当前负责人`
                                : `指派任务给 ${candidate.name}`
                            }
                            onClick={() => void handleAssign(candidate)}
                          >
                            {isApplying ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : isCurrent ? (
                              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : null}
                            {isCurrent ? '当前负责人' : isApplying ? '指派中…' : '指派'}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {assignError ? (
              <p role="alert" className="text-xs text-destructive">
                {assignError}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">指派后仍可随时手动调整负责人。</span>
          <Button
            type="button"
            variant="outline"
            disabled={applyingUserId !== null}
            onClick={() => handleOpenChange(false)}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
