'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  Split,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SUBTASK_TITLE_MAX_LENGTH } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  AiBreakdown,
  AiPlanResult,
  AiStatus,
  Member,
  Subtask,
  TaskDetail,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { BreakdownPreview, PlanPreview } from './task-ai-preview';
import {
  buildPlanTaskPayload,
  createPlanDrafts,
  createPlanSequentially,
  createSubtasksSequentially,
  type BreakdownCreationSummary,
  type BreakdownRow,
  type CreationFailure,
  type PlanCreationSummary,
  type PlanStepDraft,
} from './task-plan-utils';
import { getErrorMessage } from './task-utils';

const AI_BREAKDOWN_LIMIT = 6;

type AiMode = 'subtasks' | 'plan';
type AiSource = 'ai' | 'local';

interface BreakdownRun {
  result: AiBreakdown;
  rows: BreakdownRow[];
}

interface PlanRun {
  result: AiPlanResult;
  rows: PlanStepDraft[];
}

interface BreakdownCreationInput {
  rows: BreakdownRow[];
  source: AiSource;
}

interface PlanCreationInput {
  rows: PlanStepDraft[];
  columnId: string;
}

interface TaskAiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  projectId: string;
  taskTitle: string;
  canUpdate: boolean;
  archived: boolean;
}

function sourceLabel(source: AiSource): string {
  return source === 'ai' ? 'AI' : '本地规则';
}

function PreviewSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function SourceMeta({
  source,
  model,
  notice,
}: {
  source: AiSource;
  model?: string | null;
  notice?: string | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={source === 'ai' ? 'default' : 'secondary'}>
          {source === 'ai' ? 'AI' : '本地规则'}
        </Badge>
        {source === 'ai' && model ? (
          <span className="text-xs text-muted-foreground">模型：{model}</span>
        ) : null}
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}

function FailureList({ failures }: { failures: CreationFailure[] }) {
  if (failures.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      {failures.map((failure, index) => (
        <li key={`${failure.title}-${index}`}>
          {failure.title}：{failure.message}
        </li>
      ))}
    </ul>
  );
}

function BreakdownCreationSummaryPanel({ summary }: { summary: BreakdownCreationSummary }) {
  const success = summary.failed === 0;
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border p-3 text-xs',
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <p className="font-medium">
        已创建 {summary.created}/{summary.total} 个子任务
        {summary.failed > 0 ? `，${summary.failed} 个失败` : ''}
      </p>
      <FailureList failures={summary.failures} />
    </div>
  );
}

function PlanSummaryPanel({ summary }: { summary: PlanCreationSummary }) {
  const success = summary.failed === 0 && summary.dependenciesFailed === 0;
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border p-3 text-xs',
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <p className="font-medium">
        任务：已创建 {summary.created}/{summary.total} 个
        {summary.failed > 0 ? `，${summary.failed} 个失败` : ''}
      </p>
      <p className="mt-0.5">
        依赖：成功 {summary.dependenciesCreated} 条，失败 {summary.dependenciesFailed} 条，跳过{' '}
        {summary.dependenciesSkipped} 条
        {summary.dependencyTotal > 0 ? `（共 ${summary.dependencyTotal} 条）` : ''}
      </p>
      <FailureList failures={summary.failures} />
      <FailureList failures={summary.dependencyFailures} />
    </div>
  );
}

