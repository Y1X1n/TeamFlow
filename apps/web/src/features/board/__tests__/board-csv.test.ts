import { describe, expect, it } from 'vitest';
import type { BoardColumn, TaskCard } from '@/lib/types';
import { buildBoardCsv, buildBoardCsvFilename, escapeCsvCell } from '../board-csv';

function makeTask(overrides: Partial<TaskCard> & Pick<TaskCard, 'id'>): TaskCard {
  const { id, ...rest } = overrides;
  return {
    id,
    projectId: 'project-1',
    columnId: 'column-1',
    title: '任务',
    priority: 'MEDIUM',
    assignee: null,
    dueDate: null,
    estimateMinutes: null,
    actualMinutes: null,
    recurrence: 'NONE',
    labels: [],
    position: 'a0',
    completedAt: null,
    commentCount: 0,
    attachmentCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    blockedByCount: 0,
    blockingCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...rest,
  };
}

const columns: BoardColumn[] = [
  {
    id: 'column-1',
    projectId: 'project-1',
    name: '待办',
    position: 'a0',
    isDone: false,
    taskCount: 0,
  },
];

const members = new Map([['u1', { name: 'Alice' }]]);

describe('escapeCsvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvCell('普通')).toBe('普通');
    expect(escapeCsvCell('包含,逗号')).toBe('"包含,逗号"');
    expect(escapeCsvCell('说"好"')).toBe('"说""好"""');
    expect(escapeCsvCell('第一行\n第二行')).toBe('"第一行\n第二行"');
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+8613800000000')).toBe("'+8613800000000");
    expect(escapeCsvCell('-修复登录')).toBe("'-修复登录");
    expect(escapeCsvCell('@all')).toBe("'@all");
  });
});

describe('buildBoardCsv', () => {
  it('exports filtered task fields with BOM and CRLF', () => {
    const csv = buildBoardCsv(
      [
        makeTask({
          id: 't1',
          title: '完成,登录页',
          assignee: { userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' },
          priority: 'HIGH',
          estimateMinutes: 90,
          actualMinutes: 75,
          labels: ['前端', '紧急'],
        }),
      ],
      columns,
      members,
    );

    expect(csv.startsWith('\uFEFF任务标题,看板列,负责人,优先级,截止时间,预计工时,实际工时,标签,状态,更新时间\r\n')).toBe(
      true,
    );
    expect(csv).toContain('"完成,登录页",待办,Alice,高,,1.5 小时,1.25 小时,前端、紧急,未完成,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('buildBoardCsvFilename', () => {
  it('uses the export date in Asia/Shanghai', () => {
    expect(buildBoardCsvFilename(new Date('2026-11-26T12:00:00.000Z'))).toBe(
      'teamflow-board-2026-11-26.csv',
    );
    expect(buildBoardCsvFilename(new Date('2026-11-26T16:30:00.000Z'))).toBe(
      'teamflow-board-2026-11-27.csv',
    );
  });
});
