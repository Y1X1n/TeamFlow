import { describe, expect, it, vi } from 'vitest';
import type { AiPlanStep } from '@/lib/types';
import {
  buildPlanTaskPayload,
  createPlanDrafts,
  createPlanSequentially,
  createSubtasksSequentially,
  DEFAULT_PLAN_DUE_TIME,
  formatDependsOn,
  normalizeDependsOn,
  PLAN_STEP_TITLE_MAX_LENGTH,
  planDependencyPairs,
  planDueDateFromDays,
  type BreakdownRow,
  type PlanCreationHandlers,
  type PlanStepDraft,
} from '../task-plan-utils';

function stepDraft(overrides: Partial<PlanStepDraft> = {}): PlanStepDraft {
  return {
    key: 'plan-step-0',
    stepIndex: 0,
    title: '设计接口',
    checked: true,
    assigneeId: null,
    priority: 'MEDIUM',
    dueDate: '',
    dependsOn: [],
    reason: null,
    ...overrides,
  };
}

function planStep(overrides: Partial<AiPlanStep> = {}): AiPlanStep {
  return {
    title: '设计接口',
    reason: null,
    suggestedAssigneeId: null,
    suggestedAssigneeName: null,
    priority: 'MEDIUM',
    dueInDays: null,
    dependsOn: [],
    ...overrides,
  };
}

describe('planDueDateFromDays', () => {
  const now = new Date(2026, 10, 25, 9, 30);

  it('returns an empty value for missing or out-of-range suggestions', () => {
    expect(planDueDateFromDays(null, now)).toBe('');
    expect(planDueDateFromDays(0, now)).toBe('');
    expect(planDueDateFromDays(-2, now)).toBe('');
    expect(planDueDateFromDays(31, now)).toBe('');
    expect(planDueDateFromDays(1.5, now)).toBe('');
  });

  it('adds days in the local date and keeps the default deadline time', () => {
    expect(planDueDateFromDays(2, now)).toBe(`2026-11-27T${DEFAULT_PLAN_DUE_TIME}`);
  });

  it('handles month and year rollovers', () => {
    expect(planDueDateFromDays(30, new Date(2026, 11, 31, 8, 0))).toBe(
      `2027-01-30T${DEFAULT_PLAN_DUE_TIME}`,
    );
    expect(planDueDateFromDays(1, new Date(2026, 11, 31, 23, 59))).toBe(
      `2027-01-01T${DEFAULT_PLAN_DUE_TIME}`,
    );
  });
});

describe('formatDependsOn', () => {
  it('renders 1-based step labels', () => {
    expect(formatDependsOn([0, 2])).toBe('依赖第 1、3 步');
    expect(formatDependsOn([2, 0, 0])).toBe('依赖第 1、3 步');
  });

  it('returns a placeholder when there is no dependency', () => {
    expect(formatDependsOn([])).toBe('无依赖');
    expect(formatDependsOn([-1, 1.2])).toBe('无依赖');
  });
});

describe('normalizeDependsOn', () => {
  it('drops self references, out-of-range indexes and duplicates', () => {
    expect(normalizeDependsOn([1, 1, -1, 2, 3, 0, 0.5], 0, 3)).toEqual([1, 2]);
  });

  it('sorts the result', () => {
    expect(normalizeDependsOn([3, 1, 2], 0, 4)).toEqual([1, 2, 3]);
  });
});

describe('createPlanDrafts', () => {
  const now = new Date(2026, 10, 25, 10, 0);

  it('maps API steps into editable drafts with defaults', () => {
    const drafts = createPlanDrafts(
      [
        planStep({
          title: '  设计接口  ',
          reason: '  先确定契约  ',
          suggestedAssigneeId: 'user-1',
          suggestedAssigneeName: '张三',
          priority: 'HIGH',
          dueInDays: 3,
          dependsOn: [1, 1, 0],
        }),
        planStep({ title: '实现页面', priority: 'LOW' }),
      ],
      now,
      new Set(['user-1']),
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      stepIndex: 0,
      title: '设计接口',
      checked: true,
      assigneeId: 'user-1',
      priority: 'HIGH',
      dueDate: `2026-11-28T${DEFAULT_PLAN_DUE_TIME}`,
      dependsOn: [1],
      reason: '先确定契约',
    });
    expect(drafts[1]).toMatchObject({
      stepIndex: 1,
      title: '实现页面',
      checked: true,
      assigneeId: null,
      priority: 'LOW',
      dueDate: '',
      dependsOn: [],
      reason: null,
    });
  });

  it('keeps suggested assignees when no member set is provided', () => {
    const drafts = createPlanDrafts(
      [planStep({ suggestedAssigneeId: 'user-9', suggestedAssigneeName: '李四' })],
      now,
    );
    expect(drafts[0]?.assigneeId).toBe('user-9');
  });

  it('drops suggested assignees that are not project members', () => {
    const drafts = createPlanDrafts(
      [planStep({ suggestedAssigneeId: 'user-9' })],
      now,
      new Set(['user-1']),
    );
    expect(drafts[0]?.assigneeId).toBeNull();
  });
});

