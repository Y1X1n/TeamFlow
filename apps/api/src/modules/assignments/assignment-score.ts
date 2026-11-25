import type { ProjectRole } from '@teamflow/shared/enums';

/**
 * Pure rule-based scoring for task assignee suggestions.
 *
 * score = round(100 * (0.4 * skill + 0.3 * load + 0.2 * due + 0.1 * history))
 * - skill: matched task labels / labels; 0.5 neutral when the task has no labels
 * - load: 1 - openTasks / maxOpenTasks, then overdue * 0.08 is subtracted (clamped to 0)
 * - due: 0.7 when the task has no due date; 0.85 when due is more than 3 days away;
 *        otherwise 0.9 minus load penalties (overdue * 0.1 + open tasks * 0.04, max 5 open)
 * - history: min(completed tasks sharing a label / 5, 1)
 *
 * The result is deterministic for a given `now`, candidate set and task.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AssignmentCandidateInput {
  userId: string;
  name: string;
  role: ProjectRole;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
  completedSameLabelCount: number;
}

export interface AssignmentScoreContext {
  labels: string[];
  maxOpenTaskCount: number;
  dueDate: Date | null;
  now: Date;
}

export interface SkillMatchResult {
  matches: string[];
  ratio: number;
}

export interface ScoredAssignmentCandidate {
  userId: string;
  name: string;
  role: ProjectRole;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
  score: number;
  skillMatches: string[];
  reasons: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Matches task labels against member skills.
 * Labels and skills are trimmed and lowercased; a pair matches on equality or
 * bidirectional substring containment ("前端" matches "前端开发" and vice versa).
 * When the task has no labels the ratio is neutral (0.5) so skill does not
 * dominate the ranking.
 */
export function matchSkills(labels: string[], skills: string[]): SkillMatchResult {
  const normalizedSkills = [...new Set(skills.map(normalize).filter((skill) => skill.length > 0))];
  const seen = new Set<string>();
  const uniqueLabels: string[] = [];
  for (const label of labels) {
    const normalized = normalize(label);
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueLabels.push(label.trim());
  }
  if (uniqueLabels.length === 0) return { matches: [], ratio: 0.5 };

  const matches = uniqueLabels.filter((label) => {
    const normalizedLabel = label.toLowerCase();
    return normalizedSkills.some(
      (skill) =>
        normalizedLabel === skill ||
        normalizedLabel.includes(skill) ||
        skill.includes(normalizedLabel),
    );
  });
  return { matches, ratio: matches.length / uniqueLabels.length };
}

function dueScore(
  context: AssignmentScoreContext,
  openTaskCount: number,
  overdueTaskCount: number,
): number {
  if (!context.dueDate) return 0.7;
  const daysUntilDue = (context.dueDate.getTime() - context.now.getTime()) / DAY_MS;
  if (daysUntilDue > 3) return 0.85;
  const penalty = overdueTaskCount * 0.1 + Math.min(openTaskCount, 5) * 0.04;
  return clamp(0.9 - penalty, 0, 1);
}

export function compareScoredCandidates(
  a: ScoredAssignmentCandidate,
  b: ScoredAssignmentCandidate,
): number {
  return (
    b.score - a.score ||
    a.name.localeCompare(b.name, 'zh-CN') ||
    a.userId.localeCompare(b.userId)
  );
}

export function scoreCandidates(
  context: AssignmentScoreContext,
  candidates: AssignmentCandidateInput[],
): ScoredAssignmentCandidate[] {
  const maxOpenTaskCount = Math.max(0, context.maxOpenTaskCount);
  const scored = candidates.map((candidate) => {
    const openTaskCount = Math.max(0, candidate.openTaskCount);
    const overdueTaskCount = Math.max(0, candidate.overdueTaskCount);
    const historyCount = Math.max(0, candidate.completedSameLabelCount);

    const skill = matchSkills(context.labels, candidate.skills);
    const baseLoad = maxOpenTaskCount > 0 ? 1 - openTaskCount / maxOpenTaskCount : 1;
    const load = clamp(baseLoad - overdueTaskCount * 0.08, 0, 1);
    const due = dueScore(context, openTaskCount, overdueTaskCount);
    const history = Math.min(historyCount / 5, 1);
    const score = clamp(
      Math.round(100 * (0.4 * skill.ratio + 0.3 * load + 0.2 * due + 0.1 * history)),
      0,
      100,
    );

    const reasons: string[] = [];
    if (skill.matches.length > 0) {
      reasons.push(`技能匹配：${skill.matches.join('、')}`);
    } else if (context.labels.length > 0) {
      reasons.push('未匹配任务标签，可作为备选');
    }
    reasons.push(
      openTaskCount === 0 ? '当前没有进行中的任务' : `当前进行中 ${openTaskCount} 个任务`,
    );
    if (overdueTaskCount > 0) {
      reasons.push(`有 ${overdueTaskCount} 个逾期任务，需关注排期`);
    }
    if (historyCount > 0) {
      reasons.push(`完成过 ${historyCount} 个同标签任务`);
    }

    return {
      userId: candidate.userId,
      name: candidate.name,
      role: candidate.role,
      skills: [...candidate.skills],
      openTaskCount,
      overdueTaskCount,
      score,
      skillMatches: skill.matches,
      reasons,
    };
  });

  return scored.sort(compareScoredCandidates);
}