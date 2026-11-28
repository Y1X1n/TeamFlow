import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';

interface MemberBody {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  skills: string[];
}

interface CandidateBody {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
  score: number;
  skillMatches: string[];
  reasons: string[];
}

interface SuggestionsBody {
  task: { id: string; title: string };
  source: string;
  model: string | null;
  notice: string | null;
  costNotice: string | null;
  candidates: CandidateBody[];
}

describe('Assignment suggestions (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;
  let ownerId: string;
  let memberId: string;
  let viewerId: string;
  let projectId: string;
  let taskId: string;

  const suffix = Date.now();
  const ownerEmail = `assign-owner-${suffix}@example.com`;
  const memberEmail = `assign-member-${suffix}@example.com`;
  const viewerEmail = `assign-viewer-${suffix}@example.com`;
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
    const inviteToken = (invite.body.inviteUrl as string).split('#')[1];
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/invites/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(accept.status).toBe(200);
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

  it('sets up a project with an owner, a member, a viewer and a labelled task', async () => {
    const owner = await register(ownerEmail, '指派负责人');
    ownerId = owner.id;
    ownerToken = owner.token;
    const member = await register(memberEmail, '指派成员');
    memberId = member.id;
    memberToken = member.token;
    const viewer = await register(viewerEmail, '指派访客');
    viewerId = viewer.id;
    viewerToken = viewer.token;

    const project = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `智能指派 ${suffix}` });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    await inviteAndAccept(memberToken, memberEmail, 'MEMBER');
    await inviteAndAccept(viewerToken, viewerEmail, 'VIEWER');

    const board = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(board.status).toBe(200);
    const todo = (board.body.columns as Array<{ id: string; name: string }>).find(
      (column) => column.name === '待办',
    );
    expect(todo).toBeTruthy();
    if (!todo) throw new Error('Missing todo column');

    const task = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '实现登录页面',
        description: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '登录表单与校验逻辑' }] },
          ],
        },
        labels: ['前端'],
        columnId: todo.id,
      });
    expect(task.status).toBe(201);
    taskId = task.body.id;
  });

  it('lets members edit their own skills and enforces member:manage for others', async () => {
    const ownerSkills = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}/members/me/skills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ skills: ['产品', '文档'] });
    expect(ownerSkills.status).toBe(200);
    expect(ownerSkills.body).toMatchObject({
      userId: ownerId,
      email: ownerEmail,
      role: 'OWNER',
      skills: ['产品', '文档'],
    });

    const memberSkills = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}/members/me/skills`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ skills: ['前端', '测试'] });
    expect(memberSkills.status).toBe(200);
    expect(memberSkills.body).toMatchObject({
      userId: memberId,
      email: memberEmail,
      role: 'MEMBER',
      skills: ['前端', '测试'],
    });

    const forbidden = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}/members/${ownerId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ skills: ['运营'] });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const managed = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}/members/${memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ skills: ['前端', '测试'] });
    expect(managed.status).toBe(200);
    expect(managed.body).toMatchObject({ userId: memberId, skills: ['前端', '测试'] });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    const items = list.body.items as MemberBody[];
    expect(items.find((item) => item.userId === ownerId)?.skills).toEqual(['产品', '文档']);
    expect(items.find((item) => item.userId === memberId)?.skills).toEqual(['前端', '测试']);
    expect(items.find((item) => item.userId === viewerId)?.skills).toEqual([]);

    const activities = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/activities?limit=20`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(activities.status).toBe(200);
    const skillsActivity = (activities.body.items as Array<{ type: string; payload: unknown }>).find(
      (item) => item.type === 'MEMBER_SKILLS_CHANGED',
    );
    expect(skillsActivity).toBeDefined();
    expect(skillsActivity?.payload).toMatchObject({ skills: ['前端', '测试'] });
  });

  it('suggests the matching non-viewer member using local rules', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/assign-suggestions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ limit: 3 });
    expect(response.status).toBe(200);
    const body = response.body as SuggestionsBody;

    expect(body.task).toEqual({ id: taskId, title: '实现登录页面' });
    expect(body.source).toBe('local');
    expect(body.model).toBeNull();
    expect(body.costNotice).toBeNull();
    expect(body.notice).toContain('本地规则');

    const candidateIds = body.candidates.map((candidate) => candidate.userId);
    expect(candidateIds).toContain(memberId);
    expect(candidateIds).not.toContain(viewerId);
    expect(body.candidates[0]?.userId).toBe(memberId);

    const member = body.candidates.find((candidate) => candidate.userId === memberId);
    expect(member).toBeDefined();
    expect(member).toMatchObject({
      name: '指派成员',
      avatarUrl: null,
      role: 'MEMBER',
      skills: ['前端', '测试'],
      openTaskCount: 0,
      overdueTaskCount: 0,
    });
    expect(member!.skillMatches).toContain('前端');
    expect(member!.score).toBeGreaterThan(0);
    expect(member!.score).toBeLessThanOrEqual(100);
    expect(member!.reasons.length).toBeGreaterThan(0);
  });

  it('honours the requested candidate limit', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/assign-suggestions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ limit: 1 });
    expect(response.status).toBe(200);
    expect((response.body as SuggestionsBody).candidates).toHaveLength(1);
  });

  it('forbids viewers from requesting assignment suggestions', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/assign-suggestions`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('applies a suggested candidate through the existing task update endpoint', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assigneeId: memberId });
    expect(response.status).toBe(200);
    expect(response.body.assignee).toMatchObject({ userId: memberId, name: '指派成员' });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.assignee).toMatchObject({ userId: memberId, role: 'MEMBER' });
  });
});