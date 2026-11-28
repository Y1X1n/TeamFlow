import { Injectable, Logger } from '@nestjs/common';
import { resolvePermissions } from '@teamflow/shared/permissions';
import type { ProjectRole, TaskPriority } from '@teamflow/shared/enums';
import type { Prisma } from '@prisma/client';
import type {
  PeriodReportNarrativeInput,
  PeriodReportQuery,
  PreviewReportEmailInput,
  SendReportEmailInput,
} from '@teamflow/shared/schemas';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { AiService } from '../ai/ai.service';
import { AgentMailService } from '../mail/agent-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../permissions/access.service';
import {
  formatDate,
  parseWeekStart,
  periodBounds,
  previousWeekStart,
  shanghaiWeekStart,
  weekBounds,
  type PeriodBounds,
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

export interface WeekTaskRef {
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

export interface WeekMetrics extends Record<string, number> {
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

export type ReportPeriod = 'daily' | 'weekly';
export type ReportScope = 'team' | 'member';

export interface PeriodMemberStats {
  userId: string;
  name: string;
  role: ProjectRole;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
}

interface PeriodAssignee {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  skills: string[];
}

export interface PeriodReportResult {
  project: { id: string; name: string; color: string; archived: boolean };
  period: ReportPeriod;
  scope: ReportScope;
  startDate: string;
  endDate: string;
  generatedAt: string;
  assignee: PeriodAssignee | null;
  metrics: WeekMetrics;
  summary: string;
  memberStats?: PeriodMemberStats[];
  unassignedOpenTaskCount?: number;
  activeMemberDetails: Array<{ userId: string; name: string; actions: number }>;
  completionByMember: Array<{ userId: string; name: string; completed: number }>;
  highlightTasks: Array<{ taskId: string; title: string; completedAt: string | null }>;
  completedTaskList: WeekTaskRef[];
  openTaskList: WeekTaskRef[];
  riskTaskList: WeekTaskRef[];
  upcomingTaskList: WeekTaskRef[];
}

export interface PeriodReportNarrativeResult {
  narrative: string;
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
  generatedAt: string;
}

interface PeriodData {
  startDate: string;
  endDate: string;
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
  memberStats?: PeriodMemberStats[];
  unassignedOpenTaskCount?: number;
}

interface PeriodCollectOptions {
  period: ReportPeriod;
  scope: ReportScope;
  referenceNow: Date;
  generatedAt?: Date;
  assigneeId?: string;
  memberName?: string;
  includeMemberStats?: boolean;
}

type PeriodMembershipRecord = Prisma.ProjectMemberGetPayload<{
  select: { userId: true; role: true; user: { select: { name: true } } };
}>;

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

export function buildPeriodSummary(input: {
  period: ReportPeriod;
  scope: ReportScope;
  memberName?: string;
  metrics: WeekMetrics;
  completion: Array<{ name: string; completed: number }>;
  risks: WeekTaskRef[];
  open: WeekTaskRecord[];
}): string {
  const { period, scope, memberName, metrics, completion, risks, open } = input;
  const rangeLabel = period === 'daily' ? '今日' : '本周';
  const parts: string[] = [];
  if (scope === 'member') {
    const member = memberName?.trim() || '该成员';
    parts.push(
      `${rangeLabel}，${member}新增 ${metrics.createdTasks} 个任务，完成 ${metrics.completedTasks} 个；当前负责 ${metrics.activeTasks} 个待推进任务，其中 ${metrics.overdueTasks} 个逾期、${metrics.blockedTasks} 个被依赖阻塞。`,
    );
    if (metrics.comments > 0) {
      parts.push(`新增评论 ${metrics.comments} 条。`);
    }
  } else {
    parts.push(
      `${rangeLabel}新增 ${metrics.createdTasks} 个任务，完成 ${metrics.completedTasks} 个；当前 ${metrics.activeTasks} 个待推进，其中 ${metrics.overdueTasks} 个逾期、${metrics.blockedTasks} 个被依赖阻塞。`,
    );
    if (metrics.activeMembers > 0) {
      parts.push(`共有 ${metrics.activeMembers} 位成员参与协作，新增评论 ${metrics.comments} 条。`);
    }
    const leader = completion[0];
    if (leader) {
      parts.push(`完成最多的是 ${leader.name}（${leader.completed} 项）。`);
    }
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

function computeMemberStats(
  memberships: PeriodMembershipRecord[],
  tasks: WeekTaskRecord[],
  start: Date,
  endExclusive: Date,
  referenceNow: Date,
): PeriodMemberStats[] {
  const stats = new Map<string, PeriodMemberStats>();
  for (const membership of memberships) {
    stats.set(membership.userId, {
      userId: membership.userId,
      name: membership.user.name,
      role: membership.role,
      openTaskCount: 0,
      overdueTaskCount: 0,
      blockedTaskCount: 0,
      completedTaskCount: 0,
      totalTaskCount: 0,
    });
  }
  for (const task of tasks) {
    if (!task.assigneeId) continue;
    const entry = stats.get(task.assigneeId);
    if (!entry) continue;
    entry.totalTaskCount += 1;
    if (!task.completedAt) {
      entry.openTaskCount += 1;
      if (task.dueDate && task.dueDate.getTime() < referenceNow.getTime()) {
        entry.overdueTaskCount += 1;
      }
      if (task.blockedByDependencies.length > 0) entry.blockedTaskCount += 1;
      continue;
    }
    if (
      task.completedAt.getTime() >= start.getTime() &&
      task.completedAt.getTime() < endExclusive.getTime()
    ) {
      entry.completedTaskCount += 1;
    }
  }
  const result: PeriodMemberStats[] = [];
  for (const membership of memberships) {
    const entry = stats.get(membership.userId);
    if (entry) result.push(entry);
  }
  return result;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
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

  private async collectPeriod(
    project: { id: string; name: string; color: string },
    bounds: PeriodBounds,
    options: PeriodCollectOptions,
  ): Promise<PeriodData> {
    const { start, endExclusive, startDate, endDate } = bounds;
    const range = { gte: start, lt: endExclusive };
    const referenceNow = options.referenceNow;
    const generatedAt = options.generatedAt ?? referenceNow;
    const upcomingEnd = new Date(referenceNow.getTime() + 7 * DAY_MS);
    const assigneeId = options.assigneeId;

    const taskWhere: Prisma.TaskWhereInput = { projectId: project.id, deletedAt: null };
    if (assigneeId) taskWhere.assigneeId = assigneeId;
    const commentWhere: Prisma.TaskCommentWhereInput = {
      deletedAt: null,
      createdAt: range,
      task: { projectId: project.id, deletedAt: null },
    };
    if (assigneeId) commentWhere.authorId = assigneeId;
    const activityWhere: Prisma.ActivityWhereInput = {
      projectId: project.id,
      createdAt: range,
      actorId: assigneeId ?? { not: null },
    };
    const membershipsPromise: Promise<PeriodMembershipRecord[]> = options.includeMemberStats
      ? this.prisma.projectMember.findMany({
          where: { projectId: project.id },
          select: { userId: true, role: true, user: { select: { name: true } } },
          orderBy: { joinedAt: 'asc' },
        })
      : Promise.resolve([]);

    const [tasks, comments, activityGroups, memberships] = await Promise.all([
      this.prisma.task.findMany({
        where: taskWhere,
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
      this.prisma.taskComment.count({ where: commentWhere }),
      this.prisma.activity.groupBy({
        by: ['actorId'],
        where: activityWhere,
        _count: { _all: true },
      }),
      membershipsPromise,
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
    const summaryInput = {
      metrics,
      completion,
      risks: riskRefs,
      open: [...openTasks].sort(sortPlan),
    };
    const summary =
      options.period === 'weekly' && options.scope === 'team'
        ? buildSummary(summaryInput)
        : buildPeriodSummary({
            ...summaryInput,
            period: options.period,
            scope: options.scope,
            memberName: options.memberName,
          });
    const memberStats = options.includeMemberStats
      ? computeMemberStats(memberships, tasks, start, endExclusive, referenceNow)
      : undefined;
    const unassignedOpenTaskCount = options.includeMemberStats
      ? openTasks.filter((task) => !task.assigneeId).length
      : undefined;

    return {
      startDate,
      endDate,
      generatedAt: generatedAt.toISOString(),
      metrics,
      summary,
      ...(memberStats ? { memberStats } : {}),
      ...(unassignedOpenTaskCount !== undefined ? { unassignedOpenTaskCount } : {}),
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

  private async collectWeek(
    project: { id: string; name: string; color: string },
    weekStart: Date,
    live: boolean,
  ): Promise<WeekData> {
    const now = new Date();
    const bounds = weekBounds(weekStart);
    const data = await this.collectPeriod(
      project,
      {
        start: bounds.start,
        endExclusive: bounds.endExclusive,
        startDate: formatDate(weekStart),
        endDate: formatDate(bounds.endDate),
      },
      {
        period: 'weekly',
        scope: 'team',
        referenceNow: live
          ? now
          : new Date(Math.min(now.getTime(), bounds.endExclusive.getTime())),
        generatedAt: now,
      },
    );
    return {
      weekStart: data.startDate,
      weekEnd: data.endDate,
      generatedAt: data.generatedAt,
      metrics: data.metrics,
      summary: data.summary,
      activeMemberDetails: data.activeMemberDetails,
      completionByMember: data.completionByMember,
      highlightTasks: data.highlightTasks,
      completedTaskList: data.completedTaskList,
      openTaskList: data.openTaskList,
      riskTaskList: data.riskTaskList,
      upcomingTaskList: data.upcomingTaskList,
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

  async period(
    projectId: string,
    actorId: string,
    query: PeriodReportQuery,
  ): Promise<PeriodReportResult> {
    const [access, project] = await Promise.all([
      this.access.getContext(actorId, projectId),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, color: true, archivedAt: true },
      }),
    ]);
    if (!project) throw new DomainError('NOT_FOUND', 404, 'Project not found');

    const leader = access.permissions.includes('report:generate');
    const period: ReportPeriod = query.period ?? 'weekly';
    const scope: ReportScope = query.scope ?? (leader ? 'team' : 'member');
    if (scope === 'team') {
      if (!leader) throw new DomainError('FORBIDDEN', 403, 'Missing permission report:generate');
      if (query.userId) {
        throw new DomainError(
          'VALIDATION_ERROR',
          400,
          'userId is only allowed when scope is member',
        );
      }
    }
    const targetUserId = scope === 'member' ? (query.userId ?? actorId) : undefined;
    if (targetUserId !== actorId && !leader) {
      throw new DomainError('FORBIDDEN', 403, 'Missing permission report:generate');
    }

    let assignee: PeriodAssignee | null = null;
    if (targetUserId) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        select: {
          role: true,
          skills: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      if (!member) throw new DomainError('NOT_FOUND', 404, 'Project member not found');
      assignee = {
        userId: member.user.id,
        name: member.user.name,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        skills: member.skills,
      };
    }

    let bounds: PeriodBounds;
    try {
      bounds = periodBounds(period, query.date);
    } catch (error) {
      throw new DomainError(
        'VALIDATION_ERROR',
        400,
        error instanceof Error ? error.message : 'Invalid date',
      );
    }

    const referenceNow = new Date();
    const data = await this.collectPeriod(project, bounds, {
      period,
      scope,
      referenceNow,
      generatedAt: referenceNow,
      assigneeId: targetUserId,
      memberName: assignee?.name,
      includeMemberStats: scope === 'team',
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        color: project.color,
        archived: project.archivedAt !== null,
      },
      period,
      scope,
      startDate: data.startDate,
      endDate: data.endDate,
      generatedAt: data.generatedAt,
      assignee,
      metrics: data.metrics,
      summary: data.summary,
      ...(scope === 'team'
        ? {
            memberStats: data.memberStats ?? [],
            unassignedOpenTaskCount: data.unassignedOpenTaskCount ?? 0,
          }
        : {}),
      activeMemberDetails: data.activeMemberDetails,
      completionByMember: data.completionByMember,
      highlightTasks: data.highlightTasks,
      completedTaskList: data.completedTaskList,
      openTaskList: data.openTaskList,
      riskTaskList: data.riskTaskList,
      upcomingTaskList: data.upcomingTaskList,
    };
  }

  async periodNarrative(
    projectId: string,
    actorId: string,
    input: PeriodReportNarrativeInput,
  ): Promise<PeriodReportNarrativeResult> {
    const report = await this.period(projectId, actorId, {
      period: input.period,
      date: input.date,
      scope: input.scope,
      userId: input.userId,
    });
    const result = await this.ai.composePeriodNarrative({
      projectName: report.project.name,
      period: report.period,
      scope: report.scope,
      startDate: report.startDate,
      endDate: report.endDate,
      memberName: report.assignee?.name,
      summary: report.summary,
      metrics: report.metrics,
      memberStats: report.memberStats?.slice(0, 20).map((member) => ({
        name: member.name,
        role: member.role,
        openTaskCount: member.openTaskCount,
        overdueTaskCount: member.overdueTaskCount,
        blockedTaskCount: member.blockedTaskCount,
        completedTaskCount: member.completedTaskCount,
        totalTaskCount: member.totalTaskCount,
      })),
      unassignedOpenTaskCount: report.unassignedOpenTaskCount,
      completed: report.completedTaskList.map((task) => task.title),
      open: report.openTaskList.map((task) => task.title),
      risks: report.riskTaskList.map((task) => task.title),
      upcoming: report.upcomingTaskList.map((task) => task.title),
      tone: input.tone,
    });
    return {
      narrative: result.narrative,
      source: result.source,
      model: result.model ?? null,
      notice: result.notice ?? null,
      generatedAt: new Date().toISOString(),
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
      const saved = await tx.weeklyReport.upsert({
        where: { projectId_weekStart: { projectId, weekStart } },
        update: {
          weekEnd: endDate,
          data: json,
          ...(createdById ? { createdById } : {}),
        },
        create: { projectId, weekStart, weekEnd: endDate, data: json, createdById },
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
