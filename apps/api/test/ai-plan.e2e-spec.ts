import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';

interface PlanStepBody {
  title: string;
  reason: string | null;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  priority: string;
  dueInDays: number | null;
  dependsOn: number[];
}

interface PlanBody {
  steps: PlanStepBody[];
  source: string;
  model: string | null;
  notice: string | null;
}

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

describe('Task AI plan (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;
  let ownerId: string;
  let memberId: string;
  let viewerId: string;
  let projectId: string;
  let taskId: string;
  let columnId: string;
  let planSteps: PlanStepBody[];

  const suffix = Date.now();
  const ownerEmail = `plan-owner-${suffix}@example.com`;
  const memberEmail = `plan-member-${suffix}@example.com`;
  const viewerEmail = `plan-viewer-${suffix}@example.com`;
  const password = `E2e-${suffix}-${randomBytes(9).toString('base64url')}aA1`;

  async function register(email: string, name: string): Promise<{ id: string; token: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, name });
    expect(response.status).toBe(201);
    return {
      id: response.body.user.id as string,
      token: response.body.accessToken as string,
    };
  }

  async function inviteAndAccept(
    token: string,
    email: string,
    role: 'MEMBER' | 'VIEWER',
  ): Promise<void> {
    const invite = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role });
    expect(invite.status).toBe(201);
    const inviteToken = (invite.body.inviteUrl as string).split('/invite/')[1];
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/invites/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(accept.status).toBe(200);
  }

  async function setSkills(token: string, skills: string[]): Promise<void> {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}/members/me/skills`)
      .set('Authorization', `Bearer ${token}`)
      .send({ skills });
    expect(response.status).toBe(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    if (projectId && ownerToken) {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
    }
    await app.close();
  });

  it('sets up a project with an owner, a skill-tagged member, a viewer and a task', async () => {
    const owner = await register(ownerEmail, '计划负责人');
    ownerId = owner.id;
    ownerToken = owner.token;
    const member = await register(memberEmail, '计划成员');
    memberId = member.id;
    memberToken = member.token;
    const viewer = await register(viewerEmail, '计划访客');
    viewerId = viewer.id;
    viewerToken = viewer.token;

    const project = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `AI 拆解 ${suffix}` });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    await inviteAndAccept(memberToken, memberEmail, 'MEMBER');
    await inviteAndAccept(viewerToken, viewerEmail, 'VIEWER');
    await setSkills(ownerToken, ['产品', '文档']);
    await setSkills(memberToken, ['前端', '测试']);
    // The viewer also lists a matching skill and must still never be suggested.
    await setSkills(viewerToken, ['前端']);

    const board = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(board.status).toBe(200);
    const todo = (board.body.columns as Array<{ id: string; name: string }>).find(
      (column) => column.name === '待办',
    );
    expect(todo).toBeTruthy();
    if (!todo) throw new Error('Missing todo column');
    columnId = todo.id;

    const task = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '实现登录页面',
        description: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '登录表单与校验逻辑' }] }],
        },
        labels: ['前端'],
        columnId,
      });
    expect(task.status).toBe(201);
    taskId = task.body.id;
  });

  it('returns a contract-valid local plan and never suggests viewers', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/ai-plan`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(response.status).toBe(200);
    const body = response.body as PlanBody;

    expect(body.source).toBe('local');
    expect(body.model).toBeNull();
    expect(body.notice).toContain('本地规则');
    expect(body.steps.length).toBeGreaterThanOrEqual(3);
    expect(body.steps.length).toBeLessThanOrEqual(6);

    const eligibleIds = new Set([ownerId, memberId]);
    const namesById = new Map([
      [ownerId, '计划负责人'],
      [memberId, '计划成员'],
    ]);

    for (const [index, step] of body.steps.entries()) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.title.length).toBeLessThanOrEqual(120);
      expect(TASK_PRIORITIES).toContain(step.priority);
      expect(Number.isInteger(step.dueInDays)).toBe(true);
      expect(step.dueInDays ?? -1).toBeGreaterThanOrEqual(1);
      expect(step.dueInDays ?? -1).toBeLessThanOrEqual(30);
      for (const dependency of step.dependsOn) {
        expect(Number.isInteger(dependency)).toBe(true);
        expect(dependency).toBeGreaterThanOrEqual(0);
        expect(dependency).toBeLessThan(index);
      }
      if (step.suggestedAssigneeId === null) {
        expect(step.suggestedAssigneeName).toBeNull();
      } else {
        expect(eligibleIds.has(step.suggestedAssigneeId)).toBe(true);
        expect(step.suggestedAssigneeId).not.toBe(viewerId);
        expect(step.suggestedAssigneeName).toBe(namesById.get(step.suggestedAssigneeId));
      }
    }

    const suggestedIds = body.steps
      .map((step) => step.suggestedAssigneeId)
      .filter((id): id is string => id !== null);
    expect(suggestedIds).not.toContain(viewerId);
    expect(suggestedIds).toContain(memberId);
    // The member's 前端 skill matches the task label, so it leads the first step.
    expect(body.steps[0]?.suggestedAssigneeId).toBe(memberId);
    planSteps = body.steps;
  });

  it('honours useAi: false without calling a model', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/ai-plan`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ useAi: false });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ source: 'local', model: null });
    expect((response.body as PlanBody).steps.length).toBeGreaterThanOrEqual(3);
  });

  it('allows a member with task:update to request a plan', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/ai-plan`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect((response.body as PlanBody).source).toBe('local');
  });

  it('forbids viewers from requesting a plan', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/ai-plan`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a missing task', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tasks/missing-task-id/ai-plan')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('creates tasks and a dependency from the suggested steps', async () => {
    const first = planSteps[0];
    const second = planSteps[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) throw new Error('Missing plan steps');

    const createdIds: string[] = [];
    for (const step of [first, second]) {
      const payload: Record<string, unknown> = {
        title: step.title,
        columnId,
        priority: step.priority,
      };
      if (step.suggestedAssigneeId !== null) {
        payload.assigneeId = step.suggestedAssigneeId;
      }
      const created = await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(payload);
      expect(created.status).toBe(201);
      createdIds.push(created.body.id as string);
    }

    const dependency = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${createdIds[1]}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: createdIds[0] });
    expect(dependency.status).toBe(201);
    expect(
      (dependency.body.blockedBy as Array<{ taskId: string }>).map((item) => item.taskId),
    ).toContain(createdIds[0]);
  });
});
