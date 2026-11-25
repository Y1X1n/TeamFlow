'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarRange,
  Download,
  FileText,
  Loader2,
  Printer,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { downloadTextFile } from '@/lib/download';
import { queryKeys } from '@/lib/query-keys';
import type {
  AiStatus,
  Member,
  PeriodReport,
  PeriodReportNarrative,
  ReportPeriod,
  ReportScope,
} from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import {
  buildPeriodReportMarkdown,
  periodReportFileName,
  periodReportTitle,
  wrapPrintableReportHtml,
} from './report-document';
import { currentDateKey, currentWeekStart } from './week';

const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'daily', label: '日报' },
  { value: 'weekly', label: '周报' },
];

interface PeriodReportSectionProps {
  projectId: string;
  canView: boolean;
  canGenerate: boolean;
  archived: boolean;
  initialPeriod?: ReportPeriod;
  initialScope?: ReportScope;
  initialDate?: string;
  initialUserId?: string;
}

interface NarrativeRequest {
  paramsKey: string;
  body: {
    period: ReportPeriod;
    date: string;
    scope: ReportScope;
    userId?: string;
  };
}

function reportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PROJECT_ARCHIVED') return '项目已归档，无法生成摘要。';
    if (error.status === 403) {
      return '无权访问该报告范围（团队或其他成员报告需要 report:generate 权限）。';
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return '报告加载失败，请稍后重试。';
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">正在渲染报告预览</span>
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function PeriodReportSection({
  projectId,
  canView,
  canGenerate,
  archived,
  initialPeriod,
  initialScope,
  initialDate,
  initialUserId,
}: PeriodReportSectionProps) {
  const { user } = useAuth();
  const resolvedPeriod = initialPeriod ?? 'daily';
  const requestedScope = initialScope ?? (canGenerate ? 'team' : 'member');

  const [period, setPeriod] = useState<ReportPeriod>(resolvedPeriod);
  const [date, setDate] = useState<string>(
    initialDate ?? (resolvedPeriod === 'weekly' ? currentWeekStart() : currentDateKey()),
  );
  const [scope, setScope] = useState<ReportScope>(
    canGenerate ? requestedScope : 'member',
  );
  const [userId, setUserId] = useState<string | undefined>(() => {
    if (!canGenerate || requestedScope === 'team') return undefined;
    return initialUserId;
  });
  const [narrativeState, setNarrativeState] = useState<{
    paramsKey: string;
    data: PeriodReportNarrative;
  } | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => api<{ items: Member[] }>(`/projects/${projectId}/members`),
    enabled: canGenerate,
    staleTime: 60_000,
  });
  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data]);

  const currentUserId = user?.id;
  const effectiveUserId = scope === 'member' ? userId ?? currentUserId : undefined;
  const selectedMember = members.find((member) => member.userId === userId);

  const reportParams = useMemo(() => {
    if (!date) return null;
    const params = new URLSearchParams({ period, date, scope });
    if (scope === 'member' && effectiveUserId) params.set('userId', effectiveUserId);
    return params.toString();
  }, [period, date, scope, effectiveUserId]);

  const reportQuery = useQuery<PeriodReport, Error>({
    queryKey: queryKeys.periodReport(projectId, reportParams ?? ''),
    queryFn: () => api<PeriodReport>(`/projects/${projectId}/reports/period?${reportParams ?? ''}`),
    enabled: canView && Boolean(reportParams) && (scope === 'team' || Boolean(effectiveUserId)),
    staleTime: 15_000,
  });
  const report = reportQuery.data;

  const aiStatusQuery = useQuery<AiStatus>({
    queryKey: queryKeys.aiStatus,
    queryFn: () => api<AiStatus>('/ai/status'),
    enabled: canView,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const narrativeMutation = useMutation<PeriodReportNarrative, Error, NarrativeRequest>({
    mutationFn: (variables) =>
      api<PeriodReportNarrative>(`/projects/${projectId}/reports/period/narrative`, {
        method: 'POST',
        body: variables.body,
      }),
    onSuccess: (data, variables) => {
      setNarrativeState({ paramsKey: variables.paramsKey, data });
      toast.success(data.source === 'ai' ? 'AI 摘要已生成' : '摘要已生成（本地规则）', {
        description: data.notice ?? undefined,
      });
    },
    onError: (error) => toast.error(reportErrorMessage(error)),
  });

  const narrative =
    narrativeState && narrativeState.paramsKey === (reportParams ?? '')
      ? narrativeState.data
      : null;

  const markdown = useMemo(
    () => (report ? buildPeriodReportMarkdown(report, narrative, report.project.name) : ''),
    [report, narrative],
  );

  useEffect(() => {
    if (!markdown) {
      setPreviewHtml('');
      setPreviewPending(false);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewPending(true);
    setPreviewError(null);
    setPreviewHtml('');

    void (async () => {
      try {
        const [{ marked }, { default: DOMPurify }] = await Promise.all([
          import('marked'),
          import('dompurify'),
        ]);
        const raw = marked.parse(markdown, { async: false, gfm: true }) as string;
        const sanitized = DOMPurify.sanitize(raw);
        if (!cancelled) setPreviewHtml(sanitized);
      } catch {
        if (!cancelled) setPreviewError('报告预览渲染失败，可尝试导出 Markdown 查看。');
      } finally {
        if (!cancelled) setPreviewPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markdown]);

  function changePeriod(next: ReportPeriod) {
    setPeriod(next);
    if (!date) setDate(next === 'weekly' ? currentWeekStart() : currentDateKey());
  }

  function chooseMyReport() {
    setScope('member');
    setUserId(undefined);
  }

  function chooseTeamReport() {
    if (!canGenerate) return;
    setScope('team');
    setUserId(undefined);
  }

  function viewMemberReport(memberId: string) {
    setScope('member');
    setUserId(memberId);
  }

  const handleGenerateNarrative = () => {
    if (!reportParams || !date) {
      toast.error('请选择报告日期');
      return;
    }
    narrativeMutation.mutate({
      paramsKey: reportParams,
      body: {
        period,
        date,
        scope,
        ...(scope === 'member' && effectiveUserId ? { userId: effectiveUserId } : {}),
      },
    });
  };

  const handleExportMarkdown = () => {
    if (!report) return;
    const currentMarkdown = buildPeriodReportMarkdown(report, narrative, report.project.name);
    downloadTextFile(
      periodReportFileName(report, report.project.name, 'md'),
      currentMarkdown,
      'text/markdown;charset=utf-8',
    );
    toast.success('Markdown 报告已开始下载');
  };

  const handleExportHtml = async () => {
    if (!report) return;
    try {
      const currentMarkdown = buildPeriodReportMarkdown(report, narrative, report.project.name);
      const [{ marked }, { default: DOMPurify }] = await Promise.all([
        import('marked'),
        import('dompurify'),
      ]);
      const raw = marked.parse(currentMarkdown, { async: false, gfm: true }) as string;
      const sanitized = DOMPurify.sanitize(raw);
      const html = wrapPrintableReportHtml(
        periodReportTitle(report),
        sanitized,
        formatDateTime(report.generatedAt),
      );
      downloadTextFile(
        periodReportFileName(report, report.project.name, 'html'),
        html,
        'text/html;charset=utf-8',
      );
      toast.success('可打印 HTML 报告已开始下载');
    } catch {
      toast.error('导出失败，请稍后重试');
    }
  };

  if (!canView) return null;

  const forbidden = reportQuery.error instanceof ApiError && reportQuery.error.status === 403;

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarRange className="h-5 w-5 text-primary" aria-hidden="true" />
              日报 / 周报
              <Badge variant="muted">实时生成</Badge>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              按日期范围汇总任务进展，支持成员与团队视角，可导出 Markdown 或可打印 HTML。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateNarrative}
            disabled={archived || narrativeMutation.isPending || !reportParams}
            title={archived ? '项目已归档，无法生成摘要' : undefined}
            aria-busy={narrativeMutation.isPending}
          >
            {narrativeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {narrativeMutation.isPending ? '生成中…' : 'AI 生成摘要'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">周期</span>
            <div
              role="group"
              aria-label="报告周期"
              className="inline-flex rounded-lg border bg-muted/50 p-0.5"
            >
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={period === option.value}
                  onClick={() => changePeriod(option.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    period === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="period-report-date"
              className="text-xs font-medium text-muted-foreground"
            >
              {period === 'weekly' ? '所在周（任选一天）' : '报告日期'}
            </Label>
            <Input
              id="period-report-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-label="报告日期"
              className="h-9 w-44"
            />
          </div>

          {canGenerate ? (
            <div className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">范围</span>
              <div
                role="group"
                aria-label="报告范围"
                className="inline-flex rounded-lg border bg-muted/50 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={scope === 'team'}
                  onClick={chooseTeamReport}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    scope === 'team'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  团队
                </button>
                <button
                  type="button"
                  aria-pressed={scope === 'member' && (!userId || userId === currentUserId)}
                  onClick={chooseMyReport}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    scope === 'member' && (!userId || userId === currentUserId)
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  我的
                </button>
              </div>
            </div>
          ) : (
            <Badge variant="muted">我的报告</Badge>
          )}

          {canGenerate && scope === 'team' ? (
            <div className="min-w-44 space-y-1">
              <Label
                htmlFor="period-report-member"
                className="text-xs font-medium text-muted-foreground"
              >
                成员报告
              </Label>
              <Select
                value="team"
                onValueChange={(value) => {
                  if (value === 'team') chooseTeamReport();
                  else viewMemberReport(value);
                }}
              >
                <SelectTrigger id="period-report-member" aria-label="选择成员报告">
                  <SelectValue placeholder="团队汇总" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">团队汇总</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {scope === 'member' && userId && userId !== currentUserId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">正在查看：{selectedMember?.name ?? '成员'}</Badge>
            <Button type="button" variant="ghost" size="sm" onClick={chooseMyReport}>
              返回我的报告
            </Button>
          </div>
        ) : null}

        {!archived && aiStatusQuery.data?.enabled ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {aiStatusQuery.data.costNotice ?? 'AI 摘要会调用外部模型，可能产生费用。'}
          </p>
        ) : !archived && aiStatusQuery.data && !aiStatusQuery.data.enabled ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            未配置 AI 时将自动使用本地规则生成摘要，不会产生外部调用费用。
          </p>
        ) : null}
      </div>

      <div className="space-y-4 p-5" aria-busy={reportQuery.isFetching || previewPending}>
        {archived ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            项目已归档，报告仍可查看和导出，AI 摘要不可用。
          </p>
        ) : null}

        {!date ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            请选择报告日期以生成日报 / 周报。
          </p>
        ) : reportQuery.isPending ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only">正在加载日报 / 周报</span>
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-14 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-52 w-full rounded-lg" />
          </div>
        ) : reportQuery.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {forbidden ? '无权查看该报告' : '报告加载失败'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reportErrorMessage(reportQuery.error)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void reportQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : report ? (
          <>
            {scope === 'team' ? (
              <section aria-labelledby="period-team-overview-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    id="period-team-overview-heading"
                    className="flex items-center gap-1.5 text-sm font-semibold"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    团队总览
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    共 {report.memberStats?.length ?? 0} 位成员
                  </span>
                </div>
                {report.memberStats && report.memberStats.length > 0 ? (
                  <div className="mt-2 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">
                            成员
                          </th>
                          <th scope="col" className="px-3 py-2 text-left font-medium">
                            角色
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            未完成
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            逾期
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            阻塞
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            本期完成
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.memberStats.map((member) => (
                          <tr key={member.userId}>
                            <td className="px-3 py-2 font-medium">{member.name}</td>
                            <td className="px-3 py-2">
                              <Badge variant="muted">{PROJECT_ROLE_LABELS[member.role]}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {member.openTaskCount}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {member.overdueTaskCount}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {member.blockedTaskCount}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {member.completedTaskCount}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => viewMemberReport(member.userId)}
                                aria-label={`查看 ${member.name} 的报告`}
                              >
                                查看报告
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    暂无成员统计。
                  </p>
                )}
                {(report.unassignedOpenTaskCount ?? 0) > 0 ? (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    另有 {report.unassignedOpenTaskCount} 个进行中任务未指派成员，未计入个人报告。
                  </p>
                ) : null}
              </section>
            ) : null}

            {narrative ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="font-medium">总结与建议</span>
                <Badge variant={narrative.source === 'ai' ? 'default' : 'muted'}>
                  {narrative.source === 'ai' ? 'AI' : '本地规则'}
                </Badge>
                {narrative.model ? (
                  <span className="text-muted-foreground">{narrative.model}</span>
                ) : null}
                <span className="text-muted-foreground">
                  生成于 {formatDateTime(narrative.generatedAt)}
                </span>
                {narrative.notice ? (
                  <span className="w-full text-muted-foreground">{narrative.notice}</span>
                ) : null}
              </div>
            ) : null}

            <Card
              aria-labelledby="period-report-preview-heading"
              className="overflow-hidden rounded-lg shadow-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                <h3
                  id="period-report-preview-heading"
                  className="flex items-center gap-1.5 text-sm font-semibold"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  报告预览
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleExportMarkdown}>
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    导出 Markdown
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleExportHtml()}
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    导出可打印 HTML
                  </Button>
                </div>
              </div>
              <div className="p-4 sm:p-5" aria-busy={previewPending}>
                {previewPending || (!previewHtml && !previewError) ? (
                  <PreviewSkeleton />
                ) : previewError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {previewError}
                  </p>
                ) : (
                  <article
                    className="report-markdown"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            </Card>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无可展示的报告数据。
          </p>
        )}
      </div>
    </Card>
  );
}
