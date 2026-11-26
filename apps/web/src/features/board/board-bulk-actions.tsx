'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MemberSummary } from '@/lib/types';
import { isTaskPriority } from '@/features/tasks/task-utils';

interface BoardBulkActionsProps {
  selectedCount: number;
  members: MemberSummary[];
  canAssign: boolean;
  canUpdate: boolean;
  canMove: boolean;
  doneColumnName: string | null;
  pending: boolean;
  onAssign: (assigneeId: string | null) => void;
  onPriority: (priority: TaskPriority) => void;
  onComplete: () => void;
  onClearSelection: () => void;
}

export function BoardBulkActions({
  selectedCount,
  members,
  canAssign,
  canUpdate,
  canMove,
  doneColumnName,
  pending,
  onAssign,
  onPriority,
  onComplete,
  onClearSelection,
}: BoardBulkActionsProps) {
  const [assigneeValue, setAssigneeValue] = useState('');
  const [priorityValue, setPriorityValue] = useState('');

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
