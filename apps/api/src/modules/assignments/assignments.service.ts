import { Injectable } from '@nestjs/common';
import type { AssignSuggestionsInput } from '@teamflow/shared/schemas';
import { analyzeRichText } from '@teamflow/shared/richtext';
import type { ProjectRole } from '@teamflow/shared/enums';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  compareScoredCandidates,
  matchSkills,
  scoreCandidates,
  type AssignmentCandidateInput,
  type AssignmentScoreContext,
  type ScoredAssignmentCandidate,
} from './assignment-score';

const DEFAULT_LIMIT = 3;
const AI_RANK_BONUSES = [12, 8, 5, 2] as const;
const AI_NOTICE = '建议由 AI 生成，请确认后指派。';
const LOCAL_NOTICE = '未配置 AI 或 AI 暂不可用，已使用本地规则排序。';

export interface AssignSuggestionCandidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
  score: number;
  skillMatches: string[];
  reasons: string[];
}

export interface AssignSuggestionsResult {
  task: { id: string; title: string };
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
  costNotice: string | null;
  candidates: AssignSuggestionCandidate[];
}

interface CandidateMeta {
  avatarUrl: string | null;
  role: ProjectRole;
}

function mergeReasons(base: string[], aiReason: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const reason of [`AI 建议：${aiReason}`, ...base]) {
    const cleaned = reason.trim().slice(0, 80);
    if (cleaned.length === 0 || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= 5) break;
  }
  return result;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async suggest(
    _actorId: string,
    taskId: string,
    input: AssignSuggestionsInput,
  ): Promise<AssignSuggestionsResult> {
    const now = new Date();
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        labels: true,
        projectId: true,
        assigneeId: true,
        dueDate: true,
        column: { select: { isDone: true } },
        project: { select: { name: true } },
      },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');

    const aiStatus = this.ai.status();
    const costNotice = aiStatus.costNotice;
    const limit = input.limit ?? DEFAULT_LIMIT;

    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: { not: 'VIEWER' } },
      select: {
        role: true,
        skills: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ joinedAt: 'asc' }],
    });

    const candidateMeta = new Map<string, CandidateMeta>();
    for (const membership of memberships) {
      candidateMeta.set(membership.user.id, {
        avatarUrl: membership.user.avatarUrl,
        role: membership.role,
      });
    }
    const candidateIds = [...candidateMeta.keys()];

    if (candidateIds.length === 0) {
      return {
        task: { id: task.id, title: task.title },
        source: 'local',
        model: null,
        notice: `项目「${task.project.name}」中没有可指派的成员（VIEWER 不参与推荐）。`,
        costNotice,
        candidates: [],
      };
    }

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

    const historyCounts = new Map<string, number>();
    if (task.labels.length > 0) {
      const completed = await this.prisma.task.findMany({
        where: {
          projectId: task.projectId,
          deletedAt: null,
          completedAt: { not: null },
          assigneeId: { in: candidateIds },
          labels: { hasSome: task.labels },
          id: { not: task.id },
        },
        select: { assigneeId: true, labels: true },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: 500,
      });
      for (const row of completed) {
        if (!row.assigneeId) continue;
        historyCounts.set(row.assigneeId, (historyCounts.get(row.assigneeId) ?? 0) + 1);
      }
    }

    const candidateInputs: AssignmentCandidateInput[] = memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      role: membership.role,
      skills: membership.skills,
      openTaskCount: openTaskCounts.get(membership.user.id) ?? 0,
      overdueTaskCount: overdueTaskCounts.get(membership.user.id) ?? 0,
      completedSameLabelCount: historyCounts.get(membership.user.id) ?? 0,
    }));
    const maxOpenTaskCount = candidateInputs.reduce(
      (max, candidate) => Math.max(max, candidate.openTaskCount),
      0,
    );
    const context: AssignmentScoreContext = {
      labels: task.labels,
      maxOpenTaskCount,
      dueDate: task.dueDate,
      now,
    };

    let source: 'ai' | 'local' = 'local';
    let model: string | null = null;
    let notice: string | null = LOCAL_NOTICE;
    let ranked: ScoredAssignmentCandidate[] = scoreCandidates(context, candidateInputs);

    if (input.useAi !== false) {
      const descriptionText = task.description ? analyzeRichText(task.description).text : '';
      const aiResult = await this.ai.rankAssignees({
        taskTitle: task.title,
        taskDescription: descriptionText.trim() || null,
        labels: task.labels,
        candidates: candidateInputs.map((candidate) => ({
          userId: candidate.userId,
          name: candidate.name,
          role: candidate.role,
          skills: candidate.skills,
          openTaskCount: candidate.openTaskCount,
          overdueTaskCount: candidate.overdueTaskCount,
        })),
      });
      const validRanking = aiResult
        ? aiResult.ranking.filter((entry) => candidateMeta.has(entry.userId))
        : [];
      if (aiResult && validRanking.length > 0) {
        source = 'ai';
        model = aiStatus.model ?? null;
        notice = AI_NOTICE;
        const bonuses = new Map<string, { bonus: number; reason: string }>();
        for (const [index, entry] of validRanking.entries()) {
          if (bonuses.has(entry.userId)) continue;
          bonuses.set(entry.userId, {
            bonus: AI_RANK_BONUSES[index] ?? 0,
            reason: entry.reason,
          });
        }
        ranked = ranked
          .map((candidate) => {
            const skillMatch = matchSkills(
              [...task.labels, ...aiResult.requiredSkills],
              candidate.skills,
            );
            const aiEntry = bonuses.get(candidate.userId);
            if (!aiEntry) {
              return { ...candidate, skillMatches: skillMatch.matches };
            }
            return {
              ...candidate,
              score: Math.min(100, Math.round(candidate.score + aiEntry.bonus)),
              skillMatches: skillMatch.matches,
              reasons: mergeReasons(candidate.reasons, aiEntry.reason),
            };
          })
          .sort(compareScoredCandidates);
      }
    }

    const candidates: AssignSuggestionCandidate[] = ranked.slice(0, limit).map((candidate) => {
      const meta = candidateMeta.get(candidate.userId);
      return {
        userId: candidate.userId,
        name: candidate.name,
        avatarUrl: meta?.avatarUrl ?? null,
        role: meta?.role ?? candidate.role,
        skills: candidate.skills,
        openTaskCount: candidate.openTaskCount,
        overdueTaskCount: candidate.overdueTaskCount,
        score: candidate.score,
        skillMatches: candidate.skillMatches,
        reasons: candidate.reasons,
      };
    });

    return {
      task: { id: task.id, title: task.title },
      source,
      model,
      notice,
      costNotice,
      candidates,
    };
  }
}