describe('buildPlanTaskPayload', () => {
  it('builds a create-task payload with ISO due date', () => {
    const result = buildPlanTaskPayload(
      stepDraft({
        title: '  设计接口  ',
        assigneeId: 'user-1',
        priority: 'URGENT',
        dueDate: '2026-11-27T18:00',
      }),
      'column-1',
    );

    expect(result.error).toBeNull();
    expect(result.payload).toEqual({
      title: '设计接口',
      columnId: 'column-1',
      priority: 'URGENT',
      assigneeId: 'user-1',
      dueDate: new Date('2026-11-27T18:00').toISOString(),
    });
  });

  it('maps an empty due date and assignee to null', () => {
    const result = buildPlanTaskPayload(stepDraft({ assigneeId: '  ' }), 'column-1');
    expect(result.error).toBeNull();
    expect(result.payload?.dueDate).toBeNull();
    expect(result.payload?.assigneeId).toBeNull();
  });

  it('rejects blank titles', () => {
    const result = buildPlanTaskPayload(
      stepDraft({ stepIndex: 1, title: '   ' }),
      'column-1',
    );
    expect(result.payload).toBeNull();
    expect(result.error).toBe('第 2 步标题不能为空');
  });

  it('rejects titles longer than the limit', () => {
    const result = buildPlanTaskPayload(
      stepDraft({ title: 'a'.repeat(PLAN_STEP_TITLE_MAX_LENGTH + 1) }),
      'column-1',
    );
    expect(result.payload).toBeNull();
    expect(result.error).toContain(String(PLAN_STEP_TITLE_MAX_LENGTH));
  });

  it('rejects a missing column and invalid deadline', () => {
    expect(buildPlanTaskPayload(stepDraft(), '').error).toContain('看板列');
    const invalidDue = buildPlanTaskPayload(
      stepDraft({ stepIndex: 2, dueDate: 'not-a-date' }),
      'column-1',
    );
    expect(invalidDue.payload).toBeNull();
    expect(invalidDue.error).toBe('第 3 步截止时间格式不正确');
  });
});

describe('planDependencyPairs', () => {
  it('links only selected steps and drops dependencies on unselected steps', () => {
    const rows = [
      stepDraft({ key: 'a', stepIndex: 0, dependsOn: [1, 2] }),
      stepDraft({ key: 'b', stepIndex: 1, dependsOn: [0] }),
      stepDraft({ key: 'c', stepIndex: 2, checked: false, dependsOn: [] }),
    ];
    expect(planDependencyPairs(rows)).toEqual([
      { stepIndex: 0, dependsOnIndex: 1 },
      { stepIndex: 1, dependsOnIndex: 0 },
    ]);
  });

  it('deduplicates identical links and ignores self references', () => {
    const rows = [
      stepDraft({ stepIndex: 0, dependsOn: [1, 1, 0] }),
      stepDraft({ key: 'b', stepIndex: 1 }),
    ];
    expect(planDependencyPairs(rows)).toEqual([{ stepIndex: 0, dependsOnIndex: 1 }]);
  });

  it('returns no links when every row is unchecked', () => {
    const rows = [
      stepDraft({ stepIndex: 0, checked: false, dependsOn: [1] }),
      stepDraft({ key: 'b', stepIndex: 1, checked: false }),
    ];
    expect(planDependencyPairs(rows)).toEqual([]);
  });
});

