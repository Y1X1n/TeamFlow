import { describe, expect, it } from 'vitest';
import { MEMBER_SKILL_MAX_LENGTH, MEMBER_SKILLS_MAX } from '@teamflow/shared/enums';
import {
  isPresetSkill,
  normalizeSkills,
  skillsChanged,
  toggleSkill,
  validateNewSkill,
} from '../member-skills';

describe('normalizeSkills', () => {
  it('trims, drops empty values and removes case-insensitive duplicates', () => {
    expect(normalizeSkills([' 前端 ', '', 'React', 'react', '后端'])).toEqual([
      '前端',
      'React',
      '后端',
    ]);
  });

  it('caps the list at the shared maximum', () => {
    const input = Array.from({ length: MEMBER_SKILLS_MAX + 2 }, (_, index) => `技能${index}`);
    expect(normalizeSkills(input)).toHaveLength(MEMBER_SKILLS_MAX);
  });

  it('handles missing values', () => {
    expect(normalizeSkills(undefined)).toEqual([]);
    expect(normalizeSkills(null)).toEqual([]);
  });
});

describe('validateNewSkill', () => {
  it('returns a trimmed skill for valid input', () => {
    expect(validateNewSkill('  运营  ', ['前端'])).toEqual({ skill: '运营', error: null });
  });

  it('rejects newlines', () => {
    expect(validateNewSkill('前端\n后端', [])).toEqual({
      skill: null,
      error: '职能标签不能包含换行',
    });
  });

  it('rejects values longer than the shared maximum length', () => {
    const long = 'a'.repeat(MEMBER_SKILL_MAX_LENGTH + 1);
    expect(validateNewSkill(long, [])).toEqual({
      skill: null,
      error: `职能标签不能超过 ${MEMBER_SKILL_MAX_LENGTH} 个字符`,
    });
  });

  it('rejects duplicates regardless of case', () => {
    expect(validateNewSkill('react', ['React'])).toEqual({
      skill: null,
      error: '职能标签「react」已存在',
    });
  });

  it('rejects additions beyond the maximum', () => {
    const current = Array.from({ length: MEMBER_SKILLS_MAX }, (_, index) => `技能${index}`);
    expect(validateNewSkill('额外', current)).toEqual({
      skill: null,
      error: `最多添加 ${MEMBER_SKILLS_MAX} 个职能标签`,
    });
  });

  it('ignores empty input without an error', () => {
    expect(validateNewSkill('   ', [])).toEqual({ skill: null, error: null });
  });
});

describe('toggleSkill', () => {
  it('adds a new skill', () => {
    expect(toggleSkill(['前端'], '测试')).toEqual({ skills: ['前端', '测试'], error: null });
  });

  it('removes an existing skill', () => {
    expect(toggleSkill(['前端', '测试'], '前端')).toEqual({ skills: ['测试'], error: null });
  });

  it('reports an error when the maximum is reached', () => {
    const current = Array.from({ length: MEMBER_SKILLS_MAX }, (_, index) => `技能${index}`);
    expect(toggleSkill(current, '额外')).toEqual({
      skills: current,
      error: `最多添加 ${MEMBER_SKILLS_MAX} 个职能标签`,
    });
  });
});

describe('skillsChanged', () => {
  it('compares order and content', () => {
    expect(skillsChanged(['前端'], ['前端'])).toBe(false);
    expect(skillsChanged(['前端', '后端'], ['后端', '前端'])).toBe(true);
    expect(skillsChanged([], ['前端'])).toBe(true);
  });
});

describe('isPresetSkill', () => {
  it('detects preset values and custom values', () => {
    expect(isPresetSkill('前端')).toBe(true);
    expect(isPresetSkill('自定义')).toBe(false);
  });
});
