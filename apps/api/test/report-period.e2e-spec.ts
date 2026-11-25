import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';

interface MemberStatsBody {
  userId: string;
  name: string;
  role: string;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
}

interface PeriodReportBody {
  project: { id: string; name: string; archived: boolean };
  period: string;
  scope: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  assignee: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    skills: string[];
  } | null;
  metrics: Record<string, number>;
  summary: string;
  memberStats?: MemberStatsBody[];
  unassignedOpenTaskCount?: number;
  completedTaskList: unknown[];
  openTaskList: unknown[];
  riskTaskList: unknown[];
  upcomingTaskList: unknown[];
}

interface NarrativeBody {
  narrative: string;
  source: string;
  model: string | null;
  notice: string | null;
  generatedAt: string;
}

describe('Period reports (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let memberId: string;
  let projectId: string;

  const suffix = Date.now();
  const ownerEmail = `period-owner-${suffix}@example.com`;
  const memberEmail = `period-member-${suffix}@example.com`;
  const password = `E2e-${suffix}-${randomBytes(9).toString('base64url')}aA1`;

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

  it('sets up a project with two members and two tasks', async () => {
    const owner = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: ownerEmail,
      password,
      name: '周期负责人',
    });
    expect(owner.status).toBe(201);
    ownerToken = owner.body.accessToken;
    ownerId = owner.body.user.id;

    const member = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: memberEmail,
      password,
      name: '周期成员',
    });
    expect(member.status).toBe(201);
    memberToken = member.body.accessToken;
    memberId = member.body.user.id;

    const project = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `周期报告 ${suffix}` });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberEmail, role: 'MEMBER' });
    expect(invite.status).toBe(201);
    const inviteToken = (invite.body.inviteUrl as string).split('/invite/')[1];
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/invites/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(accept.status).toBe(200);

    const board = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(board.status).toBe(200);
    const todo = (board.body.columns as Array<{ id: string; name: string }>).find(
      (column) => column.name === '待办',
    );
    expect(todo).toBeTruthy();
    if (!todo) throw new Error('Missing todo column');

    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '成员负责的任务',
        columnId: todo.id,
        assigneeId: memberId,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(assigned.status).toBe(201);

    const unassigned = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: '尚未指派的任务', columnId: todo.id });
    expect(unassigned.status).toBe(201);
  });

  it('returns a team period report with per-member stats for a leader', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', scope: 'team' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(response.status).toBe(200);
    const body = response.body as PeriodReportBody;
    expect(body.project.id).toBe(projectId);
    expect(body.period).toBe('daily');
    expect(body.scope).toBe('team');
    expect(body.assignee).toBeNull();
    expect(body.startDate).toBe(body.endDate);
    expect(body.metrics.totalTasks).toBe(2);
    expect(body.unassignedOpenTaskCount).toBe(1);
    expect(body.summary).toContain('今日新增');
    expect(body.completedTaskList).toHaveLength(0);
    expect(body.openTaskList).toHaveLength(2);
    expect(body.memberStats).toHaveLength(2);
    const memberStats = body.memberStats?.find((item) => item.userId === memberId);
    expect(memberStats).toMatchObject({
      userId: memberId,
      name: '周期成员',
      role: 'MEMBER',
      openTaskCount: 1,
      overdueTaskCount: 1,
      blockedTaskCount: 0,
      completedTaskCount: 0,
      totalTaskCount: 1,
    });
    const ownerStats = body.memberStats?.find((item) => item.userId === ownerId);
    expect(ownerStats).toMatchObject({ openTaskCount: 0, totalTaskCount: 0 });
  });

  it('defaults a non-leader to their own member report and enforces scopes', async () => {
    const own = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'weekly' })
      .set('Authorization', `Bearer ${memberToken}`);
    expect(own.status).toBe(200);
    const ownBody = own.body as PeriodReportBody;
    expect(ownBody.scope).toBe('member');
    expect(ownBody.period).toBe('weekly');
    expect(ownBody.assignee).toMatchObject({ userId: memberId, name: '周期成员', role: 'MEMBER' });
    expect(ownBody.metrics.totalTasks).toBe(1);
    expect(ownBody.memberStats).toBeUndefined();
    expect(ownBody.unassignedOpenTaskCount).toBeUndefined();

    const team = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', scope: 'team' })
      .set('Authorization', `Bearer ${memberToken}`);
    expect(team.status).toBe(403);

    const otherMember = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', userId: ownerId })
      .set('Authorization', `Bearer ${memberToken}`);
    expect(otherMember.status).toBe(403);

    const leaderOther = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'weekly', scope: 'member', userId: memberId })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(leaderOther.status).toBe(200);
    expect((leaderOther.body as PeriodReportBody).assignee?.userId).toBe(memberId);

    const teamWithUser = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', scope: 'team', userId: memberId })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(teamWithUser.status).toBe(400);

    const missingMember = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', scope: 'member', userId: 'missing-member-id' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(missingMember.status).toBe(404);
  });

  it('rejects impossible calendar dates', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/reports/period`)
      .query({ period: 'daily', date: '2026-02-30' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('generates a local narrative without calling the model', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/reports/period/narrative`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ period: 'daily', scope: 'team' });
    expect(response.status).toBe(200);
    const body = response.body as NarrativeBody;
    expect(body.source).toBe('local');
    expect(body.model).toBeNull();
    expect(body.notice).toBeTruthy();
    expect(body.narrative).toContain('今日日报');
    expect(body.narrative).toContain(`周期报告 ${suffix}`);

    const memberNarrative = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/reports/period/narrative`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ period: 'weekly' });
    expect(memberNarrative.status).toBe(200);
    const memberBody = memberNarrative.body as NarrativeBody;
    expect(memberBody.source).toBe('local');
    expect(memberBody.narrative).toContain('周期成员');
  });
});
