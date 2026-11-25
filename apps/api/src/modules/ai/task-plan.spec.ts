import {
  LOCAL_PLAN_STEPS,
  buildLocalPlanSteps,
  sanitizeAiPlanSteps,
  type GeneratePlanInput,
  type TaskPlanMember,
  type TaskPlanStep,
} from './task-plan';

function member(overrides: Partial<TaskPlanMember> = {}): TaskPlanMember {
  return {
    userId: 'u1',
    name: '张三',
    role: 'MEMBER',
    skills: [],
    openTaskCount: 0,
    overdueTaskCount: 0,
    ...overrides,
  };
}

function planInput(overrides: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return {
    taskTitle: '实现登录页面',
    taskDescription: '登录表单与校验逻辑',
    taskLabels: ['前端'],
    projectName: 'TeamFlow',
    members: [
      member({ userId: 'owner', name: '负责人', role: 'OWNER' }),
      member({ userId: 'member', name: '成员', role: 'MEMBER', skills: ['前端'] }),
    ],
    ...overrides,
  };
}

function stepAt(steps: TaskPlanStep[], index: number): TaskPlanStep {
  const step = steps[index];
  if (!step) throw new Error(`Missing plan step ${index}`);
  return step;
}

describe('buildLocalPlanSteps', () => {
  it('builds a deterministic plan with sequential priorities, due days and dependencies', () => {
    const steps = buildLocalPlanSteps(planInput());

    expect(steps).toHaveLength(LOCAL_PLAN_STEPS);
    expect(steps.map((step) => step.priority)).toEqual([
      'HIGH',
      'MEDIUM',
      'MEDIUM',
      'MEDIUM',
      'LOW',
    ]);
    expect(steps.map((step) => step.dueInDays)).toEqual([1, 3, 5, 7, 9]);
    expect(steps.map((step) => step.dependsOn)).toEqual([[], [0], [1], [2], [3]]);
    expect(steps.every((step) => step.title.includes('实现登录页面'))).toBe(true);
    expect(steps.every((step) => typeof step.reason === 'string')).toBe(true);
    expect(steps.every((step) => step.title.length <= 120)).toBe(true);
  });

  it('prefers a member whose skills match the task labels for the first step', () => {
    const steps = buildLocalPlanSteps(
      planInput({
        members: [
          member({ userId: 'low', name: '低负载', role: 'MEMBER', openTaskCount: 0 }),
          member({
            userId: 'skilled',
            name: '前端成员',
            role: 'MEMBER',
            skills: ['前端'],
            openTaskCount: 4,
          }),
        ],
      }),
    );

    expect(stepAt(steps, 0).suggestedAssigneeId).toBe('skilled');
    expect(stepAt(steps, 0).suggestedAssigneeName).toBe('前端成员');
    expect(stepAt(steps, 1).suggestedAssigneeId).toBe('low');
  });

  it('assigns members round-robin by workload and never suggests viewers', () => {
    const steps = buildLocalPlanSteps(
      planInput({
        members: [
          member({ userId: 'viewer', name: '访客', role: 'VIEWER', skills: ['前端'] }),
          member({ userId: 'busy', name: '繁忙成员', role: 'MEMBER', openTaskCount: 5 }),
          member({ userId: 'free', name: '空闲成员', role: 'MEMBER', openTaskCount: 0 }),
          member({
            userId: 'overdue',
            name: '逾期成员',
            role: 'MEMBER',
            openTaskCount: 0,
            overdueTaskCount: 3,
          }),
        ],
      }),
    );

    expect(steps.map((step) => step.suggestedAssigneeId)).toEqual([
      'free',
      'busy',
      'overdue',
      'free',
      'busy',
    ]);
    expect(steps.every((step) => step.suggestedAssigneeId !== 'viewer')).toBe(true);
    expect(steps.every((step) => step.suggestedAssigneeName !== '访客')).toBe(true);
  });

  it('returns null assignees when only viewers are available', () => {
    const steps = buildLocalPlanSteps(
      planInput({ members: [member({ role: 'VIEWER', skills: ['前端'] })] }),
    );

    expect(steps).toHaveLength(LOCAL_PLAN_STEPS);
    expect(steps.every((step) => step.suggestedAssigneeId === null)).toBe(true);
    expect(steps.every((step) => step.suggestedAssigneeName === null)).toBe(true);
  });

  it('falls back to a safe title when the task title is blank', () => {
    const steps = buildLocalPlanSteps(planInput({ taskTitle: '   ' }));

    expect(steps.every((step) => step.title.length > 0)).toBe(true);
    expect(stepAt(steps, 0).title).toContain('任务');
  });
});

