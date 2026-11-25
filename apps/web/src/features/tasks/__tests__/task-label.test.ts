import { describe, expect, it } from 'vitest';
import { LABEL_COLOR_CLASSES, labelColorClass } from '../task-label';

const PALETTE_CLASS_PATTERN = /^border-[a-z]+-200 bg-[a-z]+-50 text-[a-z]+-700$/;

describe('labelColorClass', () => {
  it('keeps the same color for the same label', () => {
    expect(labelColorClass('bug')).toBe(labelColorClass('bug'));
    expect(labelColorClass('前端')).toBe(labelColorClass('前端'));
  });

  it('maps a known label to a palette class', () => {
    expect(LABEL_COLOR_CLASSES).toHaveLength(8);
    expect(LABEL_COLOR_CLASSES).toContain(labelColorClass('bug'));
    expect(LABEL_COLOR_CLASSES).toContain(labelColorClass('前端'));
  });

  it('returns valid palette classes for different labels', () => {
    for (const label of ['bug', 'feature', '设计', 'backend', 'ops', 'docs']) {
      const colorClass = labelColorClass(label);
      expect(LABEL_COLOR_CLASSES).toContain(colorClass);
      expect(colorClass).toMatch(PALETTE_CLASS_PATTERN);
    }
  });

  it('trims surrounding whitespace before hashing', () => {
    expect(labelColorClass(' bug ')).toBe(labelColorClass('bug'));
  });

  it('falls back to a default class for empty or whitespace labels', () => {
    expect(() => labelColorClass('')).not.toThrow();
    expect(labelColorClass('')).toBe(labelColorClass('   '));
    expect(labelColorClass('')).toMatch(/^border-.* bg-.* text-.*$/);
  });
});
