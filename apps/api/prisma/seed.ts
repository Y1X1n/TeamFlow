import { config } from 'dotenv';
config({ path: ['../../.env', '.env'] });
import { PrismaClient } from '@prisma/client';
import { BOARD_DEFAULT_COLUMNS } from '@teamflow/shared/enums';
import { initialPositions } from '@teamflow/shared/fractional';
import { hashPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();

const day = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const localDatabase = /@(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(databaseUrl);
  if (
    (process.env.NODE_ENV === 'production' || !localDatabase) &&
    process.env.ALLOW_DEMO_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed demo accounts with a known password outside a local database. Set ALLOW_DEMO_SEED=true only for disposable environments.',
    );
  }
  const passwordHash = await hashPassword('Passw0rd!');
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: { name: 'Alice', passwordHash },
    create: { email: 'alice@example.com', name: 'Alice', passwordHash },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: { name: 'Bob', passwordHash },
    create: { email: 'bob@example.com', name: 'Bob', passwordHash },
  });

  const existing = await prisma.project.findFirst({
    where: { name: '毕业设计协作', ownerId: alice.id },
  });
  if (existing) {
    console.log('Seed skipped: demo project already exists');
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: '毕业设计协作',
      description: 'TeamFlow 演示项目：用看板管理毕业论文、演示与文档。',
      color: '#6366F1',
      ownerId: alice.id,
    },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: alice.id, role: 'OWNER' },
      { projectId: project.id, userId: bob.id, role: 'MEMBER' },
    ],
  });

  const columnPositions = initialPositions(BOARD_DEFAULT_COLUMNS.length);
  const columns = [];
  for (const [index, definition] of BOARD_DEFAULT_COLUMNS.entries()) {
    columns.push(
      await prisma.boardColumn.create({
        data: {
          projectId: project.id,
          name: definition.name,
          isDone: definition.isDone,
          position: columnPositions[index]!,
        },
      }),
    );
  }
  const todo = columns[0]!;
  const doing = columns[1]!;
  const done = columns[2]!;

  const descriptions = {
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '补充系统架构图、部署说明与演示脚本。' }],
        },
      ],
    },
  };

  const todoPositions = initialPositions(3);
  const doingPositions = initialPositions(2);
  const donePositions = initialPositions(1);

  const openTask = await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: todo.id,
      title: '撰写开题报告',
      description: descriptions.doc,
      priority: 'HIGH',
      assigneeId: bob.id,
      createdById: alice.id,
      dueDate: new Date(Date.now() - day),
      labels: ['文档'],
      position: todoPositions[0]!,
    },
  });
  const designTask = await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: todo.id,
      title: '梳理权限矩阵',
      priority: 'MEDIUM',
      assigneeId: bob.id,
      createdById: alice.id,
      dueDate: new Date(Date.now() + 3 * day),
      labels: ['后端', '安全'],
      position: todoPositions[1]!,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: todo.id,
      title: '准备答辩材料',
      priority: 'LOW',
      createdById: alice.id,
      labels: ['演示'],
      position: todoPositions[2]!,
    },
  });
  const realtimeTask = await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: doing.id,
      title: '实现实时看板同步',
      priority: 'URGENT',
      assigneeId: alice.id,
      createdById: alice.id,
      dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
      labels: ['前端', '实时'],
      position: doingPositions[0]!,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: doing.id,
      title: '接入任务通知',
      priority: 'MEDIUM',
      assigneeId: bob.id,
      createdById: alice.id,
      dueDate: new Date(Date.now() + 2 * day),
      position: doingPositions[1]!,
    },
  });
  const doneTask = await prisma.task.create({
    data: {
      projectId: project.id,
      columnId: done.id,
      title: '完成登录与注册流程',
      priority: 'HIGH',
      assigneeId: alice.id,
      createdById: alice.id,
      completedAt: new Date(Date.now() - 2 * day),
      labels: ['前端'],
      position: donePositions[0]!,
    },
  });

  const comment = await prisma.taskComment.create({
    data: {
      taskId: realtimeTask.id,
      authorId: bob.id,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: alice.id, label: 'Alice' } },
              { type: 'text', text: ' 在线头像的节流记得做成 50ms。' },
            ],
          },
        ],
      },
      bodyText: '在线头像的节流记得做成 50ms。',
      mentions: [alice.id],
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: realtimeTask.id,
      authorId: alice.id,
      parentId: comment.id,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '收到，已加入性能验收清单。' }],
          },
        ],
      },
      bodyText: '收到，已加入性能验收清单。',
    },
  });

  await prisma.commentReaction.create({
    data: { commentId: comment.id, userId: alice.id, emoji: '👍' },
  });

  await prisma.taskSubtask.createMany({
    data: [
      {
        taskId: realtimeTask.id,
        title: 'Hocuspocus 服务端认证',
        isDone: true,
        position: 0,
      },
      {
        taskId: realtimeTask.id,
        title: '看板位置投影与广播',
        isDone: false,
        position: 1,
      },
      {
        taskId: realtimeTask.id,
        title: '在线成员 presence 展示',
        isDone: false,
        position: 2,
      },
    ],
  });

  await prisma.taskWatcher.createMany({
    data: [
      { taskId: realtimeTask.id, userId: alice.id },
      { taskId: realtimeTask.id, userId: bob.id },
    ],
    skipDuplicates: true,
  });

  await prisma.taskDependency.create({
    data: {
      taskId: openTask.id,
      blockedById: designTask.id,
      createdById: alice.id,
    },
  });

  await prisma.activity.createMany({
    data: [
      {
        projectId: project.id,
        actorId: alice.id,
        type: 'PROJECT_CREATED',
        payload: { name: project.name },
      },
      {
        projectId: project.id,
        actorId: bob.id,
        type: 'MEMBER_JOINED',
        payload: { userId: bob.id, name: bob.name, role: 'MEMBER' },
      },
      {
        projectId: project.id,
        actorId: alice.id,
        taskId: openTask.id,
        type: 'TASK_CREATED',
        payload: { taskId: openTask.id, title: openTask.title, columnId: todo.id },
      },
      {
        projectId: project.id,
        actorId: alice.id,
        taskId: designTask.id,
        type: 'TASK_CREATED',
        payload: { taskId: designTask.id, title: designTask.title, columnId: todo.id },
      },
      {
        projectId: project.id,
        actorId: alice.id,
        taskId: openTask.id,
        type: 'TASK_DEPENDENCY_ADDED',
        payload: {
          taskId: openTask.id,
          title: openTask.title,
          blockedByTaskId: designTask.id,
          blockedByTitle: designTask.title,
        },
      },
      {
        projectId: project.id,
        actorId: alice.id,
        taskId: doneTask.id,
        type: 'TASK_COMPLETED',
        payload: { taskId: doneTask.id, title: doneTask.title, columnId: done.id },
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: bob.id,
        type: 'TASK_ASSIGNED',
        payload: {
          projectId: project.id,
          taskId: openTask.id,
          taskTitle: openTask.title,
        },
      },
      {
        userId: alice.id,
        type: 'MENTION',
        payload: {
          projectId: project.id,
          taskId: realtimeTask.id,
          taskTitle: realtimeTask.title,
          excerpt: '在线头像的节流记得做成 50ms。',
        },
      },
    ],
  });

  console.log(`Seeded project ${project.name} (${project.id})`);
  console.log('Demo accounts: alice@example.com / Passw0rd!, bob@example.com / Passw0rd!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
