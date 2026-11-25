import { Injectable } from '@nestjs/common';
import type { AiPlanInput } from '@teamflow/shared/schemas';
import { analyzeRichText } from '@teamflow/shared/richtext';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import type { TaskPlanMember, TaskPlanResult } from './task-plan';

function compareMembers(left: TaskPlanMember, right: TaskPlanMember): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.userId !== right.userId) return left.userId < right.userId ? -1 : 1;
  return 0;
}

@Injectable()
export class TaskPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Generates plan suggestions only. No task, dependency or assignment rows are written; the
   * client previews and applies the steps through the existing task endpoints.
   */
  async generate(taskId: string, _actorId: string, input: AiPlanInput): Promise<TaskPlanResult> {
    const now = new Date();
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        labels: true,
        projectId: true,
        columnId: true,
        assigneeId: true,
        dueDate: true,
        project: { select: { name: true } },
      },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');

    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: { not: 'VIEWER' } },
      select: {
        role: true,
        skills: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const [openRows, overdueRows] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          projectId: task.projectId,
          deletedAt: null,
          completedAt: null,
          assigneeId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          projectId: task.projectId,
          deletedAt: null,
          completedAt: null,
          assigneeId: { not: null },
          dueDate: { lt: now },
        },
        _count: { _all: true },
      }),
    ]);

    const openTaskCounts = new Map<string, number>();
    for (const row of openRows) {
      if (row.assigneeId) openTaskCounts.set(row.assigneeId, row._count._all);
    }
    const overdueTaskCounts = new Map<string, number>();
    for (const row of overdueRows) {
      if (row.assigneeId) overdueTaskCounts.set(row.assigneeId, row._count._all);
    }

    const members: TaskPlanMember[] = memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      role: membership.role,
      skills: membership.skills,
      openTaskCount: openTaskCounts.get(membership.user.id) ?? 0,
      overdueTaskCount: overdueTaskCounts.get(membership.user.id) ?? 0,
    }));
    members.sort(compareMembers);

    const description = task.description ? analyzeRichText(task.description).text.trim() : '';
    const result = await this.ai.generatePlan({
      taskTitle: task.title,
      taskDescription: description.length > 0 ? description : null,
      taskLabels: task.labels,
      projectName: task.project.name,
      members,
      useAi: members.length === 0 ? false : input.useAi,
    });

    return {
      steps: result.steps,
      source: result.source,
      model: result.model ?? null,
      notice: result.notice ?? null,
    };
  }
}
