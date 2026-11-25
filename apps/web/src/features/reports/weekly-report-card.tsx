'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Layers,
  ListPlus,
  MessageSquare,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { WeeklyReport } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import {
  buildWeeklyReportMarkdown,
  downloadMarkdownFile,
  weeklyReportFileName,
} from './export-markdown';
import { formatWeekRange } from './week';
import { WeekTaskList } from './week-task-list';

interface MetricItem {
  key:
    | 'createdTasks'
    | 'completedTasks'
    | 'overdueTasks'
    | 'comments'
    | 'activeMembers'
    | 'totalTasks';
  label: string;
  icon: LucideIcon;
  tone: string;
}

const METRIC_ITEMS: MetricItem[] = [
  { key: 'createdTasks', label: '新增任务', icon: ListPlus, tone: 'text-indigo-600' },
  { key: 'completedTasks', label: '完成任务', icon: CheckCircle2, tone: 'text-emerald-600' },
  { key: 'overdueTasks', label: '逾期任务', icon: AlertTriangle, tone: 'text-rose-600' },
  { key: 'comments', label: '评论数', icon: MessageSquare, tone: 'text-sky-600' },
  { key: 'activeMembers', label: '活跃成员', icon: Users, tone: 'text-violet-600' },
  { key: 'totalTasks', label: '总任务数', icon: Layers, tone: 'text-slate-600' },
];

interface RankingRow {
  id: string;
  name: string;
  value: number;
}

function Ranking({
  title,
  rows,
  unit,
  emptyText,
}: {
  title: string;
  rows: RankingRow[];
  unit: string;
  emptyText: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section className="rounded-lg border p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row, index) => (
            <li key={row.id}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-muted-foreground">{index + 1}</span>
                  <span className="truncate font-medium">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {row.value} {unit}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.max(6, Math.round((row.value / max) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface WeeklyReportCardProps {
  report: WeeklyReport;
  expanded: boolean;
  onToggle: (reportId: string) => void;
  projectId: string;
  projectName?: string;
}

export function WeeklyReportCard({
  report,
  expanded,
  onToggle,
  projectId,
  projectName,
}: WeeklyReportCardProps) {
  const panelId = useId();
  const metrics = report.data.metrics;
  const completion = report.data.completionByMember ?? [];
  const activeMembers = report.data.activeMemberDetails ?? [];
  const highlights = report.data.highlightTasks ?? [];
  const completedTasks = report.data.completedTaskList ?? [];
  const openTasks = report.data.openTaskList ?? [];
  const riskTasks = report.data.riskTaskList ?? [];
  const upcomingTasks = report.data.upcomingTaskList ?? [];
  const hasTaskGroups =
    completedTasks.length + openTasks.length + riskTasks.length + upcomingTasks.length > 0;

  const handleExport = () => {
    const markdown = buildWeeklyReportMarkdown(report, projectName);
    downloadMarkdownFile(weeklyReportFileName(report, projectName), markdown);
    toast.success('周报 Markdown 已开始下载');
  };

  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-2 pr-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onToggle(report.id)}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">
              {formatWeekRange(report.weekStart, report.weekEnd)} 周报
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              生成于 {formatDateTime(report.createdAt)} · 完成 {metrics?.completedTasks ?? 0} 项任务
            </span>
          </span>
          <ChevronDown
            className={cn(
              'mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform',
              expanded ? 'rotate-180' : undefined,
            )}
            aria-hidden="true"
          />
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-5 shrink-0 whitespace-nowrap"
          onClick={handleExport}
          aria-label={`导出 ${formatWeekRange(report.weekStart, report.weekEnd)} 周报为 Markdown`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          导出 Markdown
        </Button>
      </div>

      <div id={panelId} hidden={!expanded} className="border-t p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {METRIC_ITEMS.map((item) => (
            <div key={item.key} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <item.icon className={cn('h-3.5 w-3.5', item.tone)} aria-hidden="true" />
                {item.label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {metrics?.[item.key] ?? 0}
              </div>
            </div>
          ))}
        </div>

        {report.data.summary ? (
          <p className="mt-4 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-6">
            {report.data.summary}
          </p>
        ) : null}

        {hasTaskGroups ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <WeekTaskList
              title="完成的任务"
              tasks={completedTasks}
              emptyText="本周暂无已完成任务。"
              projectId={projectId}
              tone="success"
              icon="check"
            />
            <WeekTaskList
              title="进行中 / 待推进"
              tasks={openTasks}
              emptyText="报告生成时没有待推进任务。"
              projectId={projectId}
              icon="timer"
            />
            <WeekTaskList
              title="风险与阻塞"
              tasks={riskTasks}
              emptyText="报告生成时没有逾期或被依赖阻塞的任务。"
              projectId={projectId}
              tone={riskTasks.length > 0 ? 'danger' : 'default'}
              icon="alert"
            />
            <WeekTaskList
              title="即将到期"
              tasks={upcomingTasks}
              emptyText="未来 7 天没有即将到期的任务。"
              projectId={projectId}
              tone="warning"
              icon="timer"
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Ranking
            title="成员完成排行"
            unit="项"
            emptyText="本周没有已指派任务的完成记录。"
            rows={completion.map((member) => ({
              id: member.userId,
              name: member.name,
              value: member.completed,
            }))}
          />
          <Ranking
            title="活跃成员排行"
            unit="次"
            emptyText="本周暂无成员操作记录。"
            rows={activeMembers.map((member) => ({
              id: member.userId,
              name: member.name,
              value: member.actions,
            }))}
          />
        </div>

        <section className="mt-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">亮点任务</h4>
          {highlights.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">本周没有完成的任务。</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {highlights.map((task) => (
                <li
                  key={task.taskId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <Link
                    href={`/projects/${projectId}?task=${encodeURIComponent(task.taskId)}`}
                    className="min-w-0 truncate rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {task.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(task.completedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
