import type { PrismaService } from '../../prisma/prisma.service';
import type { AiService } from '../ai/ai.service';
import { AssignmentsService } from './assignments.service';

type MockFn = jest.Mock;

interface PrismaMock {
  task: { findFirst: MockFn; groupBy: MockFn; findMany: MockFn };
  projectMember: { findMany: MockFn };
}

interface AiMock {
  status: MockFn;
  rankAssignees: MockFn;
}

const taskRow = {
  id: 'task-1',
  title: '实现登录页',
  description: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '登录表单与校验' }] }],
  },
  labels: ['前端'],
  projectId: 'project-1',
  assigneeId: null,
  dueDate: null,
  column: { isDone: false },
  project: { name: '演示项目' },
};

const membershipRows = [
  {
    role: 'OWNER',
    skills: ['产品'],
    user: { id: 'owner-1', name: '负责人', avatarUrl: null },
  },
  {
    role: 'MEMBER',
    skills: ['前端'],
    user: { id: 'member-1', name: '成员', avatarUrl: 'https://example.com/avatar.png' },
  },
];

interface CreateOptions {
  task?: unknown;
  memberships?: unknown[];
  aiEnabled?: boolean;
  aiRanking?: unknown;
}

function createService(options: CreateOptions = {}) {
  const prisma: PrismaMock = {
    task: { findFirst: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
    projectMember: { findMany: jest.fn() },
  };
  const ai: AiMock = { status: jest.fn(), rankAssignees: jest.fn() };

  prisma.task.findFirst.mockResolvedValue(options.task === undefined ? taskRow : options.task);
  prisma.projectMember.findMany.mockResolvedValue(options.memberships ?? membershipRows);
  prisma.task.groupBy.mockResolvedValue([]);
  prisma.task.findMany.mockResolvedValue([]);
  ai.status.mockReturnValue({
    enabled: options.aiEnabled ?? false,
    provider: 'openai-compatible',
    model: options.aiEnabled ? 'test-model' : null,
    fallback: 'local',
    costNotice: options.aiEnabled ? '调用将发送任务标题与描述并可能产生费用。' : null,
  });
  ai.rankAssignees.mockResolvedValue(options.aiRanking ?? null);

  const service = new AssignmentsService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
  );
  return { service, prisma, ai };
}

