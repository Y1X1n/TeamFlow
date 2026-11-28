import { Injectable } from '@nestjs/common';
import { PROJECT_TEMPLATES } from '@teamflow/shared/enums';
import { initialPositions, comparePositions } from '@teamflow/shared/fractional';
import type { CreateProjectInput, UpdateProjectInput } from '@teamflow/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { ProjectAccessContext } from '../../common/auth.types';
import { DomainError } from '../../common/domain-error';
import { serializeProject, serializeTaskCard, type ProjectLike } from '../../common/serializers';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { BoardEventsService } from '../events/events.module';
import { AccessService } from '../permissions/access.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly events: BoardEventsService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string, archived: boolean) {
    const memberships = await this.prisma.projectMember.findMany({
      where: {
        userId,
        project: { archivedAt: archived ? { not: null } : null },
      },
      include: {
        project: {
          include: {
            _count: {
              select: {
                members: true,
                tasks: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
      orderBy: { project: { updatedAt: 'desc' } },
    });
    const projectIds = memberships.map((membership) => membership.projectId);
    if (projectIds.length === 0) return { items: [] };

    const [completed, myOpen] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, deletedAt: null, completedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          completedAt: null,
          assigneeId: userId,
        },
        _count: { _all: true },
      }),
    ]);
    const completedMap = new Map(completed.map((row) => [row.projectId, row._count._all]));
    const myOpenMap = new Map(myOpen.map((row) => [row.projectId, row._count._all]));

    return {
      items: memberships.map((membership) =>
        serializeProject(membership.project, membership.role, {
          memberCount: membership.project._count.members,
          taskCount: membership.project._count.tasks,
          completedTaskCount: completedMap.get(membership.projectId) ?? 0,
          myOpenTaskCount: myOpenMap.get(membership.projectId) ?? 0,
        }),
      ),
    };
  }

  async create(userId: string, input: CreateProjectInput) {
    const templateId = input.template ?? 'BLANK';
    const template =
      PROJECT_TEMPLATES.find((item) => item.id === templateId) ?? PROJECT_TEMPLATES[0]!;
    const positions = initialPositions(template.columns.length);
    const taskCount = template.tasks.length;
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? '#6366F1',
          ownerId: userId,
        },
      });
      await tx.projectMember.create({
        data: { projectId: created.id, userId, role: 'OWNER' },
      });
      const columns: Array<{ id: string }> = [];
      for (const [index, column] of template.columns.entries()) {
        columns.push(
          await tx.boardColumn.create({
            data: {
              projectId: created.id,
              name: column.name,
              isDone: column.isDone,
              position: positions[index]!,
            },
          }),
        );
      }
      if (taskCount > 0 && columns[0]) {
        const taskPositions = initialPositions(taskCount);
        await tx.task.createMany({
          data: template.tasks.map((task, index) => ({
            projectId: created.id,
            columnId: columns[0]!.id,
            title: task.title,
            priority: task.priority,
            labels: [...task.labels],
            createdById: userId,
            position: taskPositions[index]!,
          })),
        });
      }
      await this.activities.record(tx, {
        projectId: created.id,
        actorId: userId,
        type: 'PROJECT_CREATED',
        payload: { name: created.name, template: template.id },
      });
      return created;
    });
    return serializeProject(project, 'OWNER', {
      memberCount: 1,
      taskCount,
      completedTaskCount: 0,
      myOpenTaskCount: 0,
    });
  }

  private async counts(userId: string, projectId: string) {
    const [memberCount, taskCount, completedTaskCount, myOpenTaskCount] = await Promise.all([
      this.prisma.projectMember.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId, deletedAt: null } }),
      this.prisma.task.count({ where: { projectId, deletedAt: null, completedAt: { not: null } } }),
      this.prisma.task.count({
        where: { projectId, deletedAt: null, completedAt: null, assigneeId: userId },
      }),
    ]);
    return { memberCount, taskCount, completedTaskCount, myOpenTaskCount };
  }

  async get(userId: string, projectId: string) {
    const access = await this.access.getContext(userId, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');
    return serializeProject(project, access.role, await this.counts(userId, projectId));
  }

  private assertFieldPermission(access: ProjectAccessContext, permission: string): void {
    if (!(access.permissions as string[]).includes(permission)) {
      throw new DomainError('FORBIDDEN', 403, `Missing permission ${permission}`);
    }
  }

  async update(userId: string, projectId: string, input: UpdateProjectInput) {
    const access = await this.access.getContext(userId, projectId);
    const touchesFields =
      input.name !== undefined || input.description !== undefined || input.color !== undefined;
    const touchesArchive = input.archived !== undefined;

    if (touchesFields) this.assertFieldPermission(access, 'project:update');
    if (touchesArchive) this.assertFieldPermission(access, 'project:archive');
    if (access.archived && input.archived !== false) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }

    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.color !== undefined) data.color = input.color;
    if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id: projectId }, data });
      const type =
        input.archived === true
          ? 'PROJECT_ARCHIVED'
          : input.archived === false
            ? 'PROJECT_UNARCHIVED'
            : 'PROJECT_UPDATED';
      await this.activities.record(tx, {
        projectId,
        actorId: userId,
        type,
        payload: { name: updated.name },
      });
      return updated;
    });
    return serializeProject(project, access.role, await this.counts(userId, projectId));
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const access = await this.access.getContext(userId, projectId);
    if (access.role !== 'OWNER' || !access.permissions.includes('project:delete')) {
      throw new DomainError('FORBIDDEN', 403, 'Only the project owner can delete the project');
    }
    const attachments = await this.prisma.attachment.findMany({
      where: { task: { projectId } },
      select: { objectKey: true },
    });
    await this.prisma.project.delete({ where: { id: projectId } });
    await this.storage.deleteMany(attachments.map((attachment) => attachment.objectKey));
  }

  async board(userId: string, projectId: string) {
    const access = await this.access.getContext(userId, projectId);
    const [project, columns, tasks, members, counts] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.boardColumn.findMany({ where: { projectId } }),
      this.prisma.task.findMany({
        where: { projectId, deletedAt: null },
        omit: { description: true },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          subtasks: { select: { isDone: true } },
          blockedByDependencies: {
            select: { blockedBy: { select: { completedAt: true, deletedAt: true } } },
          },
          blockingDependencies: {
            select: { task: { select: { completedAt: true, deletedAt: true } } },
          },
          _count: {
            select: {
              comments: { where: { deletedAt: null } },
              attachments: true,
            },
          },
        },
      }),
      this.prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.counts(userId, projectId),
    ]);
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');

    const sortedColumns = [...columns].sort(
      (a, b) => comparePositions(a.position, b.position) || a.id.localeCompare(b.id),
    );
    const columnIndex = new Map(sortedColumns.map((column, index) => [column.id, index]));
    const roleByUser = new Map(members.map((member) => [member.userId, member.role]));

    const cards = tasks.map((task) =>
      serializeTaskCard(
        {
          ...task,
          commentCount: task._count.comments,
          attachmentCount: task._count.attachments,
          blockedByCount: task.blockedByDependencies.filter(
            (dependency) => !dependency.blockedBy.deletedAt && !dependency.blockedBy.completedAt,
          ).length,
          blockingCount: task.blockingDependencies.filter(
            (dependency) => !dependency.task.deletedAt && !dependency.task.completedAt,
          ).length,
        },
        task.assigneeId ? (roleByUser.get(task.assigneeId) ?? 'MEMBER') : 'MEMBER',
      ),
    );
    cards.sort(
      (a, b) =>
        (columnIndex.get(a.columnId) ?? 0) - (columnIndex.get(b.columnId) ?? 0) ||
        comparePositions(a.position, b.position) ||
        a.id.localeCompare(b.id),
    );

    const truncated = cards.length > 1000;
    return {
      truncated,
      board: {
        project: serializeProject(project as ProjectLike, access.role, counts),
        columns: sortedColumns.map((column) => ({
          id: column.id,
          projectId: column.projectId,
          name: column.name,
          position: column.position,
          isDone: column.isDone,
          taskCount: tasks.filter((task) => task.columnId === column.id).length,
        })),
        tasks: truncated ? cards.slice(0, 1000) : cards,
        members: members.map((member) => ({
          userId: member.userId,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
          role: member.role,
        })),
        myPermissions: access.permissions,
      },
    };
  }
}
