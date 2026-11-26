import { describe, expect, it } from 'vitest';
import { createTaskSchema, updateTaskSchema } from '../schemas';

describe('task estimate schema', () => {
  it('accepts 15-minute increments within the range', () => {
    expect(createTaskSchema.parse({ title: '任务', estimateMinutes: 15 }).estimateMinutes).toBe(15);
    expect(
      createTaskSchema.parse({ title: '任务', estimateMinutes: 10080 }).estimateMinutes,
    ).toBe(10080);
    expect(createTaskSchema.parse({ title: '任务', estimateMinutes: null }).estimateMinutes).toBe(
      null,
    );
    expect(createTaskSchema.parse({ title: '任务', actualMinutes: 90 }).actualMinutes).toBe(90);
  });

  it('rejects values outside the range or not on a 15-minute boundary', () => {
    expect(createTaskSchema.safeParse({ title: '任务', estimateMinutes: 14 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: '任务', estimateMinutes: 10081 }).success).toBe(
      false,
    );
    expect(createTaskSchema.safeParse({ title: '任务', estimateMinutes: 17 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: '任务', actualMinutes: 17 }).success).toBe(false);
  });

  it('allows clearing an estimate through the update schema', () => {
    expect(updateTaskSchema.parse({ estimateMinutes: null })).toEqual({ estimateMinutes: null });
    expect(updateTaskSchema.parse({ actualMinutes: null })).toEqual({ actualMinutes: null });
    expect(updateTaskSchema.safeParse({ estimateMinutes: 0 }).success).toBe(false);
  });
});
