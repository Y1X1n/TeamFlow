import { downloadTextFile, sanitizeFileName } from '@/lib/download';
import { formatDateTime } from '@/lib/utils';
import type { WeeklyReport } from '@/lib/types';
import { formatWeekRange } from './week';

type ReportMetrics = NonNullable<WeeklyReport['data']['metrics']>;

const METRIC_ROWS: Array<{ key: keyof ReportMetrics; label: string }> = [
  { key: 'createdTasks', label: '新增任务' },
  { key: 'completedTasks', label: '完成任务' },
  { key: 'overdueTasks', label: '逾期任务' },
  { key: 'comments', label: '评论数' },
  { key: 'activeMembers', label: '活跃成员' },
  { key: 'totalTasks', label: '总任务数' },
];

export function weeklyReportFileName(report: WeeklyReport, projectName?: string): string {
  const prefix = sanitizeFileName(projectName?.trim() || '项目');
  return `${prefix}-周报-${report.weekStart}-${report.weekEnd}.md`;
}

export function buildWeeklyReportMarkdown(report: WeeklyReport, projectName?: string): string {
  const title = projectName?.trim() || '项目';
  const metrics = report.data.metrics;
  const completion = report.data.completionByMember ?? [];
  const highlights = report.data.highlightTasks ?? [];
  const lines: string[] = [
    `# ${title} 周报（${formatWeekRange(report.weekStart, report.weekEnd)}）`,
    '',
    `> 生成时间：${formatDateTime(report.createdAt)}`,
    '',
    '## 指标概览',
    '',
    '| 指标 | 数值 |',
    '| --- | ---: |',
  ];

  for (const row of METRIC_ROWS) {
    lines.push(`| ${row.label} | ${metrics?.[row.key] ?? 0} |`);
  }

  if (report.data.summary) {
    lines.push('', '## 本周汇总', '', report.data.summary);
  }

  const taskGroups = [
    { title: '完成的任务', tasks: report.data.completedTaskList ?? [] },
    { title: '进行中 / 待推进', tasks: report.data.openTaskList ?? [] },
    { title: '风险与阻塞', tasks: report.data.riskTaskList ?? [] },
    { title: '即将到期', tasks: report.data.upcomingTaskList ?? [] },
  ] as const;

  for (const group of taskGroups) {
    if (group.tasks.length === 0) continue;
    lines.push('', `## ${group.title}`, '');
    for (const task of group.tasks) {
      const meta = [
        task.assigneeName ?? '未指派',
        task.columnName,
        task.reason,
        task.dueDate ? `截止 ${formatDateTime(task.dueDate)}` : null,
      ].filter(Boolean);
      lines.push(`- ${task.title}（${meta.join(' · ')}）`);
    }
  }

  lines.push('', '## 成员完成排行', '');

  if (completion.length === 0) {
    lines.push('_本周没有已指派任务的完成记录。_');
  } else {
    completion.forEach((member, index) => {
      lines.push(`${index + 1}. ${member.name} — ${member.completed} 项`);
    });
  }

  lines.push('', '## 亮点任务', '');

  if (highlights.length === 0) {
    lines.push('_本周没有完成的任务。_');
  } else {
    for (const task of highlights) {
      lines.push(
        task.completedAt
          ? `- ${task.title}（完成于 ${formatDateTime(task.completedAt)}）`
          : `- ${task.title}（未记录完成时间）`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function downloadMarkdownFile(fileName: string, content: string): void {
  downloadTextFile(fileName, content, 'text/markdown;charset=utf-8');
}
