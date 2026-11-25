import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  initialPositions,
  isValidPosition,
  positionBetween,
} from '../fractional';

describe('fractional index', () => {
  it('creates ordered initial positions', () => {
    const positions = initialPositions(3);
    expect(positions).toHaveLength(3);
    for (const position of positions) {
      expect(position).toHaveLength(12);
      expect(isValidPosition(position)).toBe(true);
    }
    expect(comparePositions(positions[0]!, positions[1]!)).toBe(-1);
    expect(comparePositions(positions[1]!, positions[2]!)).toBe(-1);
  });

  it('inserts between, before and after', () => {
    const [first, second] = initialPositions(2) as [string, string];
    const before = positionBetween(null, first);
    const middle = positionBetween(first, second);
    const after = positionBetween(second, null);
    expect(before < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < second).toBe(true);
    expect(second < after).toBe(true);
  });

  it('keeps generating strictly increasing values at the same gap', () => {
    const [first, second] = initialPositions(2) as [string, string];
    let prev = first;
    const seen = new Set<string>([first]);
    for (let i = 0; i < 60; i += 1) {
      const next = positionBetween(prev, second);
      expect(prev < next).toBe(true);
      expect(next < second).toBe(true);
      expect(seen.has(next)).toBe(false);
      seen.add(next);
      prev = next;
    }
  });

  it('rejects invalid input', () => {
    expect(() => positionBetween('!!', null)).toThrow();
    expect(() => positionBetween('z', 'a')).toThrow();
    expect(isValidPosition('')).toBe(false);
    expect(isValidPosition('a'.repeat(65))).toBe(false);
  });
});
