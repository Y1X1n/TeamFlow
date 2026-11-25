import {
  MEMBER_SKILL_MAX_LENGTH,
  MEMBER_SKILL_PRESETS,
  MEMBER_SKILLS_MAX,
} from '@teamflow/shared/enums';

export interface SkillValidation {
  skill: string | null;
  error: string | null;
}

export interface SkillToggleResult {
  skills: string[];
  error: string | null;
}

export function isPresetSkill(skill: string): boolean {
  return (MEMBER_SKILL_PRESETS as readonly string[]).includes(skill);
}

export function normalizeSkills(skills: readonly string[] | null | undefined): string[] {
  const normalized: string[] = [];
  for (const raw of skills ?? []) {
    const skill = raw.trim();
    if (!skill) continue;
    if (normalized.some((item) => item.toLowerCase() === skill.toLowerCase())) continue;
    normalized.push(skill);
    if (normalized.length >= MEMBER_SKILLS_MAX) break;
  }
  return normalized;
}

export function validateNewSkill(raw: string, current: readonly string[]): SkillValidation {
  if (/[\r\n]/.test(raw)) {
    return { skill: null, error: '职能标签不能包含换行' };
  }
  const skill = raw.trim();
  if (!skill) return { skill: null, error: null };
  if (skill.length > MEMBER_SKILL_MAX_LENGTH) {
    return {
      skill: null,
      error: `职能标签不能超过 ${MEMBER_SKILL_MAX_LENGTH} 个字符`,
    };
  }
  if (current.length >= MEMBER_SKILLS_MAX) {
    return { skill: null, error: `最多添加 ${MEMBER_SKILLS_MAX} 个职能标签` };
  }
  if (current.some((item) => item.toLowerCase() === skill.toLowerCase())) {
    return { skill: null, error: `职能标签「${skill}」已存在` };
  }
  return { skill, error: null };
}

export function toggleSkill(current: readonly string[], skill: string): SkillToggleResult {
  const trimmed = skill.trim();
  if (!trimmed) return { skills: [...current], error: null };
  const existing = current.some((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    return {
      skills: current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      error: null,
    };
  }
  if (current.length >= MEMBER_SKILLS_MAX) {
    return { skills: [...current], error: `最多添加 ${MEMBER_SKILLS_MAX} 个职能标签` };
  }
  return { skills: [...current, trimmed], error: null };
}

export function skillsChanged(current: readonly string[], initial: readonly string[]): boolean {
  if (current.length !== initial.length) return true;
  return current.some((skill, index) => skill !== initial[index]);
}
