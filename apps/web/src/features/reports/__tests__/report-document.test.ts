import { describe, expect, it } from 'vitest';
import type { PeriodReport, PeriodReportNarrative, WeekTaskRef } from '@/lib/types';
import {
  buildPeriodReportMarkdown,
  periodReportFileName,
  wrapPrintableReportHtml,
} from '../report-document';

function makeTask(overrides: Partial<WeekTaskRef> = {}): WeekTaskRef {
  return {
    taskId: 'task-1',
    title: '示例任务',
    columnName: '进行中',
    assigneeName: '张三',
    priority: 'MEDIUM',
    dueDate: '2026-11-27',
    completedAt: null,
    blockedByCount: 0,
    blockedByTitles: [],
    ...overrides,
  };
}

function makeReport(overrides: Partial<PeriodReport> = {}): PeriodReport {
  return {
    project: { id: 'project-1', name: 'Alpha', color: '#6366f1', archived: false },
    period: 'weekly',
    scope: 'team',
    startDate: '2026-11-23',
    endDate: '2026-11-29',
    generatedAt: '2026-11-29T10:00:00.000Z',
    assignee: null,
    metrics: {
      createdTasks: 5,
      completedTasks: 4,
      activeTasks: 3,
      overdueTasks: 2,
      blockedTasks: 1,
      comments: 7,
      activeMembers: 3,
      totalTasks: 12,
    },
    summary: '本周整体进展顺利。',
    memberStats: [
      {
        userId: 'user-1',
        name: '张|三\n李',
        role: 'MEMBER',
        openTaskCount: 2,
        overdueTaskCount: 1,
        blockedTaskCount: 1,
        completedTaskCount: 3,
        totalTaskCount: 6,
      },
    ],
    unassignedOpenTaskCount: 2,
    activeMemberDetails: [{ userId: 'user-1', name: '张三', actions: 8 }],
    completionByMember: [{ userId: 'user-1', name: '张三', completed: 3 }],
    highlightTasks: [{ taskId: 'task-1', title: '完成 任务', completedAt: '2026-11-25T09:00:00.000Z' }],
    completedTaskList: [
      makeTask({
        taskId: 'task-1',
        title: '完成\n任务',
        columnName: '已完成',
        completedAt: '2026-11-25T09:00:00.000Z',
      }),
    ],
    openTaskList: [makeTask({ taskId: 'task-2', title: '进行中的任务' })],
    riskTaskList: [
      makeTask({
        taskId: 'task-3',
        title: '风险任务',
        columnName: '待办',
        reason: '已逾期 2 天',
        dueDate: '2026-11-20',
      }),
    ],
    upcomingTaskList: [makeTask({ taskId: 'task-4', title: '即将到期任务', dueDate: '2026-11-30' })],
    ...overrides,
  };
}

