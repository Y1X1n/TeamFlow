'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/ui/avatar';
import { avatarColor, cn, formatDateTime, isOverdue } from '@/lib/utils';
import type { BoardColumn, MemberSummary, TaskCard } from '@/lib/types';
import { PriorityBadge } from '@/features/tasks/priority-badge';
import { TaskLabelBadge } from '@/features/tasks/task-label';
import { formatEstimateMinutes } from '@/features/tasks/task-utils';
import {
  defaultListSortDirection,
  sortBoardListTasks,
} from './board-list-utils';
import type { BoardListSortDirection, BoardListSortKey } from './board-list-utils';

interface BoardListViewProps {
  tasks: TaskCard[];
  columns: BoardColumn[];
  membersById: Map<string, MemberSummary>;
  selectionMode: boolean;
  selectionDisabled?: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (taskId: string, selected: boolean) => void;
  onOpenTask: (taskId: string) => void;
}

const SORTABLE_COLUMNS: Array<{
  key: BoardListSortKey;
  label: string;
  className?: string;
}> = [
  { key: 'priority', label: '优先级', className: 'w-24' },
  { key: 'dueDate', label: '截止时间', className: 'w-36' },
];

export function BoardListView({
  tasks,
  columns,
  membersById,
  selectionMode,
  selectionDisabled,
  selectedIds,
  onToggleSelected,
  onOpenTask,
}: BoardListViewProps) {
  const [sortKey, setSortKey] = useState<BoardListSortKey>('position');
  const [sortDirection, setSortDirection] = useState<BoardListSortDirection>('asc');

  const columnNames = useMemo(
    () => new Map(columns.map((column) => [column.id, column.name])),
    [columns],
  );
  const sortedTasks = useMemo(
    () => sortBoardListTasks(tasks, columns, sortKey, sortDirection),
    [tasks, columns, sortKey, sortDirection],
  );

  const toggleSort = (key: BoardListSortKey) => {
    if (key === sortKey) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(defaultListSortDirection(key));
  };

  const sortIcon = (key: BoardListSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden="true" />
    );
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <caption className="sr-only">任务列表视图，按当前搜索和筛选结果展示</caption>
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr className="border-b">
            {selectionMode ? (
              <th scope="col" className="w-10 px-3 py-2 text-left">
                <span className="sr-only">选择</span>
              </th>
            ) : null}
            <th
              scope="col"
              className="px-3 py-2 text-left font-medium"
              aria-sort={
                sortKey === 'position'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="按看板顺序排序"
                onClick={() => toggleSort('position')}
              >
                任务
                {sortIcon('position')}
              </button>
            </th>
            <th scope="col" className="w-28 px-3 py-2 text-left font-medium">
              看板列
            </th>
            <th scope="col" className="w-36 px-3 py-2 text-left font-medium">
              负责人
            </th>
            {SORTABLE_COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-3 py-2 text-left font-medium', column.className)}
                aria-sort={
                  sortKey === column.key
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`按${column.label}排序`}
                  onClick={() => toggleSort(column.key)}
                >
                  {column.label}
                  {sortIcon(column.key)}
                </button>
              </th>
            ))}
            <th scope="col" className="w-24 px-3 py-2 text-left font-medium">
              工时
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              标签
            </th>
            <th
              scope="col"
              className="w-36 px-3 py-2 text-left font-medium"
              aria-sort={
                sortKey === 'updatedAt'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="按更新时间排序"
                onClick={() => toggleSort('updatedAt')}
              >
                更新时间
                {sortIcon('updatedAt')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.length === 0 ? (
            <tr>
              <td
                colSpan={selectionMode ? 9 : 8}
                className="px-4 py-12 text-center text-sm text-muted-foreground"
              >
                当前筛选下没有任务
              </td>
            </tr>
          ) : (
            sortedTasks.map((task) => {
              const estimate = formatEstimateMinutes(task.estimateMinutes);
              const overdue = isOverdue(task.dueDate, task.completedAt);
              const assignee = task.assignee
                ? (membersById.get(task.assignee.userId) ?? task.assignee)
                : null;
              const labels = task.labels.slice(0, 2);
              return (
                <tr key={task.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  {selectionMode ? (
                    <td className="px-3 py-2 align-top">
                      <Checkbox
                        checked={selectedIds.has(task.id)}
                        onCheckedChange={(checked) =>
                          onToggleSelected(task.id, checked === true)
                        }
                        disabled={selectionDisabled}
                        aria-label={`选择任务：${task.title}`}
                      />
                    </td>
                  ) : null}
                  <td className="max-w-[360px] px-3 py-2 align-top">
                    <button
                      type="button"
                      className={cn(
                        'block max-w-full truncate text-left font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        task.completedAt && 'text-muted-foreground line-through',
                      )}
                      title={task.title}
                      aria-label={`打开任务：${task.title}`}
                      onClick={() => onOpenTask(task.id)}
                    >
                      {task.title}
                    </button>
                    {task.blockedByCount > 0 ? (
                      <span className="mt-1 inline-flex text-[11px] text-amber-700">
                        阻塞 {task.blockedByCount}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {columnNames.get(task.columnId) ?? '—'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {assignee ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <UserAvatar
                          name={assignee.name}
                          src={assignee.avatarUrl}
                          color={avatarColor(assignee.userId)}
                          className="h-5 w-5 text-[10px]"
                        />
                        <span className="truncate">{assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">未指派</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {task.dueDate ? (
                      <span className={cn('whitespace-nowrap', overdue && 'text-destructive')}>
                        {formatDateTime(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {estimate ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {labels.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {labels.map((label) => (
                          <TaskLabelBadge key={label} label={label} />
                        ))}
                        {task.labels.length > labels.length ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{task.labels.length - labels.length}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                    {formatDateTime(task.updatedAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
