import { describe, expect, it } from 'vitest';
import type { BoardColumn, TaskCard } from '@/lib/types';
import {
  buildProjectIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatIcsTimestamp,
  monthMatrix,
  nextDateKey,
  partitionDayChips,
  shanghaiDateKey,
  tasksByDate,
} from '../calendar-utils';

function makeTask(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'task-1',
    projectId: 'project-1',
    columnId: 'column-1',
    title: '示例任务',
    priority: 'MEDIUM',
    assignee: null,
    dueDate: '2026-11-26T00:00:00.000Z',
    estimateMinutes: null,
    actualMinutes: null,
    recurrence: 'NONE',
    labels: [],
    position: 'a',
    completedAt: null,
    commentCount: 0,
    attachmentCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    blockedByCount: 0,
    blockingCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const COLUMNS: BoardColumn[] = [
  {
    id: 'column-1',
    projectId: 'project-1',
    name: '进行中',
    position: 'a',
    isDone: false,
    taskCount: 0,
  },
];

/** 按 RFC 5545 把折叠行还原为逻辑行，便于断言内容。 */
function unfoldIcs(ics: string): string {
  const unfolded: string[] = [];
  for (const line of ics.split('\r\n')) {
    if (line.startsWith(' ') && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded.join('\r\n');
}

describe('calendar-utils', () => {
  describe('shanghaiDateKey', () => {
    it('resolves UTC instants near midnight in Asia/Shanghai', () => {
      expect(shanghaiDateKey('2026-11-25T16:30:00.000Z')).toBe('2026-11-26');
      expect(shanghaiDateKey('2026-11-25T15:59:59.000Z')).toBe('2026-11-25');
      expect(shanghaiDateKey(new Date('2026-11-25T16:30:00.000Z'))).toBe('2026-11-26');
    });

    it('keeps date-only values on the same calendar day', () => {
      expect(shanghaiDateKey('2026-11-26')).toBe('2026-11-26');
    });

    it('zero-pads years below 1000', () => {
      expect(shanghaiDateKey(new Date(Date.UTC(999, 0, 2, 4)))).toBe('0999-01-02');
    });

    it('returns an empty key for invalid input', () => {
      expect(shanghaiDateKey('not-a-date')).toBe('');
    });
  });

  describe('monthMatrix', () => {
    it('builds 42 Monday-first cells with adjacent-month days', () => {
      const cells = monthMatrix(2026, 11, new Date('2026-11-10T00:00:00.000Z'));

      expect(cells).toHaveLength(42);
      expect(cells[0]?.dateKey).toBe('2026-10-26');
      expect(cells[0]?.inCurrentMonth).toBe(false);
      expect(cells[6]?.dateKey).toBe('2026-11-01');
      expect(cells[6]?.dayNumber).toBe(1);
      expect(cells[6]?.inCurrentMonth).toBe(true);
      expect(cells[41]?.dateKey).toBe('2026-12-06');
      expect(cells.filter((cell) => cell.inCurrentMonth)).toHaveLength(30);
      expect(cells.filter((cell) => cell.isToday)).toHaveLength(1);
      expect(cells.find((cell) => cell.isToday)?.dateKey).toBe('2026-11-10');
    });

    it('handles year boundaries', () => {
      const january = monthMatrix(2026, 1, new Date('2026-01-15T00:00:00.000Z'));
      expect(january[0]?.dateKey).toBe('2025-12-29');
      expect(january[3]?.dateKey).toBe('2026-01-01');
      expect(january[41]?.dateKey).toBe('2026-02-08');

      const december = monthMatrix(2026, 12, new Date('2026-12-15T00:00:00.000Z'));
      expect(december[0]?.dateKey).toBe('2026-11-30');
      expect(december[1]?.dateKey).toBe('2026-12-01');
      expect(december[41]?.dateKey).toBe('2027-01-10');
    });
  });

  describe('tasksByDate', () => {
    it('groups tasks by Shanghai due date and ignores null due dates', () => {
      const lateUtc = makeTask({ id: 'late', dueDate: '2026-11-25T16:30:00.000Z' });
      const earlyUtc = makeTask({ id: 'early', dueDate: '2026-11-25T15:00:00.000Z' });
      const noDueDate = makeTask({ id: 'none', dueDate: null });
      const invalid = makeTask({ id: 'invalid', dueDate: 'not-a-date' });

      const grouped = tasksByDate([lateUtc, earlyUtc, noDueDate, invalid]);

      expect([...grouped.keys()].sort()).toEqual(['2026-11-25', '2026-11-26']);
      expect(grouped.get('2026-11-26')?.map((task) => task.id)).toEqual(['late']);
      expect(grouped.get('2026-11-25')?.map((task) => task.id)).toEqual(['early']);
    });
  });

  describe('partitionDayChips', () => {
    it('shows up to three chips when there is no overflow', () => {
      const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' }), makeTask({ id: '3' })];
      expect(partitionDayChips(tasks)).toEqual({ visible: tasks, hiddenCount: 0 });
    });

    it('reserves a fixed slot for +N when more than three tasks land on a day', () => {
      const tasks = [
        makeTask({ id: '1' }),
        makeTask({ id: '2' }),
        makeTask({ id: '3' }),
        makeTask({ id: '4' }),
        makeTask({ id: '5' }),
      ];
      const result = partitionDayChips(tasks);
      expect(result.visible.map((task) => task.id)).toEqual(['1', '2']);
      expect(result.hiddenCount).toBe(3);
    });

    it('handles empty days', () => {
      expect(partitionDayChips([])).toEqual({ visible: [], hiddenCount: 0 });
    });
  });

  describe('ICS helpers', () => {
    it('formats and increments date keys', () => {
      expect(formatIcsDate('2026-11-26')).toBe('20261126');
      expect(formatIcsDate('bad')).toBe('');
      expect(nextDateKey('2026-12-31')).toBe('2027-01-01');
      expect(nextDateKey('2026-02-28')).toBe('2026-03-01');
      expect(nextDateKey('bad')).toBe('');
    });

    it('formats UTC timestamps for DTSTAMP', () => {
      expect(formatIcsTimestamp(new Date('2026-11-26T01:02:03.000Z'))).toBe('20261126T010203Z');
    });

    it('escapes backslashes, commas, semicolons and newlines', () => {
      expect(escapeIcsText('反斜杠\\逗号,分号;换行\n结束')).toBe(
        '反斜杠\\\\逗号\\,分号\\;换行\\n结束',
      );
    });

    it('folds long lines at 75 octets with space continuations', () => {
      const folded = foldIcsLine(`SUMMARY:${'a'.repeat(80)}`);
      const parts = folded.split('\r\n');

      expect(parts).toHaveLength(2);
      expect(Buffer.byteLength(parts[0] ?? '', 'utf8')).toBe(75);
      expect(parts[1]?.startsWith(' ')).toBe(true);
      const reassembled = parts.map((part, index) => (index === 0 ? part : part.slice(1))).join('');
      expect(reassembled).toBe(`SUMMARY:${'a'.repeat(80)}`);
    });

    it('never splits multi-byte characters when folding', () => {
      const folded = foldIcsLine(`SUMMARY:${'任'.repeat(30)}`);
      const parts = folded.split('\r\n');

      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) {
        expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
        expect(part).not.toContain('\uFFFD');
      }
      const reassembled = parts.map((part, index) => (index === 0 ? part : part.slice(1))).join('');
      expect(reassembled).toBe(`SUMMARY:${'任'.repeat(30)}`);
    });
  });

  describe('buildProjectIcs', () => {
    it('creates all-day events with next-day DTEND and status', () => {
      const ics = buildProjectIcs({
        projectName: 'Alpha 项目',
        tasks: [
          makeTask({ id: 'open-task', title: '未完成任务' }),
          makeTask({
            id: 'done-task',
            title: '已完成任务',
            completedAt: '2026-11-25T09:00:00.000Z',
          }),
        ],
        columns: COLUMNS,
        now: new Date('2026-11-26T01:02:03.000Z'),
      });

      expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
      expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//TeamFlow//Project Calendar//ZH');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:teamflow-task-open-task@teamflow');
      expect(ics).toContain('UID:teamflow-task-done-task@teamflow');
      expect(ics).toContain('DTSTAMP:20261126T010203Z');
      expect(ics).toContain('DTSTART;VALUE=DATE:20261126');
      expect(ics).toContain('DTEND;VALUE=DATE:20261127');
      expect(ics).toContain('STATUS:CONFIRMED');
      expect(ics).not.toContain('STATUS:COMPLETED');
      expect(ics).not.toContain('METHOD:');
      expect(unfoldIcs(ics)).toContain(
        'DESCRIPTION:项目：Alpha 项目\\n优先级：中\\n负责人：未指派\\n列：进行中\\n状态：未完成',
      );
      expect(unfoldIcs(ics)).toContain('状态：已完成');
    });

    it('uses CRLF line endings only', () => {
      const ics = buildProjectIcs({
        projectName: 'Alpha',
        tasks: [makeTask()],
        columns: COLUMNS,
        now: new Date('2026-11-26T01:02:03.000Z'),
      });

      expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    it('escapes special characters in event text', () => {
      const ics = buildProjectIcs({
        projectName: 'Alpha',
        tasks: [makeTask({ title: '标题,含;分号\\和\n换行' })],
        columns: COLUMNS,
        now: new Date('2026-11-26T01:02:03.000Z'),
      });

      expect(ics).toContain('SUMMARY:标题\\,含\\;分号\\\\和\\n换行');
    });

    it('folds long lines without exceeding 75 octets', () => {
      const ics = buildProjectIcs({
        projectName: 'Alpha',
        tasks: [makeTask({ title: '超长任务标题'.repeat(20) })],
        columns: COLUMNS,
        now: new Date('2026-11-26T01:02:03.000Z'),
      });
      const lines = ics.split('\r\n');
      const summaryIndex = lines.findIndex((line) => line.startsWith('SUMMARY:'));

      expect(summaryIndex).toBeGreaterThanOrEqual(0);
      let assembled = lines[summaryIndex] ?? '';
      let index = summaryIndex + 1;
      while (index < lines.length && (lines[index] ?? '').startsWith(' ')) {
        assembled += (lines[index] ?? '').slice(1);
        index += 1;
      }
      expect(assembled).toBe(`SUMMARY:${'超长任务标题'.repeat(20)}`);
      expect(lines.some((line) => line.startsWith(' '))).toBe(true);
      for (const line of lines) {
        expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
      }
    });

    it('skips tasks without a usable due date', () => {
      const ics = buildProjectIcs({
        projectName: 'Alpha',
        tasks: [makeTask({ id: 'no-due', dueDate: null })],
        columns: COLUMNS,
        now: new Date('2026-11-26T01:02:03.000Z'),
      });

      expect(ics).not.toContain('BEGIN:VEVENT');
      expect(ics).not.toContain('teamflow-task-no-due');
    });
  });
});