describe('AssignmentsService', () => {
  it('throws 404 when the task is missing or deleted', async () => {
    const { service } = createService({ task: null });
    await expect(service.suggest('owner-1', 'task-1', {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('queries only non-viewer project members', async () => {
    const { service, prisma } = createService();
    await service.suggest('owner-1', 'task-1', {});
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'project-1', role: { not: 'VIEWER' } },
      }),
    );
  });

  it('returns local rule-based candidates ordered by score', async () => {
    const { service, ai } = createService();
    const result = await service.suggest('owner-1', 'task-1', { limit: 3 });

    expect(result.task).toEqual({ id: 'task-1', title: '实现登录页' });
    expect(result.source).toBe('local');
    expect(result.model).toBeNull();
    expect(result.notice).toBe('未配置 AI 或 AI 暂不可用，已使用本地规则排序。');
    expect(result.costNotice).toBeNull();
    expect(ai.rankAssignees).toHaveBeenCalledTimes(1);

    expect(result.candidates.map((candidate) => candidate.userId)).toEqual([
      'member-1',
      'owner-1',
    ]);
    const best = result.candidates[0]!;
    expect(best).toMatchObject({
      name: '成员',
      avatarUrl: 'https://example.com/avatar.png',
      role: 'MEMBER',
      skills: ['前端'],
      openTaskCount: 0,
      overdueTaskCount: 0,
      skillMatches: ['前端'],
    });
    expect(best.score).toBeGreaterThan(0);
    expect(best.reasons.length).toBeGreaterThan(0);
    expect(result.candidates[1]!.skillMatches).toEqual([]);
  });

  it('skips the AI call when useAi is false', async () => {
    const { service, ai } = createService({ aiEnabled: true });
    const result = await service.suggest('owner-1', 'task-1', { useAi: false });
    expect(ai.rankAssignees).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
  });

  it('applies the AI ranking bonus, merges reasons and filters unknown userIds', async () => {
    const { service, ai } = createService({
      aiEnabled: true,
      aiRanking: {
        requiredSkills: ['产品'],
        ranking: [
          { userId: 'owner-1', reason: '更熟悉产品需求' },
          { userId: 'stranger', reason: '不存在于项目中' },
        ],
      },
    });
    const result = await service.suggest('owner-1', 'task-1', {});

    expect(result.source).toBe('ai');
    expect(result.model).toBe('test-model');
    expect(result.notice).toBe('建议由 AI 生成，请确认后指派。');
    expect(result.costNotice).toContain('费用');
    expect(result.candidates.map((candidate) => candidate.userId)).not.toContain('stranger');

    const owner = result.candidates.find((candidate) => candidate.userId === 'owner-1');
    expect(owner).toBeDefined();
    expect(owner!.score).toBe(56);
    expect(owner!.skillMatches).toEqual(['产品']);
    expect(owner!.reasons[0]).toBe('AI 建议：更熟悉产品需求');

    expect(ai.rankAssignees).toHaveBeenCalledWith(
      expect.objectContaining({
        taskTitle: '实现登录页',
        taskDescription: '登录表单与校验',
        labels: ['前端'],
        candidates: expect.arrayContaining([
          expect.objectContaining({ userId: 'owner-1', name: '负责人' }),
          expect.objectContaining({ userId: 'member-1', name: '成员' }),
        ]),
      }),
    );
  });

  it('falls back to local ranking when AI returns only unknown userIds', async () => {
    const { service } = createService({
      aiEnabled: true,
      aiRanking: {
        requiredSkills: ['前端'],
        ranking: [{ userId: 'stranger', reason: '无效候选人' }],
      },
    });
    const result = await service.suggest('owner-1', 'task-1', {});
    expect(result.source).toBe('local');
    expect(result.model).toBeNull();
    expect(result.notice).toBe('未配置 AI 或 AI 暂不可用，已使用本地规则排序。');
  });

  it('returns an empty candidate list with a clear notice when only viewers exist', async () => {
    const { service, ai, prisma } = createService({ memberships: [] });
    const result = await service.suggest('owner-1', 'task-1', {});

    expect(result.candidates).toEqual([]);
    expect(result.source).toBe('local');
    expect(result.notice).toContain('演示项目');
    expect(result.notice).toContain('VIEWER');
    expect(ai.rankAssignees).not.toHaveBeenCalled();
    expect(prisma.task.groupBy).not.toHaveBeenCalled();
  });

  it('counts open, overdue and historical same-label tasks', async () => {
    const { service, prisma } = createService();
    prisma.task.groupBy
      .mockResolvedValueOnce([{ assigneeId: 'member-1', _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ assigneeId: 'member-1', _count: { _all: 1 } }]);
    prisma.task.findMany.mockResolvedValue([
      { assigneeId: 'member-1', labels: ['前端'] },
      { assigneeId: 'member-1', labels: ['前端', '测试'] },
    ]);

    const result = await service.suggest('owner-1', 'task-1', {});
    const member = result.candidates.find((candidate) => candidate.userId === 'member-1');
    expect(member).toBeDefined();
    expect(member!.openTaskCount).toBe(2);
    expect(member!.overdueTaskCount).toBe(1);
    expect(member!.reasons).toContain('当前进行中 2 个任务');
    expect(member!.reasons).toContain('有 1 个逾期任务，需关注排期');
    expect(member!.reasons).toContain('完成过 2 个同标签任务');
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ labels: { hasSome: ['前端'] } }),
        take: 500,
      }),
    );
  });

  it('respects the requested limit', async () => {
    const { service } = createService();
    const limited = await service.suggest('owner-1', 'task-1', { limit: 1 });
    expect(limited.candidates).toHaveLength(1);
    const all = await service.suggest('owner-1', 'task-1', {});
    expect(all.candidates).toHaveLength(2);
  });
});