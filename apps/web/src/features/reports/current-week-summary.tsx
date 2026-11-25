'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarRange, Mail, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CurrentWeekSummary } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatWeekRange } from './week';
import { WeekTaskList } from './week-task-list';
import { ReportEmailDialog } from './report-email-dialog';

const METRIC_ITEMS = [
  { key: 'createdTasks', label: '本周新增', tone: 'text-indigo-600' },
  { key: 'completedTasks', label: '已完成', tone: 'text-emerald-600' },
  { key: 'activeTasks', label: '进行中', tone: 'text-sky-600' },
  { key: 'overdueTasks', label: '逾期', tone: 'text-rose-600' },
  { key: 'blockedTasks', label: '依赖阻塞', tone: 'text-amber-600' },
  { key: 'activeMembers', label: '活跃成员', tone: 'text-violet-600' },
] as const;

export function CurrentWeekSummaryCard({
  projectId,
  canGenerate,
  archived,
}: {
  projectId: string;
  canGenerate: boolean;
  archived: boolean;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const summaryQuery = useQuery<CurrentWeekSummary, Error>({
    queryKey: queryKeys.currentWeekReport(projectId),
    queryFn: () => api<CurrentWeekSummary>(`/projects/${projectId}/reports/current`),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const data = summaryQuery.data;

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              本周实时汇总
              <Badge variant="muted">自动更新</Badge>
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {data ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatWeekRange(data.weekStart, data.weekEnd)}
                  </span>
                  <span>· 更新于 {formatDateTime(data.generatedAt)}</span>
                  <span>· 每分钟自动刷新</span>
                </>
              ) : (
                '根据当前任务进度自动汇总，无需手动生成'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void summaryQuery.refetch()}
              disabled={summaryQuery.isFetching}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', summaryQuery.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              刷新
            </Button>
            {canGenerate ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setEmailOpen(true)}
                disabled={archived}
                title={archived ? '项目已归档，无法发送周报邮件' : undefined}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                智能发送邮件
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-5">
        {summaryQuery.isPending ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only">正在加载本周实时汇总</span>
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </div>
          </div>
        ) : summaryQuery.isError || !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">本周汇总加载失败</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summaryQuery.error instanceof ApiError ? summaryQuery.error.message : '请稍后重试。'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void summaryQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-6">
              {data.summary}
            </p>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {METRIC_ITEMS.map((item) => (
                <div key={item.key} className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  <div className={cn('mt-0.5 text-xl font-semibold tabular-nums', item.tone)}>
                    {data.metrics[item.key]}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <WeekTaskList
                title="本周完成"
                tasks={data.completedTaskList}
                emptyText="本周暂无已完成任务。"
                projectId={projectId}
                tone="success"
                icon="check"
              />
              <WeekTaskList
                title="进行中 / 待推进"
                tasks={data.openTaskList}
                emptyText="当前没有待推进任务。"
                projectId={projectId}
                icon="timer"
              />
              <WeekTaskList
                title="风险与阻塞"
                tasks={data.riskTaskList}
                emptyText="当前没有逾期或被依赖阻塞的任务。"
                projectId={projectId}
                tone={data.riskTaskList.length > 0 ? 'danger' : 'default'}
                icon="alert"
              />
              <WeekTaskList
                title="即将到期"
                tasks={data.upcomingTaskList}
                emptyText="未来 7 天没有即将到期的任务。"
                projectId={projectId}
                tone="warning"
                icon="timer"
              />
            </div>

            {archived ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                项目已归档，实时汇总仍可查看，但邮件发送已停用。
              </p>
            ) : null}
          </div>
        )}
      </div>

      {canGenerate ? (
        <ReportEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          projectId={projectId}
          canGenerate={canGenerate}
        />
      ) : null}
    </Card>
  );
}
