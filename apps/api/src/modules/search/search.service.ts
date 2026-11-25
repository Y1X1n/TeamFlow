import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, query: string, limit: number) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const projectIds = memberships.map((membership) => membership.projectId);
    if (projectIds.length === 0) {
      return { projects: [], tasks: [], members: [] };
    }

    const [projects, tasks, memberRows] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          id: { in: projectIds },
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, description: true, color: true, archivedAt: true },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          title: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          columnId: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          project: { select: { name: true, color: true } },
          column: { select: { name: true } },
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectMember.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [
            { user: { name: { contains: query, mode: 'insensitive' } } },
            { user: { email: { contains: query, mode: 'insensitive' } } },
          ],
        },
        select: {
          userId: true,
          user: { select: { name: true, email: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
        take: limit * 2,
      }),
    ]);

    const memberMap = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        avatarUrl: string | null;
        projects: Array<{ id: string; name: string }>;
      }
    >();
    for (const row of memberRows) {
      const existing = memberMap.get(row.userId) ?? {
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        avatarUrl: row.user.avatarUrl,
        projects: [],
      };
      if (!existing.projects.some((project) => project.id === row.project.id)) {
        existing.projects.push(row.project);
      }
      memberMap.set(row.userId, existing);
    }

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        archived: project.archivedAt !== null,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: task.project.name,
        projectColor: task.project.color,
        columnId: task.columnId,
        columnName: task.column.name,
        priority: task.priority,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
      })),
      members: [...memberMap.values()].slice(0, limit),
    };
  }
}
