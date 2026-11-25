import { Injectable, Logger } from '@nestjs/common';
import { resolvePermissions } from '@teamflow/shared/permissions';
import type { TaskPriority } from '@teamflow/shared/enums';
import type { Prisma } from '@prisma/client';
import type { PreviewReportEmailInput, SendReportEmailInput } from '@teamflow/shared/schemas';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { AiService } from '../ai/ai.service';
import { AgentMailService } from '../mail/agent-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  formatDate,
  parseWeekStart,
  previousWeekStart,
  shanghaiWeekStart,
  weekBounds,
} from './week';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

type WeekTaskRecord = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    priority: true;
    columnId: true;
    assigneeId: true;
    dueDate: true;
    completedAt: true;
    createdAt: true;
    assignee: { select: { name: true } };
    column: { select: { name: true; isDone: true } };
    blockedByDependencies: { select: { blockedBy: { select: { title: true } } } };
  };
}>;

interface WeekTaskRef {
  taskId: string;
  title: string;
  columnName: string;
  assigneeName: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  blockedByCount: number;
  blockedByTitles: string[];
  reason?: string;
}

interface WeekMetrics extends Record<string, number> {
  createdTasks: number;
  completedTasks: number;
  activeTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  comments: number;
  activeMembers: number;
  totalTasks: number;
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  metrics: WeekMetrics;
  summary: string;
  activeMemberDetails: Array<{ userId: string; name: string; actions: number }>;
  completionByMember: Array<{ userId: string; name: string; completed: number }>;
  highlightTasks: Array<{ taskId: string; title: string; completedAt: string | null }>;
  completedTaskList: WeekTaskRef[];
  openTaskList: WeekTaskRef[];
  riskTaskList: WeekTaskRef[];
  upcomingTaskList: WeekTaskRef[];
}

