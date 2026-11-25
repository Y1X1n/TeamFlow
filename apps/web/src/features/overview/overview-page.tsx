'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, ListTodo, UserMinus } from 'lucide-react';
import { useMemo } from 'react';
import { ProjectPageError, ProjectPageHeader } from '@/features/activities/project-page-header';
import {
  MetricCard,
  PriorityCard,
  RecentActivityCard,
  UpcomingCard,
  WorkloadCard,
} from './overview-sections';
import { summarizeBoard } from './overview-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Activity, BoardData, Paginated } from '@/lib/types';

const overviewActivitiesKey = (projectId: string) => ['activities', projectId, 'overview'] as const;

export function ProjectOverviewPage({ projectId }: { projectId: string }) {
  const boardQuery = useQuery<BoardData, Error>({
    queryKey: queryKeys.board(projectId),
    queryFn: () => api<BoardData>(`/projects/${projectId}/board`),
  });

  const activitiesQuery = useQuery<Paginated<Activity>, Error>({
    queryKey: overviewActivitiesKey(projectId),
    queryFn: () => api<Paginated<Activity>>(`/projects/${projectId}/activities?limit=20`),
  });

  const summary = useMemo(
    () => (boardQuery.data ? summarizeBoard(boardQuery.data) : null),
    [boardQuery.data],
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of boardQuery.data?.members ?? []) {
      map.set(member.userId, member.name);
    }
    return map;
  }, [boardQuery.data]);

  return (
    <div>
      <ProjectPageHeader projectId={projectId} project={boardQuery.data?.project} />

      {boardQuery.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">正在加载项目概览…</span>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <Skeleton className="h-56 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : boardQuery.isError || !summary ? (
        <ProjectPageError />
      ) : (
        <div className="space-y-6">
          <section aria-label="关键指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="总任务"
              value={summary.metrics.total}
              hint={`已完成 ${summary.metrics.completed} 项`}
              icon={ListTodo}
            />
            <MetricCard
              label="完成率"
              value={`${summary.metrics.completionRate}%`}
              hint={`${summary.metrics.completed}/${summary.metrics.total} 已完成`}
              icon={CheckCircle2}
              tone="success"
            />
            <MetricCard
              label="逾期任务"
              value={summary.metrics.overdue}
              hint={summary.metrics.overdue > 0 ? '需要尽快处理' : '暂无逾期，保持节奏'}
              icon={AlertTriangle}
              tone="danger"
            />
            <MetricCard
              label="本周到期"
              value={summary.metrics.dueThisWeek}
              hint="按周一至周日统计的截止任务"
              icon={CalendarClock}
              tone="warning"
            />
            <MetricCard
              label="未指派"
              value={summary.metrics.unassigned}
              hint="未完成任务中还没有负责人"
              icon={UserMinus}
              tone="muted"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <WorkloadCard workload={summary.workload} />
              <PriorityCard priority={summary.priority} openTaskCount={summary.openTaskCount} />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <UpcomingCard projectId={projectId} upcoming={summary.upcoming} />
              <RecentActivityCard
                activities={activitiesQuery.data?.items ?? []}
                names={names}
                isLoading={activitiesQuery.isPending}
                isError={activitiesQuery.isError}
                onRetry={() => void activitiesQuery.refetch()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
