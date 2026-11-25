import { Injectable } from '@nestjs/common';
import { COMMENT_TEXT_MAX_LENGTH, REACTION_EMOJIS } from '@teamflow/shared/enums';
import { analyzeRichText } from '@teamflow/shared/richtext';
import type { CreateCommentInput, UpdateCommentInput } from '@teamflow/shared/schemas';
import type { Prisma } from '@prisma/client';
import { DomainError } from '../../common/domain-error';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../permissions/access.service';

interface CommentRecord {
  id: string;
  taskId: string;
  authorId: string;
  parentId: string | null;
  body: Prisma.JsonValue;
  bodyText: string;
  mentions: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; avatarUrl: string | null };
  parent: {
    id: string;
    authorId: string;
    author: { name: string };
  } | null;
  reactions: Array<{
    emoji: string;
    userId: string;
    user: { name: string };
  }>;
  _count: { replies: number };
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
  ) {}

  private include = {
    author: { select: { id: true, name: true, avatarUrl: true } },
    parent: {
      select: { id: true, authorId: true, author: { select: { name: true } } },
    },
    reactions: {
      select: { emoji: true, userId: true, user: { select: { name: true } } },
    },
    _count: { select: { replies: true } },
  } satisfies Prisma.TaskCommentInclude;

  private aggregateReactions(comment: CommentRecord, viewerId: string) {
    const map = new Map<
      string,
      { emoji: string; count: number; reactedByMe: boolean; userNames: string[] }
    >();
    for (const reaction of comment.reactions) {
      const entry = map.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        reactedByMe: false,
        userNames: [],
      };
      entry.count += 1;
      entry.reactedByMe = entry.reactedByMe || reaction.userId === viewerId;
      entry.userNames.push(reaction.user.name);
      map.set(reaction.emoji, entry);
    }
    return REACTION_EMOJIS.flatMap((emoji) => {
      const entry = map.get(emoji);
      return entry ? [entry] : [];
    });
  }

  private serialize(
    comment: CommentRecord,
    viewerId: string,
    deleted = comment.deletedAt !== null,
  ) {
    return {
      id: comment.id,
      taskId: comment.taskId,
      author: {
        userId: comment.author.id,
        name: comment.author.name,
        avatarUrl: comment.author.avatarUrl,
      },
      parentId: comment.parentId,
      replyTo: comment.parent
        ? {
            commentId: comment.parent.id,
            userId: comment.parent.authorId,
            name: comment.parent.author.name,
          }
        : null,
      body: deleted ? null : comment.body,
      bodyText: deleted ? null : comment.bodyText,
      mentions: deleted ? [] : comment.mentions,
      reactions: deleted ? [] : this.aggregateReactions(comment, viewerId),
      replyCount: comment._count.replies,
      deleted,
      edited: comment.updatedAt.getTime() - comment.createdAt.getTime() > 1000,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async list(taskId: string, viewerId: string, cursor: string | undefined, limit: number) {
    const cursorId = decodeCursor(cursor);
    const rows = await this.prisma.taskComment.findMany({
      where: { taskId },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: this.include,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((comment) => this.serialize(comment, viewerId)),
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!.id) : null,
    };
  }

  private analyze(body: Record<string, unknown>): { text: string; mentions: string[] } {
    const analyzed = analyzeRichText(body);
    if (analyzed.text.length > COMMENT_TEXT_MAX_LENGTH) {
      throw new DomainError('VALIDATION_ERROR', 400, '评论超过 5000 字限制');
    }
    return analyzed;
  }

  async create(userId: string, taskId: string, input: CreateCommentInput) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        projectId: true,
        watchers: { select: { userId: true } },
      },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    await this.access.getContext(userId, task.projectId);

    const analyzed = this.analyze(input.body);
    let parentId: string | null = null;
    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.taskComment.findFirst({
        where: { id: input.parentId, taskId, deletedAt: null },
        select: { id: true, parentId: true, authorId: true },
      });
      if (!parent) throw new DomainError('NOT_FOUND', 404, 'Parent comment not found');
      parentId = parent.parentId ?? parent.id;
      parentAuthorId = parent.authorId;
    }

    const members = analyzed.mentions.length
      ? await this.prisma.projectMember.findMany({
          where: { projectId: task.projectId, userId: { in: analyzed.mentions } },
          select: { userId: true },
        })
      : [];
    const mentionIds = members.map((member) => member.userId);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: {
          taskId,
          authorId: userId,
          parentId,
          body: input.body as Prisma.InputJsonValue,
          bodyText: analyzed.text,
          mentions: mentionIds,
        },
        include: this.include,
      });
      await tx.taskWatcher.upsert({
        where: { taskId_userId: { taskId, userId } },
        update: {},
        create: { taskId, userId },
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId,
        type: 'COMMENT_CREATED',
        payload: {
          taskId,
          commentId: created.id,
          parentId,
          excerpt: analyzed.text.slice(0, 120),
        },
      });
      return created;
    });

    const targets = new Map<string, 'MENTION' | 'COMMENT_REPLY' | 'TASK_COMMENTED'>();
    for (const mentionId of mentionIds) {
      if (mentionId !== userId) targets.set(mentionId, 'MENTION');
    }
    if (parentAuthorId && parentAuthorId !== userId && !targets.has(parentAuthorId)) {
      targets.set(parentAuthorId, 'COMMENT_REPLY');
    }
    if (task.assigneeId && task.assigneeId !== userId && !targets.has(task.assigneeId)) {
      targets.set(task.assigneeId, 'TASK_COMMENTED');
    }
    for (const watcher of task.watchers) {
      if (watcher.userId !== userId && !targets.has(watcher.userId)) {
        targets.set(watcher.userId, 'TASK_COMMENTED');
      }
    }
    const payload = {
      projectId: task.projectId,
      taskId,
      taskTitle: task.title,
      commentId: comment.id,
      parentId,
      commentAuthorName: comment.author.name,
      excerpt: analyzed.text.slice(0, 120),
    };
    await this.notifications.createMany(
      [...targets.entries()].map(([targetId, type]) => ({
        userId: targetId,
        type,
        payload,
      })),
    );
    return this.serialize(comment, userId);
  }

  private async findForModify(commentId: string) {
    const comment = await this.prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, projectId: true, title: true, deletedAt: true } },
        ...this.include,
      },
    });
    if (!comment || comment.deletedAt || comment.task.deletedAt) {
      throw new DomainError('NOT_FOUND', 404, 'Comment not found');
    }
    return comment;
  }

  async update(userId: string, commentId: string, input: UpdateCommentInput) {
    const comment = await this.findForModify(commentId);
    const access = await this.access.getContext(userId, comment.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    if (comment.authorId !== userId) {
      throw new DomainError('FORBIDDEN', 403, 'Only the author can edit this comment');
    }
    const analyzed = this.analyze(input.body);
    const members = analyzed.mentions.length
      ? await this.prisma.projectMember.findMany({
          where: { projectId: comment.task.projectId, userId: { in: analyzed.mentions } },
          select: { userId: true },
        })
      : [];
    const mentionIds = members.map((member) => member.userId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.taskComment.update({
        where: { id: commentId },
        data: {
          body: input.body as Prisma.InputJsonValue,
          bodyText: analyzed.text,
          mentions: mentionIds,
        },
        include: this.include,
      });
      await this.activities.record(tx, {
        projectId: comment.task.projectId,
        actorId: userId,
        taskId: comment.taskId,
        type: 'COMMENT_UPDATED',
        payload: { taskId: comment.taskId, commentId },
      });
      return result;
    });
    return this.serialize(updated, userId);
  }

  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.findForModify(commentId);
    const access = await this.access.getContext(userId, comment.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    const canModerate = access.permissions.includes('comment:moderate');
    if (comment.authorId !== userId && !canModerate) {
      throw new DomainError('FORBIDDEN', 403, 'Cannot delete this comment');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.taskComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
      await this.activities.record(tx, {
        projectId: comment.task.projectId,
        actorId: userId,
        taskId: comment.taskId,
        type: 'COMMENT_DELETED',
        payload: { taskId: comment.taskId, commentId, excerpt: comment.bodyText.slice(0, 120) },
      });
    });
  }

  private async commentForReaction(commentId: string, userId: string) {
    const comment = await this.prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, projectId: true, title: true, deletedAt: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!comment || comment.deletedAt || comment.task.deletedAt) {
      throw new DomainError('NOT_FOUND', 404, 'Comment not found');
    }
    const access = await this.access.getContext(userId, comment.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    return comment;
  }

  private async reactionsFor(commentId: string, viewerId: string) {
    const reactions = await this.prisma.commentReaction.findMany({
      where: { commentId },
      select: { emoji: true, userId: true, user: { select: { name: true } } },
    });
    return REACTION_EMOJIS.flatMap((emoji) => {
      const rows = reactions.filter((reaction) => reaction.emoji === emoji);
      if (rows.length === 0) return [];
      return [
        {
          emoji,
          count: rows.length,
          reactedByMe: rows.some((row) => row.userId === viewerId),
          userNames: rows.map((row) => row.user.name),
        },
      ];
    });
  }

  async addReaction(userId: string, commentId: string, emoji: string) {
    const comment = await this.commentForReaction(commentId, userId);
    await this.prisma.commentReaction.upsert({
      where: { commentId_userId_emoji: { commentId, userId, emoji } },
      update: {},
      create: { commentId, userId, emoji },
    });
    if (comment.authorId !== userId) {
      await this.notifications.create({
        userId: comment.authorId,
        type: 'COMMENT_REACTION',
        payload: {
          projectId: comment.task.projectId,
          taskId: comment.task.id,
          taskTitle: comment.task.title,
          commentId,
          emoji,
          reactorName:
            (
              await this.prisma.user.findUnique({
                where: { id: userId },
                select: { name: true },
              })
            )?.name ?? '成员',
        },
        dedupeKey: `reaction:${commentId}:${userId}:${emoji}`,
      });
    }
    return { reactions: await this.reactionsFor(commentId, userId) };
  }

  async removeReaction(userId: string, commentId: string, emoji: string) {
    await this.commentForReaction(commentId, userId);
    await this.prisma.commentReaction.deleteMany({ where: { commentId, userId, emoji } });
    return { reactions: await this.reactionsFor(commentId, userId) };
  }
}
