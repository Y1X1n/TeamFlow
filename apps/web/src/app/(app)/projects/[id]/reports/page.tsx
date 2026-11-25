'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ProjectPageError, ProjectPageHeader } from '@/features/activities/project-page-header';
import { CurrentWeekSummaryCard } from '@/features/reports/current-week-summary';
import { PeriodReportSection } from '@/features/reports/period-report-section';
import { WeeklyReportCard } from '@/features/reports/weekly-report-card';
import { currentWeekStart } from '@/features/reports/week';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  MyPermissions,
  Project,
  ReportPeriod,
  ReportScope,
  WeeklyReport,
} from '@/lib/types';

interface PeriodReportInitialParams {
  period?: ReportPeriod;
  scope?: ReportScope;
  date?: string;
  userId?: string;
}

function reportErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有生成报告的权限。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法生成报告。';
      default:
        return error.message;
    }
  }
  return '生成报告失败，请稍后重试。';
}

export default function ProjectReportsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const [openReportIds, setOpenReportIds] = useState<string[]>([]);
  const [initialReportParams, setInitialReportParams] =
    useState<PeriodReportInitialParams | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const period = search.get('period');
    const scope = search.get('scope');
    const date = search.get('date');
    const userId = search.get('userId');
    setInitialReportParams({
      period: period === 'daily' || period === 'weekly' ? period : undefined,
      scope: scope === 'team' || scope === 'member' ? scope : undefined,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      userId: userId ?? undefined,
    });
  }, []);

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api<Project>(`/projects/${projectId}`),
  });
  const permissionsQuery = useQuery({
    queryKey: queryKeys.myPermissions(projectId),
    queryFn: () => api<MyPermissions>(`/projects/${projectId}/permissions/me`),
  });

  const permissions = permissionsQuery.data;
  const permissionSet = new Set(permissions?.permissions ?? []);
  const canView = permissionSet.has('report:view');
  const canGenerate = permissionSet.has('report:generate');
  const archived = Boolean(projectQuery.data?.archived || permissions?.archived);

  const reportsQuery = useQuery({
    queryKey: queryKeys.reports(projectId),
    queryFn: () => api<{ items: WeeklyReport[] }>(`/projects/${projectId}/reports`),
    enabled: canView,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api<WeeklyReport>(`/projects/${projectId}/reports/generate`, {
        method: 'POST',
        body: { weekStart: currentWeekStart() },
      }),
    onSuccess: (report) => {
      toast.success('本周快照已保存');
      setOpenReportIds((previous) =>
        previous.includes(report.id) ? previous : [...previous, report.id],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
    },
    onError: (error) => toast.error(reportErrorText(error)),
  });

  const loading = projectQuery.isPending || permissionsQuery.isPending;
  const loadError = projectQuery.error ?? permissionsQuery.error;
  const reports = [...(reportsQuery.data?.items ?? [])].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart),
  );

  function toggleReport(reportId: string) {
    setOpenReportIds((previous) =>
      previous.includes(reportId)
        ? previous.filter((id) => id !== reportId)
        : [...previous, reportId],
    );
  }

  function generateButton() {
    if (!canGenerate) return null;
    return (
      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending || archived}
        title={archived ? '项目已归档，无法生成周报快照' : undefined}
      >
        {generateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        )}
        保存本周快照
      </Button>
    );
  }

  return (
    <>
      <ProjectPageHeader projectId={projectId} project={projectQuery.data} />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : loadError ? (
        <ProjectPageError />
      ) : !canView ? (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">无权查看报告</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            你的角色没有查看报告的权限（需要 report:view）。
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {initialReportParams ? (
            <PeriodReportSection
              projectId={projectId}
              canView={canView}
              canGenerate={canGenerate}
              archived={archived}
              initialPeriod={initialReportParams.period}
              initialScope={initialReportParams.scope}
              initialDate={initialReportParams.date}
              initialUserId={initialReportParams.userId}
            />
          ) : (
            <Skeleton className="h-64 w-full rounded-xl" />
          )}

          <CurrentWeekSummaryCard
            projectId={projectId}
            canGenerate={canGenerate}
            archived={archived}
          />

          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">历史周报快照</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  每周一自动生成上周快照，也可以手动保存本周快照用于归档与导出。
                </p>
              </div>
              {generateButton()}
            </div>

            {reportsQuery.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : reportsQuery.isError ? (
              <Card className="flex flex-col items-center gap-3 p-8 text-center text-sm">
                <p>周报列表加载失败，请稍后重试。</p>
                <Button variant="outline" size="sm" onClick={() => void reportsQuery.refetch()}>
                  重试
                </Button>
              </Card>
            ) : reports.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">还没有周报</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  系统会每周一自动生成上周快照；负责人或有权限的成员也可以立即保存本周快照。
                </p>
                {canGenerate ? <div className="mt-2">{generateButton()}</div> : null}
              </Card>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <WeeklyReportCard
                    key={report.id}
                    report={report}
                    projectId={projectId}
                    projectName={projectQuery.data?.name}
                    expanded={openReportIds.includes(report.id)}
                    onToggle={toggleReport}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