describe('buildPeriodReportMarkdown', () => {
  it('includes title, scope, metrics, member table and task sections', () => {
    const markdown = buildPeriodReportMarkdown(makeReport(), null, 'Alpha');

    expect(markdown).toContain('# Alpha 周报（2026-11-23 ~ 2026-11-29）');
    expect(markdown).toContain('> 范围：团队 · 生成时间：');
    expect(markdown).toContain('## 数据摘要');
    expect(markdown).toContain('本周整体进展顺利。');
    expect(markdown).toContain('## 指标概览');
    expect(markdown).toContain('| 新增 | 5 |');
    expect(markdown).toContain('| 完成 | 4 |');
    expect(markdown).toContain('| 进行中 | 3 |');
    expect(markdown).toContain('| 逾期 | 2 |');
    expect(markdown).toContain('| 阻塞 | 1 |');
    expect(markdown).toContain('| 评论 | 7 |');
    expect(markdown).toContain('| 活跃成员 | 3 |');
    expect(markdown).toContain('| 总任务 | 12 |');
    expect(markdown).toContain('## 成员总览');
    expect(markdown).toContain('| 成员 | 角色 | 未完成 | 逾期 | 阻塞 | 本期完成 |');
    expect(markdown).toContain('| 张\\|三<br>李 | 成员 | 2 | 1 | 1 | 3 |');
    expect(markdown).toContain('另有 2 个进行中任务未指派成员');
    expect(markdown).toContain('## 本期完成');
    expect(markdown).toContain('- **完成 任务** — 负责人：张三 · 列：已完成');
    expect(markdown).toContain('## 进行中');
    expect(markdown).toContain('- **进行中的任务**');
    expect(markdown).toContain('## 风险与阻塞');
    expect(markdown).toContain('原因：已逾期 2 天');
    expect(markdown).toContain('## 接下来 7 天到期');
    expect(markdown).toContain('- **即将到期任务**');
  });

  it('renders narrative with AI or local source labels', () => {
    const narrative: PeriodReportNarrative = {
      narrative: '建议下周继续聚焦风险任务。',
      source: 'ai',
      model: 'test-model',
      notice: 'AI 生成内容，仅供参考。',
      generatedAt: '2026-11-29T10:05:00.000Z',
    };

    const markdown = buildPeriodReportMarkdown(makeReport(), narrative, 'Alpha');
    expect(markdown).toContain('## 总结与建议');
    expect(markdown).toContain('> 来源：AI（test-model）');
    expect(markdown).toContain('AI 生成内容，仅供参考。');
    expect(markdown).toContain('建议下周继续聚焦风险任务。');

    const local = buildPeriodReportMarkdown(
      makeReport(),
      { ...narrative, source: 'local', model: null, notice: null },
      'Alpha',
    );
    expect(local).toContain('> 来源：本地规则');
  });

  it('uses a single date for daily reports', () => {
    const daily = makeReport({
      period: 'daily',
      startDate: '2026-11-25',
      endDate: '2026-11-25',
    });
    expect(buildPeriodReportMarkdown(daily, null, 'Alpha')).toContain(
      '# Alpha 日报（2026-11-25）',
    );
  });

  it('escapes pipes and newlines in table cells and cleans task titles', () => {
    const markdown = buildPeriodReportMarkdown(makeReport(), null, 'Alpha');

    expect(markdown).toContain('| 张\\|三<br>李 |');
    expect(markdown).not.toContain('张|三');
    expect(markdown).toContain('- **完成 任务**');
    expect(markdown).not.toContain('完成\n任务');
  });
});

describe('wrapPrintableReportHtml', () => {
  it('wraps sanitized HTML in a standalone printable document', () => {
    const html = wrapPrintableReportHtml(
      '测试 <报告>',
      '<h1>内容</h1><table><tr><td>数据</td></tr></table>',
      '2026-11-29T10:00:00.000Z',
    );

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta charset="utf-8"');
    expect(html).toContain('<title>测试 &lt;报告&gt;</title>');
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('@media print');
    expect(html).toContain('window.print()');
    expect(html).toContain('打印 / 另存为 PDF');
    expect(html).toContain('.report-actions { display: none !important; }');
    expect(html).toContain('table');
    expect(html).toContain('<h1>内容</h1>');
    expect(html).toContain('生成时间：2026-11-29T10:00:00.000Z');
  });
});

describe('periodReportFileName', () => {
  it('sanitizes project names and uses the right extension', () => {
    const report = makeReport();
    expect(periodReportFileName(report, ' 团队/Alpha:*? ', 'md')).toBe(
      '团队-Alpha-周报-2026-11-23-2026-11-29.md',
    );
    expect(periodReportFileName(report, 'Alpha', 'html')).toBe(
      'Alpha-周报-2026-11-23-2026-11-29.html',
    );
  });

  it('uses the daily label and dates', () => {
    const daily = makeReport({
      period: 'daily',
      startDate: '2026-11-25',
      endDate: '2026-11-25',
    });
    expect(periodReportFileName(daily, undefined, 'md')).toBe(
      'Alpha-日报-2026-11-25.md',
    );
  });
});
