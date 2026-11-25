import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth.types';
import { DomainError } from '../../common/domain-error';
import { serializeTaskCard, serializeUser } from '../../common/serializers';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(user: AuthenticatedUser) {
    return serializeUser(user);
  }

  async updateMe(
    userId: string,
    input: { name?: string; avatarUrl?: string | null },
  ): Promise<ReturnType<typeof serializeUser>> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
    return serializeUser(user);
  }

  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new DomainError('NOT_FOUND', 404, 'User not found');
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new DomainError('INVALID_CURRENT_PASSWORD', 422, '当前密码不正确');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { changed: true };
  }

  async myTasks(
    userId: string,
    query: { status?: 'open' | 'overdue' | 'done'; limit?: number },
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const limit = query.limit ?? 50;
    const status = query.status ?? 'open';
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      assigneeId: userId,
      deletedAt: null,
    };
    if (status === 'open') where.completedAt = null;
    if (status === 'done') where.completedAt = { not: null };
    if (status === 'overdue') {
      where.completedAt = null;
      where.dueDate = { lt: now };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      take: limit,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        subtasks: { select: { isDone: true } },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            members: { where: { userId }, select: { role: true } },
          },
        },
        _count: {
          select: {
            comments: { where: { deletedAt: null } },
            attachments: true,
          },
        },
      },
    });

    return {
      items: tasks.map((task) => {
        const role = task.project.members[0]?.role ?? 'VIEWER';
        return {
          ...serializeTaskCard(
            {
              ...task,
              commentCount: task._count.comments,
              attachmentCount: task._count.attachments,
            },
            role,
          ),
          project: {
            id: task.project.id,
            name: task.project.name,
            color: task.project.color,
          },
        };
      }),
    };
  }
}