export function TaskAiDialog({
  open,
  onOpenChange,
  taskId,
  projectId,
  taskTitle,
  canUpdate,
  archived,
}: TaskAiDialogProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AiMode>('subtasks');
  const [breakdownResult, setBreakdownResult] = useState<AiBreakdown | null>(null);
  const [breakdownRows, setBreakdownRows] = useState<BreakdownRow[]>([]);
  const [breakdownSummary, setBreakdownSummary] = useState<BreakdownCreationSummary | null>(null);
  const [planResult, setPlanResult] = useState<AiPlanResult | null>(null);
  const [planRows, setPlanRows] = useState<PlanStepDraft[]>([]);
  const [planSummary, setPlanSummary] = useState<PlanCreationSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('subtasks');
    setBreakdownResult(null);
    setBreakdownRows([]);
    setBreakdownSummary(null);
    setPlanResult(null);
    setPlanRows([]);
    setPlanSummary(null);
    setFormError(null);
  }, [open, taskId]);

  const aiStatusQuery = useQuery<AiStatus, Error>({
    queryKey: queryKeys.aiStatus,
    queryFn: () => api<AiStatus>('/ai/status'),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const taskQuery = useQuery<TaskDetail, Error>({
    queryKey: queryKeys.task(taskId),
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
    enabled: open && mode === 'plan',
    staleTime: 60_000,
  });

  const membersQuery = useQuery<{ items: Member[] }, Error>({
    queryKey: queryKeys.members(projectId),
    queryFn: () => api<{ items: Member[] }>(`/projects/${projectId}/members`),
    enabled: open && mode === 'plan',
    staleTime: 60_000,
  });

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data]);
  const memberIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members],
  );

  const invalidateAfterCreate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.subtasks(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
  };

  const generateBreakdown = useMutation<BreakdownRun, Error, void>({
    mutationFn: async () => {
      const result = await api<AiBreakdown>(`/tasks/${taskId}/ai-breakdown`, { method: 'POST' });
      const rows = result.subtasks
        .map((title) => title.trim())
        .filter((title) => title.length > 0)
        .slice(0, AI_BREAKDOWN_LIMIT)
        .map((title, index) => ({
          key: `breakdown-${index}`,
          title,
          checked: true,
        }));
      return { result, rows };
    },
    onSuccess: ({ result, rows }) => {
      setBreakdownResult(result);
      setBreakdownRows(rows);
      setBreakdownSummary(null);
      setFormError(null);
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const generatePlan = useMutation<PlanRun, Error, ReadonlySet<string>>({
    mutationFn: async (knownAssigneeIds) => {
      const result = await api<AiPlanResult>(`/tasks/${taskId}/ai-plan`, {
        method: 'POST',
        body: { useAi: true },
      });
      return {
        result,
        rows: createPlanDrafts(result.steps, new Date(), knownAssigneeIds),
      };
    },
    onSuccess: ({ result, rows }) => {
      setPlanResult(result);
      setPlanRows(rows);
      setPlanSummary(null);
      setFormError(null);
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const createBreakdown = useMutation<
    { summary: BreakdownCreationSummary; source: AiSource },
    Error,
    BreakdownCreationInput
  >({
    mutationFn: async ({ rows, source }) => {
      const summary = await createSubtasksSequentially(rows, (title) =>
        api<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } }),
      );
      return { summary, source };
    },
    onSuccess: ({ summary, source }) => {
      setBreakdownSummary(summary);
      if (summary.created > 0) invalidateAfterCreate();
      if (summary.created === 0) {
        toast.error(`未能创建子任务（${summary.failed} 个失败），请查看预览下方的失败原因`);
        return;
      }
      if (summary.failed > 0) {
        toast.warning(`已创建 ${summary.created}/${summary.total} 个子任务`, {
          description: `${summary.failed} 个子任务创建失败，请查看预览下方的失败原因`,
        });
        return;
      }
      toast.success(`已创建 ${summary.created} 个子任务（来源：${sourceLabel(source)}）`, {
        description: breakdownResult?.notice,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
      toast.error(getErrorMessage(error));
    },
  });

  const createPlan = useMutation<PlanCreationSummary, Error, PlanCreationInput>({
    mutationFn: (input) =>
      createPlanSequentially(input.rows, input.columnId, {
        createTask: (payload) =>
          api<TaskDetail>(`/projects/${projectId}/tasks`, {
            method: 'POST',
            body: payload,
          }),
        createDependency: (createdTaskId, blockedByTaskId) =>
          api<unknown>(`/tasks/${createdTaskId}/dependencies`, {
            method: 'POST',
            body: { blockedByTaskId },
          }),
      }),
    onSuccess: (summary) => {
      setPlanSummary(summary);
      if (summary.created > 0) invalidateAfterCreate();
      if (summary.created === 0) {
        toast.error('未能创建任何任务，请查看预览下方的失败原因');
        return;
      }
      if (summary.failed === 0 && summary.dependenciesFailed === 0) {
        const dependencyText =
          summary.dependenciesCreated > 0
            ? `并建立 ${summary.dependenciesCreated} 条依赖`
            : '';
        toast.success(`已创建 ${summary.created} 个任务${dependencyText}`, {
          description:
            summary.dependenciesSkipped > 0
              ? `${summary.dependenciesSkipped} 条依赖因步骤未选择或未创建而跳过`
              : undefined,
        });
        onOpenChange(false);
        return;
      }
      const parts = [
        summary.failed > 0 ? `${summary.failed} 个任务失败` : null,
        summary.dependenciesFailed > 0 ? `${summary.dependenciesFailed} 条依赖失败` : null,
      ].filter((part): part is string => part !== null);
      toast.warning(`已创建 ${summary.created}/${summary.total} 个任务`, {
        description: parts.join('；'),
      });
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
      toast.error(getErrorMessage(error));
    },
  });

  const isGenerating = generateBreakdown.isPending || generatePlan.isPending;
  const isCreating = createBreakdown.isPending || createPlan.isPending;
  const isBusy = isGenerating || isCreating;
  const commonDisabled = archived || !canUpdate;

  const planDataReady = Boolean(taskQuery.data?.columnId) && membersQuery.isSuccess;
  const planDataLoading = mode === 'plan' && (taskQuery.isPending || membersQuery.isPending);
  const planDataError = taskQuery.isError || membersQuery.isError;

  const hasSummary = mode === 'subtasks' ? breakdownSummary !== null : planSummary !== null;
  const selectedCount =
    mode === 'subtasks'
      ? breakdownRows.filter((row) => row.checked).length
      : planRows.filter((row) => row.checked).length;

  const generateDisabled =
    commonDisabled || isBusy || (mode === 'plan' && !planDataReady);

  const confirmDisabled =
    commonDisabled ||
    isBusy ||
    hasSummary ||
    selectedCount === 0 ||
    (mode === 'subtasks' ? !breakdownResult : !planResult || !planDataReady);

  const status = aiStatusQuery.data;
  const statusTitle = aiStatusQuery.isPending
    ? '正在获取 AI 状态…'
    : aiStatusQuery.isError
      ? '无法获取 AI 状态'
      : status?.enabled
        ? 'AI 已启用'
        : '未配置 AI 服务，使用本地规则';
  const statusDetail = aiStatusQuery.isPending
    ? '正在读取服务配置，生成前不会创建任何内容。'
    : aiStatusQuery.isError
      ? `无法获取 AI 状态（${getErrorMessage(aiStatusQuery.error)}）。仍可生成预览，AI 不可用时会自动回退到本地规则。`
      : status?.enabled
        ? `${status.model ? `模型：${status.model}。` : ''}${
            status.costNotice ?? '生成时会发送任务标题与描述，可能产生费用。'
          }`
        : '生成将使用本地规则，不会产生外部调用费用。';

  const statusTone = aiStatusQuery.isPending
    ? 'border-muted bg-muted/30 text-muted-foreground'
    : aiStatusQuery.isError || !status?.enabled
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  const startBreakdownPreview = () => {
    setFormError(null);
    setBreakdownSummary(null);
    setBreakdownResult(null);
    setBreakdownRows([]);
    generateBreakdown.mutate();
  };

  const startPlanPreview = () => {
    if (!planDataReady) return;
    setFormError(null);
    setPlanSummary(null);
    setPlanResult(null);
    setPlanRows([]);
    generatePlan.mutate(memberIds);
  };

  const switchMode = (next: AiMode) => {
    if (isBusy) return;
    setMode(next);
    setFormError(null);
  };

  const patchBreakdownRow = (key: string, patch: Partial<BreakdownRow>) => {
    setBreakdownRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const patchPlanRow = (key: string, patch: Partial<PlanStepDraft>) => {
    setPlanRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const selectAllBreakdown = (checked: boolean) => {
    setBreakdownRows((current) => current.map((row) => ({ ...row, checked })));
  };

  const selectAllPlan = (checked: boolean) => {
    setPlanRows((current) => current.map((row) => ({ ...row, checked })));
  };

  const handleConfirm = () => {
    setFormError(null);
    if (mode === 'subtasks') {
      if (!breakdownResult) {
        setFormError('请先生成子任务预览');
        return;
      }
      const selected = breakdownRows.filter((row) => row.checked);
      if (selected.length === 0) {
        setFormError('请至少选择一个子任务');
        return;
      }
      const empty = selected.find((row) => !row.title.trim());
      if (empty) {
        setFormError('子任务标题不能为空');
        return;
      }
      const tooLong = selected.find(
        (row) => row.title.trim().length > SUBTASK_TITLE_MAX_LENGTH,
      );
      if (tooLong) {
        setFormError(`子任务标题不能超过 ${SUBTASK_TITLE_MAX_LENGTH} 个字符`);
        return;
      }
      createBreakdown.mutate({ rows: breakdownRows, source: breakdownResult.source });
      return;
    }

    if (!planResult || !taskQuery.data?.columnId) {
      setFormError('请先生成分工预览');
      return;
    }
    const selected = planRows.filter((row) => row.checked);
    if (selected.length === 0) {
      setFormError('请至少选择一个步骤');
      return;
    }
    for (const row of selected) {
      const built = buildPlanTaskPayload(row, taskQuery.data.columnId);
      if (built.error) {
        setFormError(built.error);
        return;
      }
    }
    createPlan.mutate({ rows: planRows, columnId: taskQuery.data.columnId });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isCreating) return;
    onOpenChange(next);
  };

  const retryPlanData = () => {
    void taskQuery.refetch();
    void membersQuery.refetch();
  };

  const previewLocked = isCreating || hasSummary;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            AI 任务拆解
          </DialogTitle>
          <DialogDescription>
            为「{taskTitle}」生成子任务清单或任务分工。所有结果先预览、可编辑，确认前不会创建任何内容。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={cn('flex items-start gap-2 rounded-lg border p-3 text-xs', statusTone)}
            aria-live="polite"
          >
            {aiStatusQuery.isPending ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : aiStatusQuery.isError || !status?.enabled ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium">{statusTitle}</p>
              <p className="mt-0.5">{statusDetail}</p>
            </div>
          </div>

          {archived || !canUpdate ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {archived
                ? '项目已归档，无法生成或创建内容。'
                : '你没有修改任务的权限，无法生成或创建内容。'}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-lg border p-1"
              role="group"
              aria-label="AI 拆解模式"
            >
              <Button
                type="button"
                size="sm"
                variant={mode === 'subtasks' ? 'default' : 'ghost'}
                aria-pressed={mode === 'subtasks'}
                disabled={isBusy}
                onClick={() => switchMode('subtasks')}
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                子任务清单
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'plan' ? 'default' : 'ghost'}
                aria-pressed={mode === 'plan'}
                disabled={isBusy}
                onClick={() => switchMode('plan')}
              >
                <Split className="h-3.5 w-3.5" aria-hidden="true" />
                任务分工
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              {mode === 'subtasks'
                ? '拆解为当前任务的子任务。'
                : '拆解为独立任务，并按依赖顺序建立阻塞关系。'}
            </span>
          </div>

          {formError ? (
            <p role="alert" className="text-xs text-destructive">
              {formError}
            </p>
          ) : null}

          {mode === 'subtasks' ? (
            generateBreakdown.isPending ? (
              <PreviewSkeleton label="正在生成子任务预览…" />
            ) : !breakdownResult ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  生成 3–6 个子任务建议，可编辑并勾选后再创建。
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled={generateDisabled}
                  aria-busy={generateBreakdown.isPending}
                  onClick={startBreakdownPreview}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  生成预览
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <SourceMeta
                  source={breakdownResult.source}
                  model={breakdownResult.model}
                  notice={breakdownResult.notice}
                />
                {breakdownRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    未生成可用的子任务建议，请稍后重试或手动添加。
                  </p>
                ) : (
                  <BreakdownPreview
                    rows={breakdownRows}
                    source={breakdownResult.source}
                    locked={previewLocked}
                    onPatchRow={patchBreakdownRow}
                    onSelectAll={selectAllBreakdown}
                  />
                )}
                {breakdownSummary ? (
                  <BreakdownCreationSummaryPanel summary={breakdownSummary} />
                ) : null}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={commonDisabled || isBusy}
                    onClick={startBreakdownPreview}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    重新生成
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {planDataLoading ? (
                <div
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  正在加载任务与成员信息…
                </div>
              ) : planDataError || !taskQuery.data?.columnId ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                    <span>
                      {taskQuery.isError
                        ? `任务信息加载失败：${getErrorMessage(taskQuery.error)}`
                        : membersQuery.isError
                          ? `成员列表加载失败：${getErrorMessage(membersQuery.error)}`
                          : '任务缺少看板列信息，无法创建任务。'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryPlanData}
                    disabled={isBusy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    重试
                  </Button>
                </div>
              ) : null}

              {generatePlan.isPending ? (
                <PreviewSkeleton label="正在生成分工预览…" />
              ) : !planResult ? (
                planDataReady ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      生成 3–6 个执行步骤，并建议负责人、优先级、截止时间与步骤依赖。
                      将按当前任务所在看板列创建任务。
                    </p>
                    <Button
                      type="button"
                      className="mt-3"
                      disabled={generateDisabled}
                      aria-busy={generatePlan.isPending}
                      onClick={startPlanPreview}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      生成预览
                    </Button>
                  </div>
                ) : null
              ) : (
                <>
                  <SourceMeta
                    source={planResult.source}
                    model={planResult.model}
                    notice={planResult.notice}
                  />
                  {planRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      未生成可用的分工步骤，请稍后重试。
                    </p>
                  ) : (
                    <PlanPreview
                      rows={planRows}
                      members={members}
                      locked={previewLocked}
                      onPatchRow={patchPlanRow}
                      onSelectAll={selectAllPlan}
                    />
                  )}
                  {planSummary ? <PlanSummaryPanel summary={planSummary} /> : null}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={commonDisabled || isBusy || !planDataReady}
                      onClick={startPlanPreview}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      重新生成
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {hasSummary
              ? '部分内容创建失败，请查看上方汇总后关闭。'
              : mode === 'subtasks'
                ? '确认后才会创建所选的子任务，未勾选的建议会被忽略。'
                : '确认后将创建任务并自动建立所选步骤之间的依赖。'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isCreating}
              onClick={() => handleOpenChange(false)}
            >
              关闭
            </Button>
            <Button
              type="button"
              disabled={confirmDisabled}
              aria-busy={isCreating}
              onClick={handleConfirm}
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {mode === 'subtasks'
                ? selectedCount > 0
                  ? `创建 ${selectedCount} 个子任务`
                  : '创建所选子任务'
                : selectedCount > 0
                  ? `创建 ${selectedCount} 个任务`
                  : '创建所选任务'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}