import { Injectable } from '@nestjs/common';
import type { PermissionOverrides } from '@teamflow/shared/permissions';
import { resolvePermissions } from '@teamflow/shared/permissions';
import { DomainError } from '../../common/domain-error';
import type { ProjectAccessContext } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

function normalizeOverrides(value: unknown): PermissionOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PermissionOverrides;
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveProjectId(params: Record<string, string | undefined>): Promise<string | null> {
    if (params.projectId) return params.projectId;
    if (params.columnId) {
      const column = await this.prisma.boardColumn.findUnique({
        where: { id: params.columnId },
        select: { projectId: true },
      });
      return column?.projectId ?? null;
    }
    if (params.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: params.taskId },
        select: { projectId: true },
      });
      return task?.projectId ?? null;
    }
    if (params.commentId) {
      const comment = await this.prisma.taskComment.findUnique({
        where: { id: params.commentId },
        select: { task: { select: { projectId: true } } },
      });
      return comment?.task.projectId ?? null;
    }
    if (params.subtaskId) {
      const subtask = await this.prisma.taskSubtask.findUnique({
        where: { id: params.subtaskId },
        select: { task: { select: { projectId: true } } },
      });
      return subtask?.task.projectId ?? null;
    }
    if (params.attachmentId) {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: params.attachmentId },
        select: { task: { select: { projectId: true } } },
      });
      return attachment?.task.projectId ?? null;
    }
    if (params.reportId) {
      const report = await this.prisma.weeklyReport.findUnique({
        where: { id: params.reportId },
        select: { projectId: true },
      });
      return report?.projectId ?? null;
    }
    return null;
  }

  async getContext(userId: string, projectId: string): Promise<ProjectAccessContext> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { project: true },
    });
    if (!membership) {
      throw new DomainError('NOT_FOUND', 404, 'Project not found');
    }
    const overrides = normalizeOverrides(membership.permissionOverrides);
    return {
      projectId,
      role: membership.role,
      permissions: resolvePermissions(membership.role, overrides),
      overrides,
      archived: membership.project.archivedAt !== null,
    };
  }
}