describe('sanitizeAiPlanSteps', () => {
  const members = [
    member({ userId: 'u1', name: '张三' }),
    member({ userId: 'viewer', name: '访客', role: 'VIEWER' }),
  ];

  it('sanitizes fields and resolves assignees only from provided members', () => {
    const steps = sanitizeAiPlanSteps(
      [
        {
          title: '- 明确目标与验收标准',
          reason: '  先确认范围  ',
          assigneeId: 'u1',
          priority: 'high',
          dueInDays: 0,
          dependsOn: [],
        },
        {
          title: '2. 完成初版产出',
          reason: null,
          assigneeId: 'ghost',
          priority: 'URGENT',
          dueInDays: 99,
          dependsOn: [0, 0],
        },
        {
          title: '交付并复盘',
          assigneeId: 'viewer',
          priority: 'LOW',
          dueInDays: 3,
          dependsOn: [],
        },
      ],
      members,
    );

    expect(steps).toHaveLength(3);
    expect(stepAt(steps, 0)).toMatchObject({
      title: '明确目标与验收标准',
      reason: '先确认范围',
      suggestedAssigneeId: 'u1',
      suggestedAssigneeName: '张三',
      priority: 'MEDIUM',
      dueInDays: 1,
      dependsOn: [],
    });
    expect(stepAt(steps, 1)).toMatchObject({
      title: '完成初版产出',
      reason: null,
      suggestedAssigneeId: null,
      suggestedAssigneeName: null,
      priority: 'URGENT',
      dueInDays: 30,
      dependsOn: [0],
    });
    expect(stepAt(steps, 2)).toMatchObject({
      title: '交付并复盘',
      suggestedAssigneeId: null,
      suggestedAssigneeName: null,
      priority: 'LOW',
      dueInDays: 3,
    });
  });

  it('keeps only deduplicated dependency indexes that point at earlier steps', () => {
    const steps = sanitizeAiPlanSteps(
      [
        { title: '步骤一', dependsOn: [0, 0, 1] },
        { title: '步骤二', dependsOn: [0, 1, 0] },
        { title: '步骤三', dependsOn: [0, 1, 2, 2, 3] },
        { title: '步骤四', dependsOn: [0, 1, 2, 3, -1, 1.5, '2', null] },
      ],
      members,
    );

    expect(steps.map((step) => step.dependsOn)).toEqual([[], [0], [0, 1], [0, 1, 2]]);
  });

  it('caps AI output at six steps and truncates long titles', () => {
    const raw = Array.from({ length: 8 }, (_, index) => ({
      title: `${index}-${'x'.repeat(200)}`,
      dueInDays: 3,
    }));
    const steps = sanitizeAiPlanSteps(raw, members);

    expect(steps).toHaveLength(6);
    expect(steps.every((step) => step.title.length === 120)).toBe(true);
  });

  it('skips non-object entries, blank titles and duplicate titles', () => {
    const steps = sanitizeAiPlanSteps(
      [
        null,
        'not-a-step',
        { title: 42 },
        { title: '   ' },
        { title: '有效步骤' },
        { title: '  有效步骤  ' },
        { title: '另一个步骤' },
      ],
      members,
    );

    expect(steps.map((step) => step.title)).toEqual(['有效步骤', '另一个步骤']);
  });

  it('returns an empty list for a non-array payload', () => {
    expect(sanitizeAiPlanSteps(undefined, members)).toEqual([]);
    expect(sanitizeAiPlanSteps({ steps: [] }, members)).toEqual([]);
  });
});
