import {
  matchSkills,
  scoreCandidates,
  type AssignmentCandidateInput,
  type AssignmentScoreContext,
} from './assignment-score';

const NOW = new Date('2026-11-25T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function candidate(overrides: Partial<AssignmentCandidateInput> = {}): AssignmentCandidateInput {
  return {
    userId: 'u1',
    name: '张三',
    role: 'MEMBER',
    skills: [],
    openTaskCount: 0,
    overdueTaskCount: 0,
    completedSameLabelCount: 0,
    ...overrides,
  };
}

function context(overrides: Partial<AssignmentScoreContext> = {}): AssignmentScoreContext {
  return {
    labels: [],
    maxOpenTaskCount: 0,
    dueDate: null,
    now: NOW,
    ...overrides,
  };
}

function scoreOf(input: AssignmentCandidateInput, ctx: AssignmentScoreContext): number {
  return scoreCandidates(ctx, [input])[0]!.score;
}

describe('matchSkills', () => {
  it('matches Chinese labels exactly', () => {
    expect(matchSkills(['前端'], ['前端'])).toEqual({ matches: ['前端'], ratio: 1 });
  });

  it('matches when the label contains the skill', () => {
    expect(matchSkills(['前端开发'], ['前端'])).toEqual({ matches: ['前端开发'], ratio: 1 });
  });

  it('matches when the skill contains the label', () => {
    expect(matchSkills(['前端'], ['前端工程师'])).toEqual({ matches: ['前端'], ratio: 1 });
  });

  it('compares English labels case-insensitively and trims whitespace', () => {
    expect(matchSkills(['React'], [' react '])).toEqual({ matches: ['React'], ratio: 1 });
    expect(matchSkills(['  REACT  '], ['react'])).toEqual({ matches: ['REACT'], ratio: 1 });
  });

  it('returns a neutral ratio when the task has no labels', () => {
    expect(matchSkills([], ['前端', '设计'])).toEqual({ matches: [], ratio: 0.5 });
  });

  it('returns a partial ratio for partially matched labels', () => {
    const result = matchSkills(['前端', '测试', '文档'], ['测试']);
    expect(result.matches).toEqual(['测试']);
    expect(result.ratio).toBeCloseTo(1 / 3, 5);
  });

  it('ignores duplicate and empty labels', () => {
    const result = matchSkills(['前端', '前端', '  '], ['前端']);
    expect(result).toEqual({ matches: ['前端'], ratio: 1 });
  });

  it('returns zero mismatches when skills are empty', () => {
    expect(matchSkills(['前端'], [])).toEqual({ matches: [], ratio: 0 });
  });
});

