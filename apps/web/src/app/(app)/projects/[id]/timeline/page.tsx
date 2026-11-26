'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { Bot, Download, History, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProjectPageError, ProjectPageHeader } from '@/features/activities/project-page-header';
import { describeActivity } from '@/features/activities/activity-description';
import { getErrorMessage } from '@/features/tasks/task-utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Activity, Member, Paginated, Project } from '@/lib/types';
import { avatarColor, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 50;
const EXPORT_MAX_ACTIVITIES = 1000;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  PROJECT_CREATED: '项目创建',
  PROJECT_UPDATED: '项目更新',
  PROJECT_ARCHIVED: '项目归档',
  PROJECT_UNARCHIVED: '项目恢复',
  MEMBER_JOINED: '成员加入',
  MEMBER_REMOVED: '成员移除',
  MEMBER_ROLE_CHANGED: '成员角色变更',
  MEMBER_PERMISSIONS_CHANGED: '成员权限变更',
  COLUMN_CREATED: '新建看板列',
  COLUMN_UPDATED: '更新看板列',
  COLUMN_DELETED: '删除看板列',
  TASK_CREATED: '创建任务',
  TASK_UPDATED: '更新任务',
  TASK_MOVED: '移动任务',
  TASK_COMPLETED: '完成任务',
  TASK_REOPENED: '重新打开任务',
  TASK_ASSIGNED: '指派任务',
  TASK_DELETED: '删除任务',
  TASK_RESTORED: '恢复任务',
  COMMENT_CREATED: '发表评论',
  COMMENT_UPDATED: '更新评论',
  COMMENT_DELETED: '删除评论',
  ATTACHMENT_ADDED: '上传附件',
  ATTACHMENT_DELETED: '删除附件',
  REPORT_GENERATED: '生成周报',
};

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function activityTaskTitle(activity: Activity): string {
  for (const key of ['title', 'taskTitle']) {
    const value = activity.payload[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return '';
}

async function fetchAllActivities(
  projectId: string,
  onProgress: (count: number) => void,
): Promise<Activity[]> {
  const collected: Activity[] = [];
  let cursor: string | null = null;
  do {
    const search = new URLSearchParams({ limit: String(EXPORT_PAGE_SIZE) });
    if (cursor) search.set('cursor', cursor);
    const page = await api<Paginated<Activity>>(
      `/projects/${projectId}/activities?${search.toString()}`,
    );
    collected.push(...page.items);
    cursor = page.nextCursor;
    onProgress(collected.length);
  } while (cursor && collected.length < EXPORT_MAX_ACTIVITIES);
  return collected.slice(0, EXPORT_MAX_ACTIVITIES);
}

function buildActivitiesCsv(activities: Activity[], names: Map<string, string>): string {
  const rows: string[][] = [['时间', '类型', '操作者', '任务', '摘要']];
  for (const activity of activities) {
    const description = describeActivity(activity, names);
    rows.push([
      csvDateTime(activity.createdAt),
      ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type,
      activity.actor?.name ?? '系统',
      activityTaskTitle(activity),
      description.excerpt ? `${description.text}：${description.excerpt}` : description.text,
    ]);
  }
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

function downloadCsvFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function ProjectTimelinePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api<Project>(`/projects/${projectId}`),
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => api<{ items: Member[] }>(`/projects/${projectId}/members`),
  });

  const activitiesQuery = useInfiniteQuery<
    Paginated<Activity>,
    Error,
    InfiniteData<Paginated<Activity>>,
    readonly unknown[],
    string | null
  >({
    queryKey: queryKeys.activities(projectId),
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) search.set('cursor', pageParam);
      return api<Paginated<Activity>>(`/projects/${projectId}/activities?${search.toString()}`);
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of membersQuery.data?.items ?? []) {
      map.set(member.userId, member.name);
    }
    return map;
  }, [membersQuery.data]);

  const activities = activitiesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const [exporting, setExporting] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportedCount(0);
    try {
      const items = await fetchAllActivities(projectId, setExportedCount);
      if (items.length === 0) {
        toast.info('暂无可导出的项目动态');
        return;
      }
      const projectName = projectQuery.data?.name ?? '项目';
      const fileName = `${sanitizeFileName(projectName)}-活动时间线-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      downloadCsvFile(fileName, buildActivitiesCsv(items, names));
      toast.success(`已导出 ${items.length} 条活动`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
      setExportedCount(0);
    }
  };

  return (
    <>
      <ProjectPageHeader projectId={projectId} project={projectQuery.data} />

      {projectQuery.isError ? (
        <ProjectPageError />
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                活动时间线
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                任务、评论、成员与看板变更按时间倒序汇总。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activities.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  已加载 {activities.length} 条动态
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={exporting}
                aria-label="导出全部活动为 CSV"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {exporting ? `导出中…（已获取 ${exportedCount} 条）` : '导出 CSV'}
              </Button>
            </div>
          </div>

          {activitiesQuery.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : activitiesQuery.isError ? (
            <Card className="flex flex-col items-center gap-3 p-8 text-center text-sm">
              <p>活动时间线加载失败，请稍后重试。</p>
              <Button variant="outline" size="sm" onClick={() => void activitiesQuery.refetch()}>
                重试
              </Button>
            </Card>
          ) : activities.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-10 text-center">
              <History className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">还没有项目动态</p>
              <p className="text-sm text-muted-foreground">
                创建任务、发表评论或邀请成员后，活动会出现在这里。
              </p>
            </Card>
          ) : (
            <ol
              className="relative space-y-5 border-l border-border pl-6"
              aria-label="项目活动时间线"
            >
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} names={names} />
              ))}
            </ol>
          )}

          {activitiesQuery.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void activitiesQuery.fetchNextPage()}
                disabled={activitiesQuery.isFetchingNextPage}
              >
                {activitiesQuery.isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                加载更多
              </Button>
            </div>
          ) : activities.length > 0 ? (
            <p className="mt-6 text-center text-xs text-muted-foreground">已经到底了</p>
          ) : null}
        </div>
      )}
    </>
  );
}

function ActivityItem({ activity, names }: { activity: Activity; names: Map<string, string> }) {
  const description = describeActivity(activity, names);
  const actorName = activity.actor?.name ?? '系统';

  return (
    <li className="relative">
      <span className="absolute -left-10 top-0 flex h-8 w-8 items-center justify-center rounded-full border bg-background ring-2 ring-background">
        {activity.actor ? (
          <UserAvatar
            name={activity.actor.name}
            src={activity.actor.avatarUrl}
            color={avatarColor(activity.actor.userId)}
            className="h-8 w-8"
          />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{actorName}</span>
          <span className="text-sm text-muted-foreground">{description.text}</span>
          <time
            className="ml-auto whitespace-nowrap text-xs text-muted-foreground"
            dateTime={activity.createdAt}
          >
            {formatDateTime(activity.createdAt)}
          </time>
        </div>
        {description.meta ? (
          <p className="mt-1 text-xs text-muted-foreground">{description.meta}</p>
        ) : null}
        {description.excerpt ? (
          <blockquote className="mt-2 line-clamp-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {description.excerpt}
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}
