'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CheckSquare,
  Download,
  Loader2,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MemberSummary } from '@/lib/types';
import { isTaskPriority } from '@/features/tasks/task-utils';
import type { BoardConnectionStatus } from './hooks/use-board-sync';
import type { DueFilter } from './board-utils';
import { BOARD_GROUP_OPTIONS, isBoardGroupBy } from './board-grouping';
import type { BoardGroupBy } from './board-grouping';
import type { BoardViewMode } from './board-list-utils';

const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  all: '全部截止时间',
  overdue: '已逾期',
  today: '今天到期',
  week: '7 天内到期',
  none: '无截止时间',
};

function isDueFilter(value: string): value is DueFilter {
  return value in DUE_FILTER_LABELS;
}

interface BoardToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  priorityFilter: 'all' | TaskPriority;
  onPriorityFilterChange: (value: 'all' | TaskPriority) => void;
  dueFilter: DueFilter;
  onDueFilterChange: (value: DueFilter) => void;
  groupBy: BoardGroupBy;
  onGroupByChange: (value: BoardGroupBy) => void;
  viewMode: BoardViewMode;
  onViewModeChange: (value: BoardViewMode) => void;
  members: MemberSummary[];
  totalCount: number;
  filteredCount: number;
  canManageColumns: boolean;
  projectId: string;
  connectionStatus: BoardConnectionStatus;
  canSelect: boolean;
  selectionMode: boolean;
  onToggleSelection: () => void;
  onExportCsv: () => void;
  exportDisabled: boolean;
  canOpenTrash: boolean;
  onOpenTrash: () => void;
}

function ConnectionStatusPill({ status }: { status: BoardConnectionStatus }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" aria-live="polite">
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        实时已连接
      </span>
    );
  }
  if (status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        连接中…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive" aria-live="polite">
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      实时连接已断开，正在重试（每 10 秒自动刷新）
    </span>
  );
}

export function BoardToolbar({
  search,
  onSearchChange,
  assigneeFilter,
  onAssigneeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  dueFilter,
  onDueFilterChange,
  groupBy,
  onGroupByChange,
  viewMode,
  onViewModeChange,
  members,
  totalCount,
  filteredCount,
  canManageColumns,
  projectId,
  connectionStatus,
  canSelect,
  selectionMode,
  onToggleSelection,
  onExportCsv,
  exportDisabled,
  canOpenTrash,
  onOpenTrash,
}: BoardToolbarProps) {
  const hasFilters =
    search.trim().length > 0 ||
    assigneeFilter !== 'all' ||
    priorityFilter !== 'all' ||
    dueFilter !== 'all';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (assigneeFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (dueFilter !== 'all' ? 1 : 0);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <div className="relative w-full sm:w-56">
        <Label htmlFor="board-search" className="sr-only">
          搜索任务标题
        </Label>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="board-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索任务标题"
          className="h-10 pl-8 sm:h-8"
        />
      </div>

      <Select
        value={viewMode}
        onValueChange={(value) => {
          if (value === 'board' || value === 'list') onViewModeChange(value);
        }}
      >
        <SelectTrigger className="h-10 w-32 sm:h-8 sm:w-28" aria-label="视图切换">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="board">看板</SelectItem>
          <SelectItem value="list">列表</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
        size="sm"
        className="h-10 md:hidden"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((previous) => !previous)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
      </Button>

      <div
        className={cn(
          'flex-wrap items-center gap-2',
          filtersOpen ? 'flex' : 'hidden md:flex',
        )}
      >
      <Select value={assigneeFilter} onValueChange={onAssigneeFilterChange}>
        <SelectTrigger className="h-8 w-36" aria-label="按负责人筛选">
          <SelectValue placeholder="负责人" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部负责人</SelectItem>
          <SelectItem value="unassigned">未指派</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={priorityFilter}
        onValueChange={(value) => {
          if (value === 'all') onPriorityFilterChange('all');
          else if (isTaskPriority(value)) onPriorityFilterChange(value);
        }}
      >
        <SelectTrigger className="h-8 w-32" aria-label="按优先级筛选">
          <SelectValue placeholder="优先级" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部优先级</SelectItem>
          {TASK_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {TASK_PRIORITY_LABELS[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={dueFilter}
        onValueChange={(value) => {
          if (isDueFilter(value)) onDueFilterChange(value);
        }}
      >
        <SelectTrigger className="h-8 w-36" aria-label="按截止时间筛选">
          <SelectValue placeholder="截止时间" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DUE_FILTER_LABELS) as DueFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {DUE_FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {viewMode === 'board' ? (
        <Select
          value={groupBy}
          onValueChange={(value) => {
            if (isBoardGroupBy(value)) onGroupByChange(value);
          }}
        >
          <SelectTrigger className="h-8 w-32" aria-label="任务分组">
            <SelectValue placeholder="分组" />
          </SelectTrigger>
          <SelectContent>
            {BOARD_GROUP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange('');
            onAssigneeFilterChange('all');
            onPriorityFilterChange('all');
            onDueFilterChange('all');
          }}
        >
          重置筛选
        </Button>
      ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 px-2.5 sm:h-8 sm:px-3"
        onClick={onExportCsv}
        disabled={exportDisabled}
        aria-label="导出 CSV"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">导出 CSV</span>
      </Button>

      {canOpenTrash ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 px-2.5 sm:h-8 sm:px-3"
          onClick={onOpenTrash}
          aria-label="回收站"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">回收站</span>
        </Button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {canSelect ? (
          <Button
            type="button"
            variant={selectionMode ? 'secondary' : 'outline'}
            size="sm"
            className="h-10 sm:h-8"
            onClick={onToggleSelection}
          >
            {selectionMode ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {selectionMode ? '退出批量' : '批量选择'}
          </Button>
        ) : null}
        {viewMode === 'board' && groupBy !== 'none' ? (
          <span role="status" aria-live="polite">
            分组视图用于浏览；拖拽排序请切换「不分组」
          </span>
        ) : null}
        <span>
          {hasFilters
            ? `筛选 ${filteredCount} / 共 ${totalCount} 个任务`
            : `共 ${totalCount} 个任务`}
        </span>
        <ConnectionStatusPill status={connectionStatus} />
        {canManageColumns ? (
          <Button asChild variant="outline" size="sm" className="hidden h-8 sm:inline-flex">
            <Link href={`/projects/${projectId}/settings`}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              管理看板列
            </Link>
          </Button>
        ) : null}
      </div>

      {selectionMode ? (
        <div role="status" className="w-full text-xs text-muted-foreground">
          {viewMode === 'list'
            ? '批量模式：勾选任务后可批量改负责人/优先级/完成'
            : '批量模式：勾选任务后可批量改负责人/优先级/完成；拖拽已暂停'}
        </div>
      ) : null}
    </div>
  );
}