function dueValue(task: WeekTaskRecord): number {
  return task.dueDate ? task.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortPlan(left: WeekTaskRecord, right: WeekTaskRecord): number {
  return (
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    dueValue(left) - dueValue(right) ||
    left.createdAt.getTime() - right.createdAt.getTime()
  );
}

function taskRef(task: WeekTaskRecord, reason?: string): WeekTaskRef {
  return {
    taskId: task.id,
    title: task.title,
    columnName: task.column.name,
    assigneeName: task.assignee?.name ?? null,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    blockedByCount: task.blockedByDependencies.length,
    blockedByTitles: task.blockedByDependencies
      .slice(0, 3)
      .map((dependency) => dependency.blockedBy.title),
    ...(reason ? { reason } : {}),
  };
}

function buildSummary(input: {
  metrics: WeekMetrics;
  completion: Array<{ name: string; completed: number }>;
  risks: WeekTaskRef[];
  open: WeekTaskRecord[];
}): string {
  const { metrics, completion, risks, open } = input;
  const parts = [
    `本周新增 ${metrics.createdTasks} 个任务，完成 ${metrics.completedTasks} 个；当前 ${metrics.activeTasks} 个待推进，其中 ${metrics.overdueTasks} 个逾期、${metrics.blockedTasks} 个被依赖阻塞。`,
  ];
  if (metrics.activeMembers > 0) {
    parts.push(`共有 ${metrics.activeMembers} 位成员参与协作，新增评论 ${metrics.comments} 条。`);
  }
  const leader = completion[0];
  if (leader) {
    parts.push(`完成最多的是 ${leader.name}（${leader.completed} 项）。`);
  }
  if (risks.length > 0) {
    const names = risks
      .slice(0, 3)
      .map((task) => `「${task.title}」`)
      .join('、');
    parts.push(`建议优先关注${names}${risks.length > 3 ? ` 等 ${risks.length} 个风险任务` : ''}。`);
  } else {
    parts.push('当前没有逾期或被依赖阻塞的任务。');
  }
  const next = open.filter((task) => !risks.some((risk) => risk.taskId === task.id)).slice(0, 3);
  if (next.length > 0) {
    parts.push(`接下来建议优先推进${next.map((task) => `「${task.title}」`).join('、')}。`);
  }
  return parts.join('');
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiService,
    private readonly agentMail: AgentMailService,
  ) {}

  private serialize(report: {
    id: string;
    projectId: string;
    weekStart: Date;
    weekEnd: Date;
    data: Prisma.JsonValue;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: report.id,
      projectId: report.projectId,
      weekStart: formatDate(report.weekStart),
      weekEnd: formatDate(report.weekEnd),
      data: report.data,
      createdById: report.createdById,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private async collectWeek(
    project: { id: string; name: string; color: string },
    weekStart: Date,
    live: boolean,
  ): Promise<WeekData> {
    const { start, endExclusive, endDate } = weekBounds(weekStart);
    const range = { gte: start, lt: endExclusive };
    const now = new Date();
    const referenceNow = live ? now : endExclusive;
    const upcomingEnd = new Date(referenceNow.getTime() + 7 * DAY_MS);

    const [tasks, comments, activityGroups] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        select: {
          id: true,
          title: true,
          priority: true,
          columnId: true,
          assigneeId: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
          assignee: { select: { name: true } },
          column: { select: { name: true, isDone: true } },
          blockedByDependencies: {
            where: { blockedBy: { deletedAt: null, completedAt: null } },
            select: { blockedBy: { select: { title: true } } },
          },
        },
      }),
      this.prisma.taskComment.count({
        where: { deletedAt: null, createdAt: range, task: { projectId: project.id } },
      }),
      this.prisma.activity.groupBy({
        by: ['actorId'],
        where: { projectId: project.id, createdAt: range, actorId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const actorIds = activityGroups
      .map((group) => group.actorId)
      .filter((id): id is string => Boolean(id));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));
    const activeMembers = activityGroups
      .map((group) => ({
        userId: group.actorId as string,
        name: actorName.get(group.actorId as string) ?? '未知成员',
        actions: group._count._all,
      }))
      .sort((a, b) => b.actions - a.actions);

    const completedInWeek = tasks
      .filter(
        (task) =>
          task.completedAt &&
          task.completedAt.getTime() >= start.getTime() &&
          task.completedAt.getTime() < endExclusive.getTime(),
      )
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    const openTasks = tasks.filter((task) => !task.completedAt);
    const overdueTasks = openTasks.filter(
      (task) => task.dueDate && task.dueDate.getTime() < referenceNow.getTime(),
    );
    const blockedTasks = openTasks.filter((task) => task.blockedByDependencies.length > 0);
    const upcomingTasks = openTasks
      .filter(
        (task) =>
          task.dueDate &&
          task.dueDate.getTime() >= referenceNow.getTime() &&
          task.dueDate.getTime() < upcomingEnd.getTime(),
      )
      .sort((a, b) => dueValue(a) - dueValue(b));

    const riskMap = new Map<string, { task: WeekTaskRecord; reasons: string[] }>();
    for (const task of overdueTasks) {
      riskMap.set(task.id, { task, reasons: ['逾期'] });
    }
    for (const task of blockedTasks) {
      const entry = riskMap.get(task.id) ?? { task, reasons: [] };
      entry.reasons.push('依赖阻塞');
      riskMap.set(task.id, entry);
    }
    const risks = [...riskMap.values()].sort(
      (left, right) =>
        right.reasons.length - left.reasons.length || dueValue(left.task) - dueValue(right.task),
    );

    const completionMap = new Map<string, { userId: string; name: string; completed: number }>();
    for (const task of completedInWeek) {
      if (!task.assigneeId) continue;
      const entry = completionMap.get(task.assigneeId) ?? {
        userId: task.assigneeId,
        name: task.assignee?.name ?? '未知成员',
        completed: 0,
      };
      entry.completed += 1;
      completionMap.set(task.assigneeId, entry);
    }
    const completion = [...completionMap.values()].sort((a, b) => b.completed - a.completed);

    const metrics: WeekMetrics = {
      createdTasks: tasks.filter(
        (task) =>
          task.createdAt.getTime() >= start.getTime() &&
          task.createdAt.getTime() < endExclusive.getTime(),
      ).length,
      completedTasks: completedInWeek.length,
      activeTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
      comments,
      activeMembers: activeMembers.length,
      totalTasks: tasks.length,
    };
    const riskRefs = risks.map((entry) => taskRef(entry.task, entry.reasons.join('、')));
    const summary = buildSummary({
      metrics,
      completion,
      risks: riskRefs,
      open: [...openTasks].sort(sortPlan),
    });

    return {
      weekStart: formatDate(weekStart),
      weekEnd: formatDate(endDate),
      generatedAt: now.toISOString(),
      metrics,
      summary,
      activeMemberDetails: activeMembers.slice(0, 10),
      completionByMember: completion,
      highlightTasks: completedInWeek.slice(0, 5).map((task) => ({
        taskId: task.id,
        title: task.title,
        completedAt: task.completedAt?.toISOString() ?? null,
      })),
      completedTaskList: completedInWeek.slice(0, 10).map((task) => taskRef(task)),
      openTaskList: [...openTasks]
        .sort(sortPlan)
        .slice(0, 10)
        .map((task) => taskRef(task)),
      riskTaskList: riskRefs.slice(0, 10),
      upcomingTaskList: upcomingTasks.slice(0, 10).map((task) => taskRef(task)),
    };
  }

  async current(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, color: true, archivedAt: true },
    });
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');
    const data = await this.collectWeek(project, shanghaiWeekStart(), true);
    return {
      project: {
        id: project.id,
        name: project.name,
        color: project.color,
        archived: project.archivedAt !== null,
      },
      ...data,
    };
  }

  async generateWeekly(projectId: string, weekStart: Date, createdById: string | null) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');
    if (project.archivedAt) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');

    const data = await this.collectWeek(project, weekStart, false);
    const { endDate } = weekBounds(weekStart);
    const json = data as unknown as Prisma.InputJsonValue;

    const report = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.weeklyReport.findUnique({
        where: { projectId_weekStart: { projectId, weekStart } },
      });
      const saved = existing
        ? await tx.weeklyReport.update({
            where: { id: existing.id },
            data: {
              weekEnd: endDate,
              data: json,
              createdById: createdById ?? existing.createdById,
            },
          })
        : await tx.weeklyReport.create({
            data: { projectId, weekStart, weekEnd: endDate, data: json, createdById },
          });
      await this.activities.record(tx, {
        projectId,
        actorId: createdById,
        type: 'REPORT_GENERATED',
        payload: { reportId: saved.id, weekStart: formatDate(weekStart) },
      });
      return saved;
    });

    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true, permissionOverrides: true },
    });
    await this.notifications.createMany(
      memberships
        .filter((member) =>
          resolvePermissions(member.role, member.permissionOverrides as never).includes(
            'report:view',
          ),
        )
        .map((member) => ({
          userId: member.userId,
          type: 'WEEKLY_REPORT' as const,
          payload: {
            projectId,
            projectName: project.name,
            reportId: report.id,
            weekStart: data.weekStart,
            weekEnd: data.weekEnd,
            metrics: data.metrics,
          },
          dedupeKey: `weekly:${report.id}:${member.userId}`,
        })),
    );

    return this.serialize(report);
  }

  async generateManual(projectId: string, input: { weekStart?: string }, userId: string) {
    let weekStart: Date;
    if (input.weekStart) {
      try {
        weekStart = parseWeekStart(input.weekStart);
      } catch (error) {
        throw new DomainError('VALIDATION_ERROR', 400, (error as Error).message);
      }
    } else {
      weekStart = previousWeekStart();
    }
    return this.generateWeekly(projectId, weekStart, userId);
  }

  async list(projectId: string, limit: number) {
    const reports = await this.prisma.weeklyReport.findMany({
      where: { projectId },
      orderBy: { weekStart: 'desc' },
      take: limit,
    });
    return { items: reports.map((report) => this.serialize(report)) };
  }

  async get(reportId: string) {
    const report = await this.prisma.weeklyReport.findUnique({ where: { id: reportId } });
    if (!report) throw new DomainError('NOT_FOUND', 404, 'Report not found');
    return this.serialize(report);
  }

  async emailStatus() {
    return this.agentMail.status();
  }

  async previewEmail(projectId: string, input: PreviewReportEmailInput) {
    const summary = await this.current(projectId);
    if (summary.project.archived) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }
    const [mail, email] = await Promise.all([
      this.agentMail.status(),
      this.ai.composeWeeklyEmail({
        projectName: summary.project.name,
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        summary: summary.summary,
        metrics: summary.metrics,
        completed: summary.completedTaskList.map(
          (task) => `${task.title}（${task.assigneeName ?? '未指派'}）`,
        ),
        open: summary.openTaskList.map(
          (task) => `${task.title}（${task.assigneeName ?? '未指派'}）`,
        ),
        risks: summary.riskTaskList.map((task) => `${task.title}（${task.reason ?? '需关注'}）`),
        upcoming: summary.upcomingTaskList.map(
          (task) => `${task.title}（截止 ${task.dueDate?.slice(0, 10) ?? '未设置'}）`,
        ),
        note: input.note,
        tone: input.tone,
      }),
    ]);
    return {
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
      recipients: input.recipients,
      subject: email.subject,
      body: email.body,
      source: email.source,
      model: email.model ?? null,
      notice: email.notice ?? null,
      sender: mail.sender,
      emailAvailable: mail.available,
      emailReason: mail.reason ?? null,
    };
  }

  async sendEmail(projectId: string, userId: string, input: SendReportEmailInput) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');
    if (project.archivedAt) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');

    const result = await this.agentMail.send({
      recipients: input.recipients,
      subject: input.subject,
      body: input.body,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.activities.record(tx, {
          projectId,
          actorId: userId,
          type: 'REPORT_EMAIL_SENT',
          payload: {
            projectId,
            subject: input.subject,
            recipientCount: input.recipients.length,
            sender: result.sender,
          },
        });
      });
    } catch (error) {
      // The mail has already left the server; do not turn an audit failure into a
      // retryable error that could cause a duplicate send.
      this.logger.warn(`Report email audit failed: ${(error as Error).message}`);
    }
    return {
      sent: true,
      messageId: result.messageId,
      sender: result.sender,
      recipients: result.recipients,
      sentAt: new Date().toISOString(),
    };
  }
}
