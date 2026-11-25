import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { sanitizeFileName } from '@/lib/download';
import type { PeriodReport, PeriodReportNarrative, WeekTaskRef } from '@/lib/types';

const PERIOD_LABELS: Record<PeriodReport['period'], string> = {
  daily: '日报',
  weekly: '周报',
};

const METRIC_ROWS: Array<{ key: keyof PeriodReport['metrics']; label: string }> = [
  { key: 'createdTasks', label: '新增' },
  { key: 'completedTasks', label: '完成' },
  { key: 'activeTasks', label: '进行中' },
  { key: 'overdueTasks', label: '逾期' },
  { key: 'blockedTasks', label: '阻塞' },
  { key: 'comments', label: '评论' },
  { key: 'activeMembers', label: '活跃成员' },
  { key: 'totalTasks', label: '总任务' },
];

const TASK_GROUPS: Array<{
  title: string;
  emptyText: string;
  pick: (report: PeriodReport) => WeekTaskRef[];
}> = [
  { title: '本期完成', emptyText: '_本期暂无已完成任务。_', pick: (report) => report.completedTaskList },
  { title: '进行中', emptyText: '_当前没有进行中的任务。_', pick: (report) => report.openTaskList },
  { title: '风险与阻塞', emptyText: '_当前没有风险或阻塞任务。_', pick: (report) => report.riskTaskList },
  {
    title: '接下来 7 天到期',
    emptyText: '_未来 7 天没有即将到期的任务。_',
    pick: (report) => report.upcomingTaskList,
  },
];

