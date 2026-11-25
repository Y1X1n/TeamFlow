import type { TaskPriority } from '@teamflow/shared/enums';
import { buildPeriodSummary, type WeekMetrics, type WeekTaskRef } from './reports.service';

interface SummaryTask {
  id: string;
  title: string;
  priority: TaskPriority;
  columnId: string;
  assigneeId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assignee: { name: string } | null;
  column: { name: string; isDone: boolean };
  blockedByDependencies: Array<{ blockedBy: { title: string } }>;
}

function task(overrides: Partial<SummaryTask> = {}): SummaryTask {
  return {
    id: 'task-1',
    title: '任务',
    priority: 'MEDIUM',
    columnId: 'column-1',
    assigneeId: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-11-20T00:00:00.000Z'),
    assignee: null,
    column: { name: '进行中', isDone: false },
    blockedByDependencies: [],
    ...overrides,
  };
}

function metrics(overrides: Partial<WeekMetrics> = {}): WeekMetrics {
  return {
    createdTasks: 3,
    completedTasks: 2,
    activeTasks: 5,
    overdueTasks: 1,
    blockedTasks: 1,
    comments: 4,
    activeMembers: 2,
    totalTasks: 10,
    ...overrides,
  };
}

function risk(title: string, reason = '逾期'): WeekTaskRef {
  return {
    taskId: title,
    title,
    columnName: '进行中',
    assigneeName: null,
    priority: 'HIGH',
    dueDate: null,
    completedAt: null,
    blockedByCount: 0,
    blockedByTitles: [],
    reason,
  };
}

describe('buildPeriodSummary', () => {
  it('describes a daily team report with today wording', () => {
    const summary = buildPeriodSummary({
      period: 'daily',
      scope: 'team',
      metrics: metrics(),
      completion: [{ name: '张三', completed: 2 }],
      risks: [],
      open: [],
    });
    expect(summary).toContain('今日新增 3 个任务，完成 2 个；当前 5 个待推进');
    expect(summary).toContain('共有 2 位成员参与协作，新增评论 4 条。');
    expect(summary).toContain('完成最多的是 张三（2 项）。');
    expect(summary).not.toContain('本周');
  });

  it('describes a weekly member report with the member name', () => {
    const summary = buildPeriodSummary({
      period: 'weekly',
      scope: 'member',
      memberName: '李四',
      metrics: metrics({ createdTasks: 1, completedTasks: 2, comments: 0 }),
      completion: [{ name: '李四', completed: 2 }],
      risks: [],
      open: [],
    });
    expect(summary).toContain('本周，李四新增 1 个任务，完成 2 个；当前负责 5 个待推进任务');
    expect(summary).toContain('其中 1 个逾期、1 个被依赖阻塞。');
    expect(summary).not.toContain('完成最多的是');
    expect(summary).not.toContain('新增评论');
  });

  it('falls back to a neutral member label when the name is missing', () => {
    const summary = buildPeriodSummary({
      period: 'daily',
      scope: 'member',
      metrics: metrics(),
      completion: [],
      risks: [],
      open: [],
    });
    expect(summary).toContain('今日，该成员新增 3 个任务');
  });

  it('lists at most three risks and mentions the total count', () => {
    const summary = buildPeriodSummary({
      period: 'weekly',
      scope: 'team',
      metrics: metrics({ activeMembers: 0 }),
      completion: [],
      risks: [risk('A'), risk('B'), risk('C'), risk('D')],
      open: [],
    });
    expect(summary).toContain('建议优先关注「A」、「B」、「C」 等 4 个风险任务。');
    expect(summary).not.toContain('「D」');
  });

  it('states that there are no risks when none are given', () => {
    const summary = buildPeriodSummary({
      period: 'weekly',
      scope: 'team',
      metrics: metrics(),
      completion: [],
      risks: [],
      open: [],
    });
    expect(summary).toContain('当前没有逾期或被依赖阻塞的任务。');
  });

  it('only suggests open tasks that are not already listed as risks', () => {
    const summary = buildPeriodSummary({
      period: 'weekly',
      scope: 'team',
      metrics: metrics(),
      completion: [],
      risks: [risk('风险任务')],
      open: [
        task({ id: '风险任务', title: '风险任务' }),
        task({ id: 'o1', title: '下一步甲' }),
        task({ id: 'o2', title: '下一步乙' }),
      ],
    });
    expect(summary).toContain('接下来建议优先推进「下一步甲」、「下一步乙」。');
    expect(summary).not.toContain('接下来建议优先推进「风险任务」');
  });

  it('does not fabricate a leader or collaboration line without facts', () => {
    const summary = buildPeriodSummary({
      period: 'daily',
      scope: 'team',
      metrics: {
        createdTasks: 0,
        completedTasks: 0,
        activeTasks: 0,
        overdueTasks: 0,
        blockedTasks: 0,
        comments: 0,
        activeMembers: 0,
        totalTasks: 0,
      },
      completion: [],
      risks: [],
      open: [],
    });
    expect(summary).toBe(
      '今日新增 0 个任务，完成 0 个；当前 0 个待推进，其中 0 个逾期、0 个被依赖阻塞。当前没有逾期或被依赖阻塞的任务。',
    );
  });
});
