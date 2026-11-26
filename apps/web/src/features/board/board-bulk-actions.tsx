'use client';

import { useState } from 'react';
import { CheckCircle2, Tag, Trash2 } from 'lucide-react';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BoardColumn, MemberSummary } from '@/lib/types';
import { isTaskPriority } from '@/features/tasks/task-utils';

interface BoardBulkActionsProps {
  selectedCount: number;
  members: MemberSummary[];
  columns: BoardColumn[];
  canAssign: boolean;
  canUpdate: boolean;
  canMove: boolean;
  canDelete: boolean;
  doneColumnName: string | null;
  pending: boolean;
  onAssign: (assigneeId: string | null) => void;
  onPriority: (priority: TaskPriority) => void;
  onMove: (columnId: string, columnName: string) => void;
  onAddLabel: (label: string) => void;
  onComplete: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BoardBulkActions({
  selectedCount,
  members,
  columns,
  canAssign,
  canUpdate,
  canMove,
  canDelete,
  doneColumnName,
  pending,
  onAssign,
  onPriority,
  onMove,
  onAddLabel,
  onComplete,
  onDelete,
  onClearSelection,
}: BoardBulkActionsProps) {
  const [assigneeValue, setAssigneeValue] = useState('');
  const [priorityValue, setPriorityValue] = useState('');
  const [moveValue, setMoveValue] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  const submitLabel = () => {
    const label = labelDraft.trim();
    if (!label) return;
    setLabelDraft('');
    onAddLabel(label);
  };

  return (
    <div
      role="region"
      aria-label="批量操作"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"
    >
      <span role="status" aria-live="polite" className="text-sm font-medium">
        已选 {selectedCount} 个任务
      </span>

      {canAssign ? (
        <Select
          value={assigneeValue}
          onValueChange={(value) => {
            setAssigneeValue('');
            onAssign(value === 'unassigned' ? null : value);
          }}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-40" aria-label="批量设置负责人">
            <SelectValue placeholder="批量负责人" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">未指派</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {canUpdate ? (
        <Select
          value={priorityValue}
          onValueChange={(value) => {
            setPriorityValue('');
            if (isTaskPriority(value)) onPriority(value);
          }}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-32" aria-label="批量设置优先级">
            <SelectValue placeholder="批量优先级" />
          </SelectTrigger>
          <SelectContent>
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {canMove ? (
        <Select
          value={moveValue}
          onValueChange={(value) => {
            const column = columns.find((item) => item.id === value);
            setMoveValue('');
            if (column) onMove(column.id, column.name);
          }}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-32" aria-label="批量移动到看板列">
            <SelectValue placeholder="移动到" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {canUpdate ? (
        <div className="flex items-center gap-1">
          <Input
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitLabel();
              }
            }}
            placeholder="加标签"
            aria-label="批量加标签"
            maxLength={20}
            disabled={pending}
            className="h-8 w-28"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={submitLabel}
            disabled={pending || labelDraft.trim().length === 0}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            添加
          </Button>
        </div>
      ) : null}

      {canMove ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onComplete}
          disabled={pending || !doneColumnName}
          title={doneColumnName ? `将选中任务移入「${doneColumnName}」` : '当前看板没有完成列'}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          移入完成列
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={onClearSelection}
          disabled={pending}
        >
          清空选择
        </Button>
      </div>
    </div>
  );
}
