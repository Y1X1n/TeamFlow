'use client';

import Link from 'next/link';
import { Loader2, Search, Settings2, Wifi, WifiOff } from 'lucide-react';
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
  members: MemberSummary[];
  totalCount: number;
  filteredCount: number;
  canManageColumns: boolean;
  projectId: string;
  connectionStatus: BoardConnectionStatus;
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
  members,
  totalCount,
  filteredCount,
  canManageColumns,
  projectId,
  connectionStatus,
}: BoardToolbarProps) {
  const hasFilters =
    search.trim().length > 0 ||
    assigneeFilter !== 'all' ||
    priorityFilter !== 'all' ||
    dueFilter !== 'all';

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
          className="h-8 pl-8"
        />
      </div>

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

      <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {hasFilters
            ? `筛选 ${filteredCount} / 共 ${totalCount} 个任务`
            : `共 ${totalCount} 个任务`}
        </span>
        <ConnectionStatusPill status={connectionStatus} />
        {canManageColumns ? (
          <Button asChild variant="outline" size="sm" className={cn('h-8')}>
            <Link href={`/projects/${projectId}/settings`}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              管理看板列
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
