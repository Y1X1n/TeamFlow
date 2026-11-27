import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';

describe('TeamFlow API (e2e)', () => {
  let app: INestApplication;
  let ownerAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let ownerToken: string;
  let viewerToken: string;
  let projectId: string;
  let projectSlug: string;
  let mailDirectory: string;
  let mailCapturePath: string;

  const suffix = Date.now();
  const ownerEmail = `e2e-owner-${suffix}@example.com`;
  const viewerEmail = `e2e-viewer-${suffix}@example.com`;
  const e2ePassword = `E2e-${suffix}-${randomBytes(9).toString('base64url')}aA1`;
  const e2eNewPassword = `E2e-${suffix}-${randomBytes(9).toString('base64url')}bB2`;
  const e2eWrongPassword = `Wrong-${randomBytes(9).toString('base64url')}zZ9`;

  beforeAll(async () => {
    mailDirectory = process.env.AGENT_MAIL_FAKE_DIR!;
    mailCapturePath = process.env.AGENT_MAIL_CAPTURE!;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useLogger(false);
    await app.init();
    ownerAgent = request.agent(app.getHttpServer());
    viewerAgent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (ownerToken && projectId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
    }
    await app.close();
    delete process.env.AGENT_MAIL_CAPTURE;
    delete process.env.AGENT_MAIL_FAKE_DIR;
    await rm(mailDirectory, { recursive: true, force: true });
  });

  it('registers the owner and refreshes the session cookie', async () => {
    const register = await ownerAgent.post('/api/v1/auth/register').send({
      email: ownerEmail,
      password: e2ePassword,
      name: 'E2E Owner',
    });
    expect(register.status).toBe(201);
    expect(register.body.accessToken).toBeTruthy();
    ownerToken = register.body.accessToken;

    const refresh = await ownerAgent.post('/api/v1/auth/refresh').send({});
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();
  });

  it('creates a project with default columns', async () => {
    projectSlug = `E2E 项目 ${suffix}`;
    const created = await ownerAgent
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: projectSlug, description: 'e2e project' });
    expect(created.status).toBe(201);
    expect(created.body.myRole).toBe('OWNER');
    projectId = created.body.id;

    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(board.status).toBe(200);
    expect(board.body.columns).toHaveLength(3);
    expect(board.body.myPermissions).toContain('project:delete');
  });

  it('creates and moves a task across columns', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');
    const done = board.body.columns.find((column: { name: string }) => column.name === '已完成');

    const created = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 任务', columnId: todo.id, priority: 'HIGH' });
    expect(created.status).toBe(201);

    const moved = await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnId: done.id, beforeTaskId: null });
    expect(moved.status).toBe(200);
    expect(moved.body.completedAt).toBeTruthy();
  });

  it('lists deleted tasks in trash and restores them with dependencies', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');

    const blocker = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 回收站前置', columnId: todo.id });
    expect(blocker.status).toBe(201);

    const dependent = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 回收站任务', columnId: todo.id });
    expect(dependent.status).toBe(201);

    const dependency = await ownerAgent
      .post(`/api/v1/tasks/${dependent.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: blocker.body.id });
    expect(dependency.status).toBe(201);

    const removed = await ownerAgent
      .delete(`/api/v1/tasks/${dependent.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(204);

    const trash = await ownerAgent
      .get(`/api/v1/projects/${projectId}/trash`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(trash.status).toBe(200);
    expect(trash.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: dependent.body.id,
          title: 'E2E 回收站任务',
          columnName: '待办',
        }),
      ]),
    );
    expect(trash.body.some((task: { id: string }) => task.id === blocker.body.id)).toBe(false);

    const restored = await ownerAgent
      .post(`/api/v1/tasks/${dependent.body.id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(200);
    expect(restored.body.id).toBe(dependent.body.id);
    expect(restored.body.blockedBy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: blocker.body.id, title: 'E2E 回收站前置' }),
      ]),
    );

    const boardAfter = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(
      boardAfter.body.tasks.some((task: { id: string }) => task.id === dependent.body.id),
    ).toBe(true);
  });

  it('keeps trashed tasks when deleting their column', async () => {
    const column = await ownerAgent
      .post(`/api/v1/projects/${projectId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E 临时列' });
    expect(column.status).toBe(201);

    const task = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 列内回收任务', columnId: column.body.id });
    expect(task.status).toBe(201);

    await ownerAgent
      .delete(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const removedColumn = await ownerAgent
      .delete(`/api/v1/columns/${column.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removedColumn.status).toBe(204);

    const trash = await ownerAgent
      .get(`/api/v1/projects/${projectId}/trash`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const trashed = trash.body.find((item: { id: string }) => item.id === task.body.id);
    expect(trashed).toBeTruthy();
    expect(trashed.columnName).not.toBe('E2E 临时列');

    const restored = await ownerAgent
      .post(`/api/v1/tasks/${task.body.id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(200);
  });

  it('rejects restoring a task that would create a dependency cycle', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');

    const [a, b, c] = await Promise.all(
      ['E2E 环 A', 'E2E 环 B', 'E2E 环 C'].map((title) =>
        ownerAgent
          .post(`/api/v1/projects/${projectId}/tasks`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ title, columnId: todo.id }),
      ),
    );
    if (!a || !b || !c) throw new Error('Failed to create cycle fixtures');
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);

    await ownerAgent
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: a.body.id })
      .expect(201);
    await ownerAgent
      .post(`/api/v1/tasks/${a.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: c.body.id })
      .expect(201);
    await ownerAgent
      .delete(`/api/v1/tasks/${a.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await ownerAgent
      .post(`/api/v1/tasks/${c.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: b.body.id })
      .expect(201);

    const restored = await ownerAgent
      .post(`/api/v1/tasks/${a.body.id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(409);
    expect(restored.body.code).toBe('DEPENDENCY_CYCLE');
  });

  it('records actual minutes and keeps them out of duplicated tasks', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');

    const created = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 实际工时', columnId: todo.id, estimateMinutes: 60, actualMinutes: 90 });
    expect(created.status).toBe(201);
    expect(created.body.estimateMinutes).toBe(60);
    expect(created.body.actualMinutes).toBe(90);

    const invalid = await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actualMinutes: 17 });
    expect([400, 422]).toContain(invalid.status);

    const cleared = await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actualMinutes: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.actualMinutes).toBeNull();

    const updated = await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actualMinutes: 120 });
    expect(updated.status).toBe(200);
    expect(updated.body.actualMinutes).toBe(120);

    const duplicate = await ownerAgent
      .post(`/api/v1/tasks/${created.body.id}/duplicate`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.estimateMinutes).toBe(60);
    expect(duplicate.body.actualMinutes).toBeNull();
  });

  it('creates the next occurrence when a recurring task is completed', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');
    const done = board.body.columns.find((column: { name: string }) => column.name === '已完成');
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const created = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'E2E 每周重复',
        columnId: todo.id,
        dueDate,
        recurrence: 'WEEKLY',
        estimateMinutes: 60,
        labels: ['周会'],
      });
    expect(created.status).toBe(201);
    expect(created.body.recurrence).toBe('WEEKLY');

    const moved = await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnId: done.id, beforeTaskId: null });
    expect(moved.status).toBe(200);

    const afterBoard = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const occurrences = afterBoard.body.tasks.filter(
      (task: { title: string }) => task.title === 'E2E 每周重复',
    );
    expect(occurrences).toHaveLength(2);

    const next = occurrences.find((task: { id: string }) => task.id !== created.body.id);
    expect(next.columnId).toBe(todo.id);
    expect(next.recurrence).toBe('WEEKLY');
    expect(next.estimateMinutes).toBe(60);
    expect(next.labels).toEqual(['周会']);
    expect(new Date(next.dueDate).getTime()).toBe(
      new Date(dueDate).getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(next.completedAt).toBeNull();

    // 复制任务不继承重复规则。
    const duplicate = await ownerAgent
      .post(`/api/v1/tasks/${created.body.id}/duplicate`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.recurrence).toBe('NONE');

    // 重复移入同一完成列不应再次生成实例。
    await ownerAgent
      .patch(`/api/v1/tasks/${created.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnId: done.id, beforeTaskId: null })
      .expect(200);
    const afterSecondMove = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(
      afterSecondMove.body.tasks.filter(
        (task: { title: string }) => task.title === 'E2E 每周重复',
      ),
    ).toHaveLength(2);
  });

  it('invites a viewer and enforces permissions', async () => {
    const viewerRegister = await viewerAgent.post('/api/v1/auth/register').send({
      email: viewerEmail,
      password: e2ePassword,
      name: 'E2E Viewer',
    });
    expect(viewerRegister.status).toBe(201);
    viewerToken = viewerRegister.body.accessToken;

    const invite = await ownerAgent
      .post(`/api/v1/projects/${projectId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'VIEWER' });
    expect(invite.status).toBe(201);
    const token = invite.body.inviteUrl.split('/invite/')[1] as string;

    const preview = await viewerAgent
      .get(`/api/v1/invites/${token}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(preview.status).toBe(200);

    const accept = await viewerAgent
      .post(`/api/v1/invites/${token}/accept`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(accept.status).toBe(200);
    expect(accept.body.myRole).toBe('VIEWER');

    const denied = await viewerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'viewer forbidden' });
    expect(denied.status).toBe(403);
    expect(denied.headers['content-type']).toContain('problem+json');

    const trashDenied = await viewerAgent
      .get(`/api/v1/projects/${projectId}/trash`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(trashDenied.status).toBe(403);

    const comments = await viewerAgent
      .get(`/api/v1/projects/${projectId}/activities`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(comments.status).toBe(200);
  });

  it('rejects deleting the project as a viewer', async () => {
    const denied = await viewerAgent
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(denied.status).toBe(403);
  });

  it('creates a project from a template', async () => {
    const created = await ownerAgent
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `E2E 模板 ${suffix}`, template: 'COURSE' });
    expect(created.status).toBe(201);
    const board = await ownerAgent
      .get(`/api/v1/projects/${created.body.id}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(board.status).toBe(200);
    expect(board.body.columns).toHaveLength(3);
    expect(board.body.tasks.length).toBeGreaterThanOrEqual(6);
    const removed = await ownerAgent
      .delete(`/api/v1/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(204);
  });

  it('supports search, subtasks, AI fallback, watch, replies, reactions and preferences', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const taskId = board.body.tasks[0].id as string;

    const search = await ownerAgent
      .get(`/api/v1/search?q=${encodeURIComponent('E2E')}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.projects)).toBe(true);

    const ai = await ownerAgent
      .post(`/api/v1/tasks/${taskId}/ai-breakdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ai.status).toBe(200);
    expect(ai.body.subtasks.length).toBeGreaterThanOrEqual(3);
    expect(['ai', 'local']).toContain(ai.body.source);
    const aiStatus = await ownerAgent
      .get('/api/v1/ai/status')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(aiStatus.status).toBe(200);

    const subtask = await ownerAgent
      .post(`/api/v1/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 子任务' });
    expect(subtask.status).toBe(201);
    const toggled = await ownerAgent
      .patch(`/api/v1/subtasks/${subtask.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isDone: true });
    expect(toggled.status).toBe(200);
    expect(toggled.body.isDone).toBe(true);
    const subtasks = await ownerAgent
      .get(`/api/v1/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(subtasks.body.progress.done).toBe(1);

    const watch = await ownerAgent
      .post(`/api/v1/tasks/${taskId}/watch`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(watch.status).toBe(200);
    expect(watch.body.watching).toBe(true);
    const unwatch = await ownerAgent
      .delete(`/api/v1/tasks/${taskId}/watch`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unwatch.body.watching).toBe(false);

    const root = await ownerAgent
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E2E 根评论' }] }],
        },
      });
    expect(root.status).toBe(201);
    const reply = await ownerAgent
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        parentId: root.body.id,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E2E 回复' }] }],
        },
      });
    expect(reply.status).toBe(201);
    expect(reply.body.parentId).toBe(root.body.id);
    const reaction = await ownerAgent
      .put(`/api/v1/comments/${root.body.id}/reactions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ emoji: '🎉' });
    expect(reaction.status).toBe(200);
    expect(reaction.body.reactions[0].emoji).toBe('🎉');
    const removeReaction = await ownerAgent
      .delete(`/api/v1/comments/${root.body.id}/reactions?emoji=${encodeURIComponent('🎉')}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removeReaction.status).toBe(200);

    const taskActivities = await ownerAgent
      .get(`/api/v1/tasks/${taskId}/activities?limit=10`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(taskActivities.status).toBe(200);
    expect(taskActivities.body.items.length).toBeGreaterThan(0);

    const preferences = await ownerAgent
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(preferences.status).toBe(200);
    expect(preferences.body.preferences.TASK_UPDATED).toBe(true);
    const updated = await ownerAgent
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ preferences: { COMMENT_REACTION: false } });
    expect(updated.body.preferences.COMMENT_REACTION).toBe(false);
    await ownerAgent
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ preferences: { COMMENT_REACTION: true } });
  });

  it('supports task dependencies, blocking, force completion and duplication', async () => {
    const board = await ownerAgent
      .get(`/api/v1/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todo = board.body.columns.find((column: { name: string }) => column.name === '待办');
    const done = board.body.columns.find((column: { name: string }) => column.name === '已完成');

    const blocker = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 前置任务', columnId: todo.id });
    expect(blocker.status).toBe(201);

    const dependent = await ownerAgent
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 依赖任务', columnId: todo.id });
    expect(dependent.status).toBe(201);

    const added = await ownerAgent
      .post(`/api/v1/tasks/${dependent.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: blocker.body.id });
    expect(added.status).toBe(201);
    expect(added.body.blockedBy).toHaveLength(1);
    expect(added.body.blockedBy[0].taskId).toBe(blocker.body.id);
    expect(added.body.blockedBy[0].completed).toBe(false);

    const blockerDetail = await ownerAgent
      .get(`/api/v1/tasks/${blocker.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(blockerDetail.body.blocking[0].taskId).toBe(dependent.body.id);

    const blockedMove = await ownerAgent
      .patch(`/api/v1/tasks/${dependent.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnId: done.id, beforeTaskId: null });
    expect(blockedMove.status).toBe(409);
    expect(blockedMove.body.code).toBe('TASK_BLOCKED');

    const cycle = await ownerAgent
      .post(`/api/v1/tasks/${blocker.body.id}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ blockedByTaskId: dependent.body.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.code).toBe('DEPENDENCY_CYCLE');

    const subtask = await ownerAgent
      .post(`/api/v1/tasks/${blocker.body.id}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'E2E 复制子任务' });
    expect(subtask.status).toBe(201);

    const duplicate = await ownerAgent
      .post(`/api/v1/tasks/${blocker.body.id}/duplicate`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).not.toBe(blocker.body.id);
    expect(duplicate.body.title).toContain('（副本）');
    expect(duplicate.body.subtaskTotal).toBe(1);
    expect(duplicate.body.subtaskDone).toBe(0);

    const forced = await ownerAgent
      .patch(`/api/v1/tasks/${dependent.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnId: done.id, beforeTaskId: null, force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.completedAt).toBeTruthy();

    const removals = await Promise.all([
      ownerAgent
        .delete(`/api/v1/tasks/${dependent.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`),
      ownerAgent
        .delete(`/api/v1/tasks/${blocker.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`),
      ownerAgent
        .delete(`/api/v1/tasks/${duplicate.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`),
    ]);
    expect(removals.every((removal) => removal.status === 204)).toBe(true);
  });

  it('builds a live weekly summary and sends report email through the fake CLI', async () => {
    const current = await ownerAgent
      .get(`/api/v1/projects/${projectId}/reports/current`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(current.status).toBe(200);
    expect(current.body.summary).toContain('本周新增');
    expect(current.body.metrics.totalTasks).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(current.body.completedTaskList)).toBe(true);
    expect(Array.isArray(current.body.openTaskList)).toBe(true);
    expect(Array.isArray(current.body.riskTaskList)).toBe(true);
    expect(Array.isArray(current.body.upcomingTaskList)).toBe(true);

    const emailStatus = await ownerAgent
      .get(`/api/v1/projects/${projectId}/reports/current/email/status`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(emailStatus.status).toBe(200);
    expect(emailStatus.body.enabled).toBe(true);
    expect(emailStatus.body.available).toBe(true);
    expect(emailStatus.body.sender).toBe('bot@example.com');

    const preview = await ownerAgent
      .post(`/api/v1/projects/${projectId}/reports/current/email/preview`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ recipients: [ownerEmail], note: '请在本周五前完成评审' });
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toContain('周报');
    expect(preview.body.body).toContain('本周概览');
    expect(preview.body.source).toBe('local');
    expect(preview.body.emailAvailable).toBe(true);
    expect(preview.body.sender).toBe('bot@example.com');

    const unconfirmed = await ownerAgent
      .post(`/api/v1/projects/${projectId}/reports/current/email/send`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        recipients: [ownerEmail],
        subject: preview.body.subject,
        body: preview.body.body,
        confirm: false,
      });
    expect(unconfirmed.status).toBe(400);

    const send = await ownerAgent
      .post(`/api/v1/projects/${projectId}/reports/current/email/send`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        recipients: [ownerEmail],
        subject: preview.body.subject,
        body: preview.body.body,
        confirm: true,
      });
    expect(send.status).toBe(200);
    expect(send.body.sent).toBe(true);
    expect(send.body.messageId).toBe('msg_e2e');
    expect(send.body.sender).toBe('bot@example.com');

    const captured = JSON.parse(await readFile(mailCapturePath, 'utf8')) as {
      args: string[];
      body: string;
    };
    expect(captured.args).toEqual(
      expect.arrayContaining([
        'message',
        '+send',
        '--to',
        ownerEmail,
        '--subject',
        preview.body.subject,
        '--body-file',
        'body.txt',
        '--confirmed',
      ]),
    );
    expect(captured.body).toContain('本周概览');

    const activities = await ownerAgent
      .get(`/api/v1/projects/${projectId}/activities?limit=20`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const emailActivity = activities.body.items.find(
      (item: { type: string }) => item.type === 'REPORT_EMAIL_SENT',
    );
    expect(emailActivity).toBeTruthy();
    expect(emailActivity.payload.recipientCount).toBe(1);
    expect(emailActivity.payload.sender).toBe('bot@example.com');

    const snapshot = await ownerAgent
      .post(`/api/v1/projects/${projectId}/reports/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ weekStart: current.body.weekStart });
    expect(snapshot.status).toBe(201);
    expect(snapshot.body.data.summary).toContain('本周新增');
    expect(Array.isArray(snapshot.body.data.openTaskList)).toBe(true);
  });

  it('updates profile avatar/nickname and changes password', async () => {
    const avatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const updated = await ownerAgent
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E Owner Updated', avatarUrl: avatar });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('E2E Owner Updated');
    expect(updated.body.avatarUrl).toBe(avatar);

    const me = await ownerAgent
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(me.body.name).toBe('E2E Owner Updated');

    const invalidAvatar = await ownerAgent
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ avatarUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
    expect(invalidAvatar.status).toBe(400);

    const wrongPassword = await ownerAgent
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: e2eWrongPassword, newPassword: e2eNewPassword });
    expect(wrongPassword.status).toBe(422);
    expect(wrongPassword.body.code).toBe('INVALID_CURRENT_PASSWORD');

    const changed = await ownerAgent
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: e2ePassword, newPassword: e2eNewPassword });
    expect(changed.status).toBe(200);
    expect(changed.body.changed).toBe(true);

    const oldLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: e2ePassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: e2eNewPassword });
    expect(newLogin.status).toBe(200);
  });
});