describe('createSubtasksSequentially', () => {
  it('creates only checked rows and reports blank, long and failed titles', async () => {
    const calls: string[] = [];
    const createSubtask = vi.fn(async (title: string) => {
      calls.push(title);
      if (title === '失败项') throw new Error('boom');
    });
    const rows: BreakdownRow[] = [
      { key: 'a', title: '  第一项  ', checked: true },
      { key: 'b', title: '未勾选', checked: false },
      { key: 'c', title: '失败项', checked: true },
      { key: 'd', title: '   ', checked: true },
      { key: 'e', title: 'x'.repeat(PLAN_STEP_TITLE_MAX_LENGTH + 1), checked: true },
    ];

    const summary = await createSubtasksSequentially(rows, createSubtask);

    expect(calls).toEqual(['第一项', '失败项']);
    expect(summary).toMatchObject({ total: 4, created: 1, failed: 3 });
    expect(summary.failures.map((failure) => failure.title)).toEqual([
      '失败项',
      '建议 3',
      'x'.repeat(PLAN_STEP_TITLE_MAX_LENGTH + 1),
    ]);
    expect(summary.failures[0]?.message).toBe('boom');
  });
});

describe('createPlanSequentially', () => {
  it('creates tasks first, then links dependencies between created tasks', async () => {
    const calls: string[] = [];
    const handlers: PlanCreationHandlers = {
      createTask: async (payload) => {
        calls.push(`task:${payload.title}`);
        return { id: `id-${payload.title}` };
      },
      createDependency: async (taskId, blockedByTaskId) => {
        calls.push(`dep:${taskId}<-${blockedByTaskId}`);
      },
    };
    const rows = [
      stepDraft({ key: 'a', stepIndex: 0, title: 'A', dependsOn: [1] }),
      stepDraft({ key: 'b', stepIndex: 1, title: 'B', dependsOn: [0, 2] }),
      stepDraft({ key: 'c', stepIndex: 2, title: 'C', checked: false }),
    ];

    const summary = await createPlanSequentially(rows, 'column-1', handlers);

    expect(calls).toEqual([
      'task:A',
      'task:B',
      'dep:id-A<-id-B',
      'dep:id-B<-id-A',
    ]);
    expect(summary).toMatchObject({
      total: 2,
      created: 2,
      failed: 0,
      dependencyTotal: 2,
      dependenciesCreated: 2,
      dependenciesFailed: 0,
      dependenciesSkipped: 0,
    });
  });

  it('keeps creating other steps and skips dependencies on failed steps', async () => {
    const handlers: PlanCreationHandlers = {
      createTask: async (payload) => {
        if (payload.title === 'B') throw new Error('创建失败');
        return { id: `id-${payload.title}` };
      },
      createDependency: vi.fn(async () => undefined),
    };
    const rows = [
      stepDraft({ key: 'a', stepIndex: 0, title: 'A' }),
      stepDraft({ key: 'b', stepIndex: 1, title: 'B', dependsOn: [0] }),
      stepDraft({ key: 'c', stepIndex: 2, title: 'C', dependsOn: [1] }),
    ];

    const summary = await createPlanSequentially(rows, 'column-1', handlers);

    expect(handlers.createDependency).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      total: 3,
      created: 2,
      failed: 1,
      dependenciesCreated: 0,
      dependenciesFailed: 0,
      dependenciesSkipped: 2,
    });
    expect(summary.failures).toEqual([
      { title: '第 2 步「B」', message: '创建失败' },
    ]);
  });

  it('reports dependency failures separately from task creation', async () => {
    const handlers: PlanCreationHandlers = {
      createTask: async (payload) => ({ id: `id-${payload.title}` }),
      createDependency: async () => {
        throw new Error('依赖冲突');
      },
    };
    const rows = [
      stepDraft({ key: 'a', stepIndex: 0, title: 'A' }),
      stepDraft({ key: 'b', stepIndex: 1, title: 'B', dependsOn: [0] }),
    ];

    const summary = await createPlanSequentially(rows, 'column-1', handlers);

    expect(summary).toMatchObject({
      created: 2,
      failed: 0,
      dependenciesCreated: 0,
      dependenciesFailed: 1,
      dependenciesSkipped: 0,
    });
    expect(summary.dependencyFailures).toEqual([
      { title: '第 2 步依赖第 1 步', message: '依赖冲突' },
    ]);
  });

  it('reports invalid titles without calling the API', async () => {
    const handlers: PlanCreationHandlers = {
      createTask: vi.fn(async () => ({ id: 'unused' })),
      createDependency: vi.fn(async () => undefined),
    };
    const rows = [stepDraft({ stepIndex: 0, title: '   ' })];

    const summary = await createPlanSequentially(rows, 'column-1', handlers);

    expect(handlers.createTask).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ total: 1, created: 0, failed: 1 });
    expect(summary.failures).toEqual([
      { title: '第 1 步', message: '第 1 步标题不能为空' },
    ]);
  });
});