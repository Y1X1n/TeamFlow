'use client';

import {
  SUBTASK_TITLE_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Member } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  formatDependsOn,
  PLAN_STEP_TITLE_MAX_LENGTH,
  type BreakdownRow,
  type PlanStepDraft,
} from './task-plan-utils';

interface BreakdownPreviewProps {
  rows: BreakdownRow[];
  source: 'ai' | 'local';
  locked: boolean;
  onPatchRow: (key: string, patch: Partial<BreakdownRow>) => void;
  onSelectAll: (checked: boolean) => void;
}

function countSelected(rows: Array<{ checked: boolean }>): number {
  return rows.filter((row) => row.checked).length;
}

export function BreakdownPreview({
  rows,
  source,
  locked,
  onPatchRow,
  onSelectAll,
}: BreakdownPreviewProps) {
  const selectedCount = countSelected(rows);
  const allChecked = rows.length > 0 && selectedCount === rows.length;
  const someChecked = selectedCount > 0 && !allChecked;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="breakdown-select-all"
            checked={allChecked ? true : someChecked ? 'indeterminate' : false}
            disabled={locked || rows.length === 0}
            aria-label="全选子任务建议"
            onCheckedChange={(checked) => onSelectAll(checked === true)}
          />
          <label htmlFor="breakdown-select-all" className="text-xs text-muted-foreground">
            已选择 {selectedCount}/{rows.length}
          </label>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || allChecked || rows.length === 0}
            onClick={() => onSelectAll(true)}
          >
            全选
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || selectedCount === 0}
            onClick={() => onSelectAll(false)}
          >
            清空
          </Button>
        </div>
      </div>

      <ul className="max-h-[44vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className={cn(
              'flex items-start gap-2 rounded-lg border p-2 transition-colors',
              row.checked ? 'border-primary/30 bg-primary/5' : 'bg-background',
            )}
          >
            <Checkbox
              className="mt-2"
              checked={row.checked}
              disabled={locked}
              aria-label={`选择子任务建议 ${index + 1}`}
              onCheckedChange={(checked) => onPatchRow(row.key, { checked: checked === true })}
            />
            <Input
              value={row.title}
              maxLength={SUBTASK_TITLE_MAX_LENGTH}
              disabled={locked || !row.checked}
              aria-label={`子任务建议 ${index + 1} 标题`}
              className="h-8"
              onChange={(event) => onPatchRow(row.key, { title: event.target.value })}
            />
            <Badge
              variant={source === 'ai' ? 'default' : 'secondary'}
              className="mt-1.5 shrink-0"
            >
              {source === 'ai' ? 'AI' : '本地'}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PlanPreviewProps {
  rows: PlanStepDraft[];
  members: Member[];
  locked: boolean;
  onPatchRow: (key: string, patch: Partial<PlanStepDraft>) => void;
  onSelectAll: (checked: boolean) => void;
}

export function PlanPreview({
  rows,
  members,
  locked,
  onPatchRow,
  onSelectAll,
}: PlanPreviewProps) {
  const selectedCount = countSelected(rows);
  const allChecked = rows.length > 0 && selectedCount === rows.length;
  const someChecked = selectedCount > 0 && !allChecked;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="plan-select-all"
            checked={allChecked ? true : someChecked ? 'indeterminate' : false}
            disabled={locked || rows.length === 0}
            aria-label="全选分工步骤"
            onCheckedChange={(checked) => onSelectAll(checked === true)}
          />
          <label htmlFor="plan-select-all" className="text-xs text-muted-foreground">
            已选择 {selectedCount}/{rows.length} 步
          </label>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || allChecked || rows.length === 0}
            onClick={() => onSelectAll(true)}
          >
            全选
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || selectedCount === 0}
            onClick={() => onSelectAll(false)}
          >
            清空
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border scrollbar-thin">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <caption className="sr-only">任务分工预览，可编辑每步标题、负责人、优先级和截止时间</caption>
          <thead>
            <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
              <th scope="col" className="w-9 px-2 py-2">
                选择
              </th>
              <th scope="col" className="w-10 px-1 py-2">
                #
              </th>
              <th scope="col" className="min-w-[210px] px-2 py-2">
                标题
              </th>
              <th scope="col" className="min-w-[150px] px-2 py-2">
                负责人
              </th>
              <th scope="col" className="min-w-[104px] px-2 py-2">
                优先级
              </th>
              <th scope="col" className="min-w-[160px] px-2 py-2">
                截止时间
              </th>
              <th scope="col" className="min-w-[112px] px-2 py-2">
                依赖
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(row.checked ? 'bg-background' : 'bg-muted/20 text-muted-foreground')}
              >
                <td className="px-2 py-2 align-top">
                  <Checkbox
                    checked={row.checked}
                    disabled={locked}
                    aria-label={`选择第 ${row.stepIndex + 1} 步「${row.title || '未命名'}」`}
                    onCheckedChange={(checked) =>
                      onPatchRow(row.key, { checked: checked === true })
                    }
                  />
                </td>
                <td className="px-1 py-2 align-top text-xs tabular-nums text-muted-foreground">
                  {row.stepIndex + 1}
                </td>
                <td className="px-2 py-2 align-top">
                  <Input
                    value={row.title}
                    maxLength={PLAN_STEP_TITLE_MAX_LENGTH}
                    disabled={locked || !row.checked}
                    aria-label={`第 ${row.stepIndex + 1} 步标题`}
                    className="h-8"
                    onChange={(event) => onPatchRow(row.key, { title: event.target.value })}
                  />
                  {row.reason ? (
                    <p
                      title={row.reason}
                      className="mt-1 line-clamp-2 text-xs text-muted-foreground"
                    >
                      {row.reason}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-2 align-top">
                  <Select
                    value={row.assigneeId ?? 'unassigned'}
                    disabled={locked || !row.checked}
                    onValueChange={(value) =>
                      onPatchRow(row.key, { assigneeId: value === 'unassigned' ? null : value })
                    }
                  >
                    <SelectTrigger
                      aria-label={`第 ${row.stepIndex + 1} 步负责人`}
                      className="h-8"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">不指派</SelectItem>
                      {members.map((member) => {
                        const skills = member.skills ?? [];
                        return (
                          <SelectItem
                            key={member.userId}
                            value={member.userId}
                            textValue={member.name}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{member.name}</span>
                              {skills.length > 0 ? (
                                <span className="truncate text-xs text-muted-foreground">
                                  {skills.slice(0, 3).join('、')}
                                  {skills.length > 3 ? '…' : ''}
                                </span>
                              ) : null}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2 align-top">
                  <Select
                    value={row.priority}
                    disabled={locked || !row.checked}
                    onValueChange={(value) => {
                      const priority = TASK_PRIORITIES.find((item) => item === value);
                      if (priority) onPatchRow(row.key, { priority });
                    }}
                  >
                    <SelectTrigger
                      aria-label={`第 ${row.stepIndex + 1} 步优先级`}
                      className="h-8"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2 align-top">
                  <Input
                    type="datetime-local"
                    value={row.dueDate}
                    disabled={locked || !row.checked}
                    aria-label={`第 ${row.stepIndex + 1} 步截止时间`}
                    title="留空表示不设置截止时间"
                    className="h-8"
                    onChange={(event) => onPatchRow(row.key, { dueDate: event.target.value })}
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <span className="text-xs text-muted-foreground">
                    {formatDependsOn(row.dependsOn)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}