describe('scoreCandidates', () => {
  it('keeps every score inside 0-100 as an integer', () => {
    const scored = scoreCandidates(
      context({ labels: ['前端', '测试'], maxOpenTaskCount: 10, dueDate: new Date(NOW.getTime() + DAY_MS) }),
      [
        candidate({ userId: 'a', name: '甲', skills: ['前端', '测试'], openTaskCount: 0 }),
        candidate({ userId: 'b', name: '乙', openTaskCount: 100, overdueTaskCount: 20 }),
        candidate({ userId: 'c', name: '丙', skills: ['文档'], openTaskCount: 5, overdueTaskCount: 2 }),
      ],
    );
    expect(scored).toHaveLength(3);
    for (const item of scored) {
      expect(Number.isInteger(item.score)).toBe(true);
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }
    expect(scored[0]!.score).toBeGreaterThanOrEqual(scored[1]!.score);
    expect(scored[1]!.score).toBeGreaterThanOrEqual(scored[2]!.score);
  });

  it('breaks score ties by name and then userId', () => {
    const scored = scoreCandidates(context(), [
      candidate({ userId: 'u2', name: 'Bob' }),
      candidate({ userId: 'u1', name: 'Alice' }),
      candidate({ userId: 'u3', name: 'Alice' }),
    ]);
    expect(scored.map((item) => item.name)).toEqual(['Alice', 'Alice', 'Bob']);
    expect(scored.map((item) => item.userId)).toEqual(['u1', 'u3', 'u2']);
  });

  it('ranks matching skills above mismatching skills', () => {
    const scored = scoreCandidates(context({ labels: ['前端'] }), [
      candidate({ userId: 'match', name: '匹配', skills: ['前端'] }),
      candidate({ userId: 'miss', name: '不匹配', skills: ['设计'] }),
    ]);
    expect(scored[0]!.userId).toBe('match');
    expect(scored[0]!.skillMatches).toEqual(['前端']);
    expect(scored[0]!.score).toBe(84);
    expect(scored[1]!.skillMatches).toEqual([]);
    expect(scored[1]!.score).toBe(44);
  });

  it('lowers the score as open task load grows', () => {
    const free = scoreOf(candidate({ openTaskCount: 0 }), context({ maxOpenTaskCount: 4 }));
    const busy = scoreOf(candidate({ openTaskCount: 4 }), context({ maxOpenTaskCount: 4 }));
    expect(free).toBe(64);
    expect(busy).toBe(34);
    expect(free).toBeGreaterThan(busy);
  });

  it('penalizes overdue tasks', () => {
    const clean = scoreOf(candidate({ openTaskCount: 0 }), context({ maxOpenTaskCount: 4 }));
    const overdue = scoreOf(
      candidate({ openTaskCount: 0, overdueTaskCount: 2 }),
      context({ maxOpenTaskCount: 4 }),
    );
    expect(overdue).toBeLessThan(clean);
  });

  it('penalizes loaded members when the task is due within three days', () => {
    const dueSoon = context({ maxOpenTaskCount: 4, dueDate: new Date(NOW.getTime() + DAY_MS) });
    const free = scoreOf(candidate(), dueSoon);
    const loaded = scoreOf(candidate({ openTaskCount: 4, overdueTaskCount: 2 }), dueSoon);
    expect(free).toBeGreaterThan(loaded);
  });

  it('treats a missing due date as neutral and a distant due date as stable', () => {
    const noDue = scoreOf(candidate(), context());
    const dueSoon = scoreOf(
      candidate(),
      context({ dueDate: new Date(NOW.getTime() + DAY_MS) }),
    );
    const farDue = scoreOf(
      candidate(),
      context({ dueDate: new Date(NOW.getTime() + 10 * DAY_MS) }),
    );
    expect(dueSoon).toBeGreaterThan(noDue);
    expect(farDue).toBeGreaterThan(noDue);
    expect(farDue).toBeLessThan(dueSoon);
  });

  it('adds up to ten points for completed tasks with the same label', () => {
    const ctx = context({ labels: ['前端'], maxOpenTaskCount: 4 });
    const withoutHistory = scoreOf(
      candidate({ skills: ['前端'], completedSameLabelCount: 0 }),
      ctx,
    );
    const withFullHistory = scoreOf(
      candidate({ skills: ['前端'], completedSameLabelCount: 5 }),
      ctx,
    );
    const cappedHistory = scoreOf(
      candidate({ skills: ['前端'], completedSameLabelCount: 12 }),
      ctx,
    );
    expect(withFullHistory - withoutHistory).toBe(10);
    expect(cappedHistory).toBe(withFullHistory);
  });

  it('explains matches, load, overdue and history with Chinese reasons', () => {
    const [scored] = scoreCandidates(context({ labels: ['前端'], maxOpenTaskCount: 4 }), [
      candidate({
        skills: ['前端'],
        openTaskCount: 2,
        overdueTaskCount: 1,
        completedSameLabelCount: 2,
      }),
    ]);
    expect(scored!.reasons).toContain('技能匹配：前端');
    expect(scored!.reasons).toContain('当前进行中 2 个任务');
    expect(scored!.reasons).toContain('有 1 个逾期任务，需关注排期');
    expect(scored!.reasons).toContain('完成过 2 个同标签任务');
  });

  it('always produces at least one reason, even for a fresh mismatching member', () => {
    const [scored] = scoreCandidates(context({ labels: ['前端'] }), [
      candidate({ skills: [] }),
    ]);
    expect(scored!.reasons.length).toBeGreaterThan(0);
    expect(scored!.reasons).toContain('未匹配任务标签，可作为备选');
    expect(scored!.reasons).toContain('当前没有进行中的任务');
  });
});