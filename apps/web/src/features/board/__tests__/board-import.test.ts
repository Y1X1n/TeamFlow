import { describe, expect, it } from 'vitest';
import type { BoardColumn, MemberSummary } from '@/lib/types';
import {
  boardImportTemplateCsv,
  buildBoardImportPlan,
  parseCsv,
} from '../board-import';

const columns: BoardColumn[] = [
  {
    id: 'col-todo',
    projectId: 'project-1',
    name: '待办',
    position: 'a0',
    isDone: false,
    taskCount: 0,
  },
];

const members: MemberSummary[] = [
  { userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' },
];

describe('parseCsv', () => {
  it('handles BOM, quotes, commas and newlines', () => {
    const rows = parseCsv('\uFEFF标题,标签\r\n"完成,登录页","前端\n紧急"\r\n');

    expect(rows).toEqual([
      ['标题', '标签'],
      ['完成,登录页', '前端\n紧急'],
    ]);
  });

  it('escapes doubled quotes', () => {
    expect(parseCsv('标题\n"说""好"""')).toEqual([['标题'], ['说"好"']]);
  });

  it('drops completely empty rows', () => {
    expect(parseCsv('标题\n\n任务\n')).toEqual([['标题'], ['任务']]);
  });
});

describe('buildBoardImportPlan', () => {
  it('maps a valid export-compatible row', () => {
    const csv = [
      '任务标题,看板列,负责人,优先级,截止时间,预计工时,标签',
      '实现登录,待办,Alice,高,2026-12-01 18:00,2,前端、紧急',
    ].join('\n');

    const plan = buildBoardImportPlan(csv, columns, members, 'col-todo');

    expect(plan.globalErrors).toEqual([]);
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0]).toMatchObject({
      title: '实现登录',
      columnId: 'col-todo',
      assigneeId: 'u1',
      priority: 'HIGH',
      dueDate: '2026-12-01T18:00:00+08:00',
      estimateMinutes: 120,
      labels: ['前端', '紧急'],
      errors: [],
    });
  });

  it('falls back to the default column when the column cell is empty', () => {
    const plan = buildBoardImportPlan('任务标题\n无列任务', columns, members, 'col-todo');

    expect(plan.validRows[0]).toMatchObject({ columnId: 'col-todo', columnName: '待办' });
  });

  it('reports per-row validation errors without dropping valid rows', () => {
    const csv = [
      '任务标题,看板列,负责人,优先级,截止时间,预计工时,标签',
      '正常任务,待办,Alice,中,,,',
      ',待办,Alice,中,,,',
      '错误列任务,不存在的列,Alice,中,,,',
      '错误负责人,待办,Nobody,中,,,',
      '错误优先级,待办,Alice,超高,,,',
      '错误日期,待办,Alice,中,不是日期,,',
      '错误工时,待办,Alice,中,,0.3,',
      '标签太多,待办,Alice,中,,,a、b、c、d、e、f',
    ].join('\n');

    const plan = buildBoardImportPlan(csv, columns, members, 'col-todo');

    expect(plan.validRows.map((row) => row.title)).toEqual(['正常任务']);
    expect(plan.rows.filter((row) => row.errors.length > 0)).toHaveLength(7);
    expect(plan.rows[1]?.errors).toContain('任务标题不能为空');
    expect(plan.rows[2]?.errors.join()).toContain('看板列「不存在的列」不存在');
    expect(plan.rows[3]?.errors.join()).toContain('负责人「Nobody」不是项目成员');
    expect(plan.rows[4]?.errors.join()).toContain('优先级需为');
    expect(plan.rows[5]?.errors).toContain('截止时间格式无法识别');
    expect(plan.rows[6]?.errors).toContain('预计工时需为 0.25–168 小时');
    expect(plan.rows[7]?.errors).toContain('标签最多 5 个');
  });

  it('rejects impossible calendar dates instead of silently accepting them', () => {
    const csv = ['任务标题,截止时间', '非法日期,2026-13-45', '非法小时,2026-12-01 25:00'].join('\n');

    const plan = buildBoardImportPlan(csv, columns, members, 'col-todo');

    expect(plan.validRows).toHaveLength(0);
    expect(plan.rows[0]?.errors).toContain('截止时间格式无法识别');
    expect(plan.rows[1]?.errors).toContain('截止时间格式无法识别');
  });

  it('rejects a file without a title column', () => {
    const plan = buildBoardImportPlan('看板列,负责人\n待办,Alice', columns, members, 'col-todo');

    expect(plan.globalErrors).toEqual(['缺少「任务标题」列']);
  });

  it('round-trips the downloadable template', () => {
    const plan = buildBoardImportPlan(boardImportTemplateCsv(), columns, members, 'col-todo');

    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0]?.title).toBe('完成登录页联调');
  });
});
