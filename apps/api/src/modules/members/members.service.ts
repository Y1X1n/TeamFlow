import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { UpdateMemberInput, CreateInviteInput } from '@teamflow/shared/schemas';
import type { ProjectRole } from '@teamflow/shared/enums';
import type { PermissionOverrides } from '@teamflow/shared/permissions';
import {
  isPermissionKey,
  OWNER_ONLY_PERMISSIONS,
  type Permission,
} from '@teamflow/shared/permissions';
import { DomainError } from '../../common/domain-error';
import { randomToken, sha256Hex } from '../../common/hash';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { BoardEventsService } from '../events/events.module';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../permissions/access.service';
import { ProjectsService } from '../projects/projects.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_WEIGHT: Record<ProjectRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

function assertCanManageMember(actorRole: ProjectRole, targetRole: ProjectRole): void {
  if (actorRole === 'ADMIN' && targetRole === 'ADMIN') {
    throw new DomainError('ADMIN_CANNOT_MANAGE_ADMIN', 409, 'Admins cannot manage admins');
  }
  if (ROLE_WEIGHT[actorRole] <= ROLE_WEIGHT[targetRole]) {
    throw new DomainError('FORBIDDEN', 403, 'Cannot manage a member at or above your role');
  }
}

export interface SerializedMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectRole;
  permissionOverrides: PermissionOverrides | null;
  skills: string[];
  joinedAt: Date;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
    private readonly events: BoardEventsService,
    private readonly projects: ProjectsService,
  ) {}

  private serializeMember(member: {
    id: string;
    userId: string;
    role: ProjectRole;
    permissionOverrides: Prisma.JsonValue;
    skills: string[];
    joinedAt: Date;
    user: { email: string; name: string; avatarUrl: string | null };
  }): SerializedMember {
    return {
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      permissionOverrides:
        member.permissionOverrides && typeof member.permissionOverrides === 'object'
          ? (member.permissionOverrides as PermissionOverrides)
          : null,
      skills: member.skills ?? [],
      joinedAt: member.joinedAt,
    };
  }

  async list(projectId: string): Promise<{ items: SerializedMember[] }> {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { email: true, name: true, avatarUrl: true } } },
      orderBy: [{ joinedAt: 'asc' }],
    });
    return { items: members.map((member) => this.serializeMember(member)) };
  }

  async createInvite(actorId: string, projectId: string, input: CreateInviteInput) {
    const access = await this.access.getContext(actorId, projectId);
    if (input.role === 'ADMIN' && access.role !== 'OWNER') {
      throw new DomainError('FORBIDDEN', 403, 'Only the owner can invite admins');
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user) {
      const existing = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (existing) throw new DomainError('ALREADY_MEMBER', 409, 'User is already a member');
    }

    const rawToken = randomToken();
    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.projectInvite.updateMany({
        where: { projectId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.projectInvite.create({
        data: {
          projectId,
          email: input.email,
          role: input.role,
          tokenHash: sha256Hex(rawToken),
          invitedById: actorId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
    });

    const inviteUrl = `${this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '')}/invite/${rawToken}`;
    if (user) {
      await this.notifications.create({
        userId: user.id,
        type: 'INVITE',
        payload: {
          projectId,
          projectName: project.name,
          role: input.role,
          inviteUrl,
        },
      });
    }

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: 'PENDING' as const,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
      inviteUrl,
    };
  }

  async listInvites(projectId: string) {
    const invites = await this.prisma.projectInvite.findMany({
      where: {
        projectId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: 'PENDING' as const,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
    };
  }

  async revokeInvite(projectId: string, inviteId: string): Promise<void> {
    const invite = await this.prisma.projectInvite.findFirst({
      where: { id: inviteId, projectId },
    });
    if (!invite) throw new DomainError('NOT_FOUND', 404, 'Invite not found');
    if (invite.acceptedAt) throw new DomainError('INVITE_USED', 409, 'Invite already used');
    await this.prisma.projectInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
  }

  async preview(rawToken: string) {
    const invite = await this.prisma.projectInvite.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: {
        project: { select: { id: true, name: true, color: true, archivedAt: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invite) throw new DomainError('NOT_FOUND', 404, 'Invite not found');
    if (invite.revokedAt) throw new DomainError('INVITE_REVOKED', 410, 'Invite revoked');
    if (invite.acceptedAt) throw new DomainError('INVITE_USED', 409, 'Invite already used');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('INVITE_EXPIRED', 410, 'Invite expired');
    }
    if (invite.project.archivedAt) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }
    return {
      projectId: invite.project.id,
      projectName: invite.project.name,
      projectColor: invite.project.color,
      role: invite.role,
      inviterName: invite.invitedBy.name,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(userId: string, rawToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new DomainError('UNAUTHORIZED', 401, 'User not found');
    const invite = await this.prisma.projectInvite.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: { project: { select: { id: true, name: true, archivedAt: true } } },
    });
    if (!invite) throw new DomainError('NOT_FOUND', 404, 'Invite not found');
    if (invite.revokedAt) throw new DomainError('INVITE_REVOKED', 410, 'Invite revoked');
    if (invite.acceptedAt) throw new DomainError('INVITE_USED', 409, 'Invite already used');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('INVITE_EXPIRED', 410, 'Invite expired');
    }
    if (invite.project.archivedAt) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new DomainError('INVITE_EMAIL_MISMATCH', 403, 'Invite belongs to another email');
    }
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invite.projectId, userId } },
    });
    if (existing) throw new DomainError('ALREADY_MEMBER', 409, 'Already a member');

    try {
      await this.prisma.$transaction(async (tx) => {
        const used = await tx.projectInvite.updateMany({
          where: { id: invite.id, acceptedAt: null, revokedAt: null },
          data: { acceptedAt: new Date() },
        });
        if (used.count !== 1) throw new DomainError('INVITE_USED', 409, 'Invite already used');
        await tx.projectMember.create({
          data: { projectId: invite.projectId, userId, role: invite.role },
        });
        await this.activities.record(tx, {
          projectId: invite.projectId,
          actorId: userId,
          type: 'MEMBER_JOINED',
          payload: { userId, name: user.name, role: invite.role },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('ALREADY_MEMBER', 409, 'Already a member');
      }
      throw error;
    }

    const admins = await this.prisma.projectMember.findMany({
      where: {
        projectId: invite.projectId,
        role: { in: ['OWNER', 'ADMIN'] },
        userId: { not: userId },
      },
      select: { userId: true },
    });
    await this.notifications.createMany(
      admins.map((admin) => ({
        userId: admin.userId,
        type: 'MEMBER_JOINED' as const,
        payload: {
          projectId: invite.projectId,
          projectName: invite.project.name,
          userId,
          name: user.name,
          role: invite.role,
        },
        dedupeKey: `member-joined:${invite.id}:${admin.userId}`,
      })),
    );

    return this.projects.get(userId, invite.projectId);
  }

  async updateMember(
    actorId: string,
    projectId: string,
    targetUserId: string,
    input: UpdateMemberInput,
  ): Promise<SerializedMember> {
    const actorAccess = await this.access.getContext(actorId, projectId);
    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      include: { user: { select: { email: true, name: true, avatarUrl: true } } },
    });
    if (!target) throw new DomainError('NOT_FOUND', 404, 'Member not found');
    if (target.role === 'OWNER') {
      throw new DomainError('OWNER_IMMUTABLE', 409, 'Owner cannot be modified');
    }
    assertCanManageMember(actorAccess.role, target.role);
    if (
      input.role !== undefined &&
      input.role !== target.role &&
      ROLE_WEIGHT[input.role] >= ROLE_WEIGHT[actorAccess.role]
    ) {
      throw new DomainError('FORBIDDEN', 403, 'Cannot grant a role at or above your own');
    }
    if (input.permissionOverrides) {
      const grantable = new Set<Permission>(
        actorAccess.permissions.filter(
          (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission),
        ),
      );
      const forbidden = Object.entries(input.permissionOverrides)
        .filter(
          ([key, granted]) =>
            granted === true && (!isPermissionKey(key) || !grantable.has(key as Permission)),
        )
        .map(([key]) => key);
      if (forbidden.length > 0) {
        throw new DomainError(
          'FORBIDDEN',
          403,
          `Cannot grant permissions you do not have: ${forbidden.join(', ')}`,
        );
      }
    }

    const data: Prisma.ProjectMemberUpdateInput = {};
    if (input.role !== undefined) data.role = input.role;
    if (input.permissionOverrides !== undefined) {
      data.permissionOverrides =
        input.permissionOverrides === null ? Prisma.DbNull : input.permissionOverrides;
    }
    if (input.skills !== undefined) data.skills = input.skills;

    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.update({
        where: { id: target.id },
        data,
        include: { user: { select: { email: true, name: true, avatarUrl: true } } },
      });
      if (input.role !== undefined && input.role !== target.role) {
        await this.activities.record(tx, {
          projectId,
          actorId,
          type: 'MEMBER_ROLE_CHANGED',
          payload: { userId: targetUserId, from: target.role, to: input.role },
        });
      }
      if (input.permissionOverrides !== undefined) {
        await this.activities.record(tx, {
          projectId,
          actorId,
          type: 'MEMBER_PERMISSIONS_CHANGED',
          payload: { userId: targetUserId, overrides: input.permissionOverrides },
        });
      }
      if (input.skills !== undefined) {
        await this.activities.record(tx, {
          projectId,
          actorId,
          type: 'MEMBER_SKILLS_CHANGED',
          payload: { userId: targetUserId, skills: input.skills },
        });
      }
      return member;
    });

    const roleOrPermissionsChanged =
      input.role !== undefined || input.permissionOverrides !== undefined;
    if (roleOrPermissionsChanged) {
      await this.notifications.create({
        userId: targetUserId,
        type: 'ROLE_CHANGED',
        payload: {
          projectId,
          role: updated.role,
          kind: input.role !== undefined ? 'role' : 'permissions',
        },
      });
    }
    if (roleOrPermissionsChanged || input.skills !== undefined) {
      await this.events.publish(projectId, 'project.member.changed', { userId: targetUserId });
    }
    return this.serializeMember(updated);
  }

  async updateMySkills(
    actorId: string,
    projectId: string,
    skills: string[],
  ): Promise<SerializedMember> {
    const access = await this.access.getContext(actorId, projectId);
    if (access.archived) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.update({
        where: { projectId_userId: { projectId, userId: actorId } },
        data: { skills },
        include: { user: { select: { email: true, name: true, avatarUrl: true } } },
      });
      await this.activities.record(tx, {
        projectId,
        actorId,
        type: 'MEMBER_SKILLS_CHANGED',
        payload: { userId: actorId, skills },
      });
      return member;
    });

    await this.events.publish(projectId, 'project.member.changed', { userId: actorId });
    return this.serializeMember(updated);
  }

  async removeMember(actorId: string, projectId: string, targetUserId: string): Promise<void> {
    const actorAccess = await this.access.getContext(actorId, projectId);
    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      include: { project: { select: { name: true } } },
    });
    if (!target) throw new DomainError('NOT_FOUND', 404, 'Member not found');
    if (target.role === 'OWNER') {
      throw new DomainError('OWNER_IMMUTABLE', 409, 'Owner cannot be removed');
    }
    assertCanManageMember(actorAccess.role, target.role);

    await this.prisma.$transaction(async (tx) => {
      await tx.taskWatcher.deleteMany({
        where: { userId: targetUserId, task: { projectId } },
      });
      await tx.task.updateMany({
        where: { projectId, assigneeId: targetUserId },
        data: { assigneeId: null },
      });
      await tx.projectMember.delete({ where: { id: target.id } });
      await this.activities.record(tx, {
        projectId,
        actorId,
        type: 'MEMBER_REMOVED',
        payload: { userId: targetUserId },
      });
    });
    await this.notifications.create({
      userId: targetUserId,
      type: 'MEMBER_REMOVED',
      payload: { projectId, projectName: target.project.name },
    });
    await this.events.publish(projectId, 'project.member.changed', { userId: targetUserId });
  }
}
