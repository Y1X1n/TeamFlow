'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Copy, History, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BoardData, TaskDetail } from '@/lib/types';
import { cn, formatDateTime, isOverdue } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { TaskActivity } from './task-activity';
import { TaskAssignSuggestions } from './task-assign-suggestions';
import { TaskAttachments } from './task-attachments';
import { TaskComments } from './task-comments';
import { TaskDependencies } from './task-dependencies';
import { TaskSubtasks } from './task-subtasks';
import { TaskWatch } from './task-watch';
import {
  getErrorMessage,
  isTaskPriority,
  parseDateTimeLocal,
  parseLabelsInput,
  toDateTimeLocalValue,
} from './task-utils';

interface TaskDrawerProps {
  taskId: string;
  projectId: string;
  board: BoardData;
  open: boolean;
  onClose: () => void;
  currentUserId: string;
}

interface UpdateTaskPayload {
  title?: string;
  description?: Record<string, unknown> | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  labels?: string[];
}

export function TaskDrawer({
  taskId,
  projectId,
  board,
  open,
  onClose,
  currentUserId,
}: TaskDrawerProps) {
  const queryClient = useQueryClient();
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState<Record<string, unknown> | null>(null);
  const [labelsEditing, setLabelsEditing] = useState(false);
  const [labelsDraft, setLabelsDraft] = useState('');
  const [dueDraft, setDueDraft] = useState('');
  const [draftsFor, setDraftsFor] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [assignSuggestionsOpen, setAssignSuggestionsOpen] = useState(false);

  const taskQuery = useQuery<TaskDetail, Error>({
    queryKey: queryKeys.task(taskId),
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
    staleTime: 60_000,
    enabled: open,
  });
  const task = taskQuery.data;

  const permissions = board.myPermissions;
  const archived = board.project.archived;
  const canUpdate = !archived && permissions.includes('task:update');
  const canAssign = canUpdate && permissions.includes('task:assign');
  const canDelete = !archived && permissions.includes('task:delete');
  const canCreate = !archived && permissions.includes('task:create');
  const canComment = !archived && permissions.includes('comment:create');
  const canModerate = !archived && permissions.includes('comment:moderate');
  const canUploadAttachment = !archived && permissions.includes('attachment:upload');
  const canDeleteAttachments = permissions.includes('attachment:delete');
  const columnName = board.columns.find((column) => column.id === task?.columnId)?.name;

  useEffect(() => {
    if (!task || draftsFor === task.id) return;
    setDraftsFor(task.id);
    setTitleDraft(task.title);
    setLabelsDraft(task.labels.join(', '));
    setDueDraft(toDateTimeLocalValue(task.dueDate));
    setTitleEditing(false);
    setDescEditing(false);
    setLabelsEditing(false);
  }, [task, draftsFor]);

  useEffect(() => {
    setDueDraft(toDateTimeLocalValue(task?.dueDate ?? null));
  }, [task?.dueDate]);

  const updateTask = useMutation<TaskDetail, Error, UpdateTaskPayload>({
    mutationFn: (payload) =>
      api<TaskDetail>(`/tasks/${taskId}`, { method: 'PATCH', body: payload }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.task(taskId), updated);
      queryClient.setQueryData<BoardData>(queryKeys.board(projectId), (previous) =>
        previous
          ? {
              ...previous,
              tasks: previous.tasks.map((item) => (item.id === updated.id ? updated : item)),
            }
          : previous,
      );
      toast.success('已保存');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteTask = useMutation<void, Error, void>({
    mutationFn: () => api<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.task(taskId) });
      queryClient.removeQueries({ queryKey: queryKeys.comments(taskId) });
      queryClient.removeQueries({ queryKey: queryKeys.attachments(taskId) });
      queryClient.setQueryData<BoardData>(queryKeys.board(projectId), (previous) =>
        previous
          ? { ...previous, tasks: previous.tasks.filter((item) => item.id !== taskId) }
          : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      toast.success('任务已删除');
      setConfirmDeleteOpen(false);
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const duplicateTask = useMutation<TaskDetail, Error, void>({
    mutationFn: () => api<TaskDetail>(`/tasks/${taskId}/duplicate`, { method: 'POST' }),
    onSuccess: (copy) => {
      queryClient.setQueryData(queryKeys.task(copy.id), copy);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      toast.success(`已创建副本「${copy.title}」`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const startTitleEdit = () => {
    if (!task) return;
    setTitleDraft(task.title);
    setTitleEditing(true);
  };

  const saveTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      toast.error('任务标题不能为空');
      return;
    }
    if (nextTitle === task.title) {
      setTitleEditing(false);
      return;
    }
    updateTask.mutate(
      { title: nextTitle },
      {
        onSuccess: () => setTitleEditing(false),
      },
    );
  };

  const handlePriorityChange = (value: string) => {
    if (!task || !isTaskPriority(value) || value === task.priority) return;
    updateTask.mutate({ priority: value });
  };

  const handleAssigneeChange = (value: string) => {
    if (!task) return;
    const nextAssignee = value === 'unassigned' ? null : value;
    if (nextAssignee === (task.assignee?.userId ?? null)) return;
    updateTask.mutate({ assigneeId: nextAssignee });
  };

  const applySuggestedAssignee = async (userId: string) => {
    await updateTask.mutateAsync({ assigneeId: userId });
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
  };

  const saveDueDate = () => {
    const parsed = parseDateTimeLocal(dueDraft);
    if (!parsed.valid) {
      toast.error('截止时间格式不正确');
      return;
    }
    updateTask.mutate({ dueDate: parsed.iso });
  };

  const startLabelsEdit = () => {
    if (!task) return;
    setLabelsDraft(task.labels.join(', '));
    setLabelsEditing(true);
  };

  const saveLabels = () => {
    const parsed = parseLabelsInput(labelsDraft);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    updateTask.mutate(
      { labels: parsed.labels },
      {
        onSuccess: () => setLabelsEditing(false),
      },
    );
  };

  const startDescriptionEdit = () => {
    if (!task) return;
    setDescDraft(task.description);
    setDescEditing(true);
  };

  const saveDescription = () => {
    updateTask.mutate(
      { description: descDraft },
      {
        onSuccess: () => setDescEditing(false),
      },
    );
  };

  const dueChanged = task ? toDateTimeLocalValue(task.dueDate) !== dueDraft : false;
  const overdue = task ? isOverdue(task.dueDate, task.completedAt) : false;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent className="flex w-full max-w-[640px] flex-col gap-0 p-0 sm:max-w-[640px]">
        <SheetTitle className="sr-only">任务详情</SheetTitle>
        <SheetDescription className="sr-only">
          查看与编辑任务详情、子任务、评论、活动与附件
        </SheetDescription>

        <div className="flex items-center justify-between gap-2 border-b px-5 py-3 pr-12">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>任务详情</span>
            {columnName ? <Badge variant="secondary">{columnName}</Badge> : null}
            {archived ? <Badge variant="warning">项目已归档</Badge> : null}
            {!archived && !canUpdate ? <Badge variant="muted">只读</Badge> : null}
          </div>
          <div className="flex items-center gap-1.5">
            {task ? (
              <TaskWatch
                taskId={task.id}
                watching={task.watching}
                watcherCount={task.watcherCount}
                disabled={archived}
              />
            ) : null}
            {task && canCreate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => duplicateTask.mutate()}
                disabled={duplicateTask.isPending}
              >
                {duplicateTask.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                复制任务
              </Button>
            ) : null}
            {task && canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                删除任务
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {taskQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : taskQuery.isError || !task ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium">任务加载失败</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {taskQuery.error ? getErrorMessage(taskQuery.error) : '任务不存在或已被删除'}
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void taskQuery.refetch()}
                >
                  重试
                </Button>
                <Button type="button" size="sm" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                {titleEditing ? (
                  <form onSubmit={saveTitle} className="flex items-center gap-2">
                    <Label htmlFor="task-title-input" className="sr-only">
                      任务标题
                    </Label>
                    <Input
                      id="task-title-input"
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      disabled={updateTask.isPending}
                      maxLength={200}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={updateTask.isPending}>
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTitleDraft(task.title);
                        setTitleEditing(false);
                      }}
                    >
                      取消
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-start gap-2">
                    <h2 className="flex-1 text-lg font-semibold leading-6">{task.title}</h2>
                    {canUpdate ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="编辑任务标题"
                        onClick={startTitleEdit}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="task-priority">优先级</Label>
                  <Select
                    value={task.priority}
                    onValueChange={handlePriorityChange}
                    disabled={!canUpdate || updateTask.isPending}
                  >
                    <SelectTrigger id="task-priority">
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
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="task-assignee">负责人</Label>
                    {canAssign && !archived ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        onClick={() => setAssignSuggestionsOpen(true)}
                        disabled={updateTask.isPending}
                        aria-haspopup="dialog"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        智能推荐
                      </Button>
                    ) : null}
                  </div>
                  <Select
                    value={task.assignee?.userId ?? 'unassigned'}
                    onValueChange={handleAssigneeChange}
                    disabled={!canAssign || updateTask.isPending}
                  >
                    <SelectTrigger id="task-assignee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">未指派</SelectItem>
                      {board.members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!canAssign && canUpdate ? (
                    <p className="text-[11px] text-muted-foreground">无指派权限</p>
                  ) : null}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="task-due-date">截止时间</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="task-due-date"
                      type="datetime-local"
                      value={dueDraft}
                      onChange={(event) => setDueDraft(event.target.value)}
                      disabled={!canUpdate || updateTask.isPending}
                    />
                    {canUpdate && dueChanged ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveDueDate}
                        disabled={updateTask.isPending}
                      >
                        保存
                      </Button>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      'text-[11px] text-muted-foreground',
                      overdue && 'text-destructive',
                    )}
                  >
                    {task.dueDate
                      ? `${overdue ? '已逾期 · ' : ''}${formatDateTime(task.dueDate)}`
                      : '未设置截止时间'}
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">标签</span>
                    {canUpdate && !labelsEditing ? (
                      <Button type="button" variant="ghost" size="sm" onClick={startLabelsEdit}>
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        编辑标签
                      </Button>
                    ) : null}
                  </div>
                  {labelsEditing ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="task-labels-input" className="sr-only">
                        标签
                      </Label>
                      <Input
                        id="task-labels-input"
                        value={labelsDraft}
                        onChange={(event) => setLabelsDraft(event.target.value)}
                        placeholder="用逗号分隔"
                        disabled={updateTask.isPending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveLabels}
                        disabled={updateTask.isPending}
                      >
                        保存
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLabelsDraft(task.labels.join(', '));
                          setLabelsEditing(false);
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  ) : task.labels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {task.labels.map((label) => (
                        <Badge key={label} variant="outline" className="font-normal">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无标签</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">描述</h3>
                  {canUpdate && !descEditing ? (
                    <Button type="button" variant="ghost" size="sm" onClick={startDescriptionEdit}>
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      编辑描述
                    </Button>
                  ) : null}
                </div>
                {descEditing ? (
                  <div className="mt-2">
                    <RichTextEditor
                      key={`description-${task.id}`}
                      value={task.description}
                      onChange={(json) => setDescDraft(json)}
                      members={board.members}
                      minHeight="120px"
                      disabled={updateTask.isPending}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDescEditing(false);
                          setDescDraft(null);
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveDescription}
                        disabled={updateTask.isPending}
                      >
                        保存描述
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <RichTextView doc={task.description} />
                  </div>
                )}
              </div>

              <Separator />

              <TaskSubtasks
                taskId={task.id}
                projectId={projectId}
                taskTitle={task.title}
                canUpdate={canUpdate}
                archived={archived}
              />

              <Separator />

              <TaskDependencies
                taskId={task.id}
                projectId={projectId}
                blockedBy={task.blockedBy}
                blocking={task.blocking}
                tasks={board.tasks}
                columns={board.columns}
                canUpdate={canUpdate}
                archived={archived}
              />

              <Separator />

              <TaskAttachments
                taskId={task.id}
                projectId={projectId}
                currentUserId={currentUserId}
                canUpload={canUploadAttachment}
                canDeleteOthers={canDeleteAttachments}
                archived={archived}
              />

              <Separator />

              <TaskComments
                taskId={task.id}
                projectId={projectId}
                currentUserId={currentUserId}
                members={board.members}
                canComment={canComment}
                canModerate={canModerate}
                archived={archived}
              />

              <Separator />

              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between px-0"
                  aria-expanded={activityOpen}
                  aria-controls="task-activity-panel"
                  onClick={() => setActivityOpen((open) => !open)}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    活动
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      activityOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </Button>
                <div id="task-activity-panel" hidden={!activityOpen}>
                  {activityOpen ? <TaskActivity taskId={task.id} /> : null}
                </div>
              </div>

              <div className="space-y-0.5 border-t pt-3 text-[11px] text-muted-foreground">
                <p>
                  创建者：{task.createdBy.name} · 创建于 {formatDateTime(task.createdAt)}
                </p>
                <p>最近更新：{formatDateTime(task.updatedAt)}</p>
              </div>
            </div>
          )}
        </div>

        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除任务</DialogTitle>
              <DialogDescription>
                删除后任务将从看板移除，且无法恢复。确定删除「{task?.title ?? '该任务'}」吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleteTask.isPending}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteTask.mutate()}
                disabled={deleteTask.isPending}
              >
                {deleteTask.isPending ? '删除中…' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TaskAssignSuggestions
          projectId={projectId}
          taskId={taskId}
          taskTitle={task?.title ?? ''}
          currentAssigneeId={task?.assignee?.userId ?? null}
          canAssign={canAssign}
          archived={archived}
          open={assignSuggestionsOpen}
          onOpenChange={setAssignSuggestionsOpen}
          onAssign={applySuggestedAssignee}
          onAssigned={() => setAssignSuggestionsOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
