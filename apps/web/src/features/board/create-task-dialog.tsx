'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { invalidateProjectSurfaces } from '@/lib/invalidate';
import type { BoardColumn, MemberSummary, TaskDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from '@/components/rich-text-editor';
import {
  getErrorMessage,
  parseDateTimeLocal,
  parseEstimateHours,
  parseLabelsInput,
  isTaskPriority,
} from '@/features/tasks/task-utils';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columns: BoardColumn[];
  members: MemberSummary[];
}

interface CreateTaskPayload {
  title: string;
  description?: Record<string, unknown>;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  labels?: string[];
  columnId?: string;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  projectId,
  columns,
  members,
}: CreateTaskDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<Record<string, unknown> | null>(null);
  const [descriptionText, setDescriptionText] = useState('');
  const [columnId, setColumnId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('unassigned');
  const [dueDate, setDueDate] = useState('');
  const [estimateHours, setEstimateHours] = useState('');
  const [labels, setLabels] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription(null);
    setDescriptionText('');
    setColumnId(columnsRef.current[0]?.id ?? '');
    setPriority('MEDIUM');
    setAssigneeId('unassigned');
    setDueDate('');
    setEstimateHours('');
    setLabels('');
    setFormError(null);
  }, [open]);

  const createTask = useMutation<TaskDetail, Error, CreateTaskPayload>({
    mutationFn: (payload) =>
      api<TaskDetail>(`/projects/${projectId}/tasks`, { method: 'POST', body: payload }),
    onSuccess: (task) => {
      toast.success(`任务「${task.title}」已创建`);
      invalidateProjectSurfaces(queryClient, projectId);
      onOpenChange(false);
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
    },
  });

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('请输入任务标题');
      return;
    }
    if (!columnId) {
      setFormError('请选择看板列');
      return;
    }
    const labelsResult = parseLabelsInput(labels);
    if (labelsResult.error) {
      setFormError(labelsResult.error);
      return;
    }
    const dueResult = parseDateTimeLocal(dueDate);
    if (!dueResult.valid) {
      setFormError('截止时间格式不正确');
      return;
    }
    const estimateResult = parseEstimateHours(estimateHours);
    if (estimateResult.error) {
      setFormError(estimateResult.error);
      return;
    }
    setFormError(null);
    const payload: CreateTaskPayload = {
      title: trimmedTitle,
      priority,
      columnId,
      assigneeId: assigneeId === 'unassigned' ? null : assigneeId,
      dueDate: dueResult.iso,
      estimateMinutes: estimateResult.minutes,
      labels: labelsResult.labels,
    };
    if (description && descriptionText.trim()) payload.description = description;
    createTask.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>填写任务信息，创建后将出现在所选看板列末尾。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {' '}
          <div className="space-y-1.5">
            <Label htmlFor="create-task-title">标题</Label>
            <Input
              id="create-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：完成登录页联调"
              maxLength={200}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>描述</Label>
            <RichTextEditor
              onChange={(json, text) => {
                setDescription(json);
                setDescriptionText(text);
              }}
              members={members}
              minHeight="80px"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-task-column">看板列</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger id="create-task-column">
                  <SelectValue placeholder="选择列" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-task-priority">优先级</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  if (isTaskPriority(value)) setPriority(value);
                }}
              >
                <SelectTrigger id="create-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {TASK_PRIORITY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-task-assignee">负责人</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="create-task-assignee">
                  <SelectValue />
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-task-due">截止时间</Label>
              <Input
                id="create-task-due"
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-task-estimate">预计工时（小时）</Label>
              <Input
                id="create-task-estimate"
                type="number"
                min={0.25}
                max={168}
                step={0.25}
                value={estimateHours}
                onChange={(event) => setEstimateHours(event.target.value)}
                placeholder="可选，例如 2"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-task-labels">标签</Label>
            <Input
              id="create-task-labels"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="用逗号分隔，最多 5 个，例如：前端, 紧急"
            />
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createTask.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={createTask.isPending || columns.length === 0}>
              {createTask.isPending ? '创建中…' : '创建任务'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