function cleanInlineText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeTableCell(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (match?.[1]) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function periodReportTitle(report: PeriodReport, projectName?: string): string {
  const project = cleanInlineText(projectName?.trim() || report.project.name?.trim() || '项目');
  const periodLabel = PERIOD_LABELS[report.period];
  const dateRange =
    report.period === 'daily'
      ? report.startDate
      : `${report.startDate} ~ ${report.endDate}`;
  return `${project} ${periodLabel}（${dateRange}）`;
}

function formatTaskBullet(task: WeekTaskRef): string {
  const title = cleanInlineText(task.title) || '未命名任务';
  const meta = [
    `负责人：${cleanInlineText(task.assigneeName ?? '未指派')}`,
    `列：${cleanInlineText(task.columnName)}`,
  ];
  if (task.reason) meta.push(`原因：${cleanInlineText(task.reason)}`);
  if (task.dueDate) meta.push(`截止：${formatDateOnly(task.dueDate)}`);
  return `- **${title}** — ${meta.join(' · ')}`;
}

export function buildPeriodReportMarkdown(
  report: PeriodReport,
  narrative?: PeriodReportNarrative | null,
  projectName?: string,
): string {
  const lines: string[] = [`# ${periodReportTitle(report, projectName)}`, ''];

  const scopeLabel =
    report.scope === 'team'
      ? '团队'
      : `成员（${cleanInlineText(report.assignee?.name ?? '当前成员')}）`;
  lines.push(`> 范围：${scopeLabel} · 生成时间：${formatTimestamp(report.generatedAt)}`);

  if (narrative) {
    const sourceLabel =
      narrative.source === 'ai'
        ? `AI${narrative.model ? `（${cleanInlineText(narrative.model)}）` : ''}`
        : '本地规则';
    lines.push('', '## 总结与建议', '', `> 来源：${sourceLabel}`);
    if (narrative.notice) lines.push('', `> ${cleanInlineText(narrative.notice)}`);
    lines.push('', narrative.narrative.trim() || '_暂无摘要。_');
  }

  lines.push('', '## 数据摘要', '', report.summary.trim() || '_暂无摘要。_');

  lines.push('', '## 指标概览', '', '| 指标 | 数值 |', '| --- | ---: |');
  for (const row of METRIC_ROWS) {
    lines.push(`| ${row.label} | ${report.metrics[row.key]} |`);
  }

  if (report.memberStats) {
    lines.push(
      '',
      '## 成员总览',
      '',
      '| 成员 | 角色 | 未完成 | 逾期 | 阻塞 | 本期完成 |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
    );
    if (report.memberStats.length === 0) {
      lines.push('| _暂无成员统计_ | — | — | — | — | — |');
    } else {
      for (const member of report.memberStats) {
        lines.push(
          `| ${escapeTableCell(member.name)} | ${escapeTableCell(PROJECT_ROLE_LABELS[member.role])} | ${member.openTaskCount} | ${member.overdueTaskCount} | ${member.blockedTaskCount} | ${member.completedTaskCount} |`,
        );
      }
    }
    if ((report.unassignedOpenTaskCount ?? 0) > 0) {
      lines.push(
        '',
        `> 另有 ${report.unassignedOpenTaskCount} 个进行中任务未指派成员，未计入个人报告。`,
      );
    }
  }

  for (const group of TASK_GROUPS) {
    const tasks = group.pick(report);
    lines.push('', `## ${group.title}`, '');
    if (tasks.length === 0) {
      lines.push(group.emptyText);
    } else {
      for (const task of tasks) lines.push(formatTaskBullet(task));
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapPrintableReportHtml(
  title: string,
  renderedHtml: string,
  generatedAt: string,
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eef0f4;
    color: #1f2937;
    font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.7;
  }
  .report-actions {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    background: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid #e5e7eb;
    backdrop-filter: blur(6px);
  }
  .report-actions button {
    cursor: pointer;
    border: 1px solid #6366f1;
    border-radius: 6px;
    background: #6366f1;
    color: #fff;
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
  }
  .report-actions button:hover { background: #4f46e5; }
  .report-page {
    max-width: 820px;
    margin: 24px auto 48px;
    padding: 40px 48px 48px;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
  }
  .report-generated {
    margin: 0 0 20px;
    color: #6b7280;
    font-size: 12px;
  }
  .report-markdown h1 {
    margin: 0 0 16px;
    font-size: 24px;
    line-height: 1.35;
  }
  .report-markdown h2 {
    margin: 28px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 18px;
  }
  .report-markdown h3 { margin: 20px 0 8px; font-size: 16px; }
  .report-markdown p { margin: 10px 0; }
  .report-markdown ul, .report-markdown ol { margin: 10px 0; padding-left: 22px; }
  .report-markdown li { margin: 4px 0; }
  .report-markdown blockquote {
    margin: 14px 0;
    padding: 8px 14px;
    border-left: 3px solid #6366f1;
    background: #f5f7ff;
    color: #374151;
  }
  .report-markdown table {
    width: 100%;
    margin: 14px 0;
    border-collapse: collapse;
    font-size: 13px;
  }
  .report-markdown th, .report-markdown td {
    border: 1px solid #d1d5db;
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }
  .report-markdown th { background: #f3f4f6; font-weight: 600; }
  .report-markdown code {
    padding: 1px 4px;
    border-radius: 4px;
    background: #f3f4f6;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  .report-markdown a { color: #4f46e5; }
  @page { size: A4; margin: 16mm 14mm; }
  @media print {
    body { background: #fff; font-size: 12px; }
    .report-actions { display: none !important; }
    .report-page {
      max-width: none;
      margin: 0;
      padding: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .report-generated { margin-bottom: 12px; }
    .report-markdown h1 { font-size: 20px; }
    .report-markdown h2 { font-size: 16px; break-after: avoid; }
    .report-markdown h3 { break-after: avoid; }
    .report-markdown table, .report-markdown blockquote, .report-markdown li {
      break-inside: avoid;
    }
    .report-markdown a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
  <div class="report-actions" role="toolbar" aria-label="报告操作">
    <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
  </div>
  <main class="report-page">
    <p class="report-generated">生成时间：${escapeHtml(generatedAt)}</p>
    <article class="report-markdown">${renderedHtml}</article>
  </main>
</body>
</html>
`;
}

export function periodReportFileName(
  report: PeriodReport,
  projectName: string | undefined,
  ext: 'md' | 'html',
): string {
  const project = sanitizeFileName(projectName?.trim() || report.project.name?.trim() || '项目');
  const periodLabel = PERIOD_LABELS[report.period];
  const dateRange =
    report.period === 'daily' ? report.startDate : `${report.startDate}-${report.endDate}`;
  return `${project}-${periodLabel}-${dateRange}.${ext}`;
}
