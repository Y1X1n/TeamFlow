'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
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
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BoardColumn, BoardData } from '@/lib/types';

interface BoardColumnsCardProps {
  projectId: string;
  canManage: boolean;
  archived: boolean;
}

interface MoveColumnVariables {
  columnId: string;
  beforeColumnId: string | null;
}

interface UpdateColumnVariables {
  columnId: string;
  name: string;
  isDone: boolean;
}

interface DeleteColumnVariables {
  columnId: string;
  moveTasksTo: string | null;
}

function columnErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有管理看板列的权限。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法修改看板列。';
      case 'LAST_COLUMN':
        return '至少需要保留一个看板列。';
      case 'COLUMN_NOT_EMPTY':
        return '该列还有任务，请选择任务迁移的目标列。';
      case 'NOT_FOUND':
        return '看板列不存在或已被删除。';
      default:
        return error.message;
    }
  }
  return '操作失败，请稍后重试。';
}

export function BoardColumnsCard({ projectId, canManage, archived }: BoardColumnsCardProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newIsDone, setNewIsDone] = useState(false);
  const [editing, setEditing] = useState<BoardColumn | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsDone, setEditIsDone] = useState(false);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const [moveTasksTo, setMoveTasksTo] = useState('');

  const boardQuery = useQuery({
    queryKey: queryKeys.board(projectId),
    queryFn: () => api<BoardData>(`/projects/${projectId}/board`),
  });

  const columns = boardQuery.data?.columns ?? [];
  const readOnly = !canManage || archived;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
  }

  const addMutation = useMutation({
    mutationFn: (input: { name: string; isDone: boolean }) =>
      api<BoardColumn>(`/projects/${projectId}/columns`, { method: 'POST', body: input }),
    onSuccess: (column) => {
      toast.success(`已新增看板列「${column.name}」`);
      setNewName('');
      setNewIsDone(false);
      invalidate();
    },
    onError: (error) => toast.error(columnErrorText(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (variables: UpdateColumnVariables) =>
      api<BoardColumn>(`/columns/${variables.columnId}`, {
        method: 'PATCH',
        body: { name: variables.name, isDone: variables.isDone },
      }),
    onSuccess: () => {
      toast.success('看板列已更新');
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(columnErrorText(error)),
  });

  const moveMutation = useMutation({
    mutationFn: (variables: MoveColumnVariables) =>
      api<BoardColumn>(`/columns/${variables.columnId}/move`, {
        method: 'PATCH',
        body: { beforeColumnId: variables.beforeColumnId },
      }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(columnErrorText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (variables: DeleteColumnVariables) => {
      const query = variables.moveTasksTo
        ? `?moveTasksTo=${encodeURIComponent(variables.moveTasksTo)}`
        : '';
      return api<undefined>(`/columns/${variables.columnId}${query}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast.success('看板列已删除');
      setDeleting(null);
      setMoveTasksTo('');
      invalidate();
    },
    onError: (error) => toast.error(columnErrorText(error)),
  });

  function openEdit(column: BoardColumn) {
    setEditing(column);
    setEditName(column.name);
    setEditIsDone(column.isDone);
  }

  function openDelete(column: BoardColumn) {
    setDeleting(column);
    setMoveTasksTo('');
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error('请输入看板列名称');
      return;
    }
    addMutation.mutate({ name, isDone: newIsDone });
  }

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle>看板列</CardTitle>
        <CardDescription>
          调整列的名称、完成列标记与顺序；删除非空列时需要选择任务迁移到的目标列。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {boardQuery.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : boardQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>看板列加载失败，请稍后重试。</span>
            <Button variant="outline" size="sm" onClick={() => void boardQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : columns.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无看板列
          </p>
        ) : (
          <ul className="space-y-2">
            {columns.map((column, index) => {
              const movingThis =
                moveMutation.isPending && moveMutation.variables?.columnId === column.id;
              const movingUp =
                movingThis &&
                moveMutation.variables?.beforeColumnId === (columns[index - 1]?.id ?? null);
              const movingDown = movingThis && !movingUp;
              return (
                <li
                  key={column.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{column.name}</span>
                      {column.isDone ? (
                        <Badge variant="success">完成列</Badge>
                      ) : (
                        <Badge variant="muted">进行列</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {column.taskCount} 个任务
                    </p>
                  </div>

                  {!readOnly ? (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`将「${column.name}」上移`}
                        disabled={index === 0 || moveMutation.isPending}
                        onClick={() =>
                          moveMutation.mutate({
                            columnId: column.id,
                            beforeColumnId: columns[index - 1]?.id ?? null,
                          })
                        }
                      >
                        {movingUp ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`将「${column.name}」下移`}
                        disabled={index === columns.length - 1 || moveMutation.isPending}
                        onClick={() =>
                          moveMutation.mutate({
                            columnId: column.id,
                            beforeColumnId: columns[index + 2]?.id ?? null,
                          })
                        }
                      >
                        {movingDown ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`编辑看板列「${column.name}」`}
                        disabled={updateMutation.isPending}
                        onClick={() => openEdit(column)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`删除看板列「${column.name}」`}
                        disabled={deleteMutation.isPending}
                        onClick={() => openDelete(column)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!readOnly ? (
          <form
            className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              handleAdd();
            }}
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="新看板列名称"
              aria-label="新看板列名称"
              maxLength={30}
              disabled={addMutation.isPending}
              className="sm:max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={newIsDone}
                onCheckedChange={(value) => setNewIsDone(value === true)}
                disabled={addMutation.isPending}
              />
              标记为完成列
            </label>
            <Button
              type="submit"
              size="sm"
              className="sm:ml-auto"
              disabled={!newName.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              新增列
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {archived ? '项目已归档，看板列不可修改。' : '你没有管理看板列的权限。'}
          </p>
        )}
      </CardContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑看板列</DialogTitle>
            <DialogDescription>
              修改列名称或切换完成列标记；切换完成列会同步更新列内任务的完成状态。
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const name = editName.trim();
                if (!name) {
                  toast.error('请输入看板列名称');
                  return;
                }
                if (name === editing.name && editIsDone === editing.isDone) {
                  setEditing(null);
                  return;
                }
                updateMutation.mutate({ columnId: editing.id, name, isDone: editIsDone });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-column-name">列名称</Label>
                <Input
                  id="edit-column-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={30}
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={editIsDone}
                  onCheckedChange={(value) => setEditIsDone(value === true)}
                />
                <span>
                  完成列
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    标记为完成列后，移入该列的任务会自动标记完成。
                  </span>
                </span>
              </label>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={!editName.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  保存
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setMoveTasksTo('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除看板列</DialogTitle>
            <DialogDescription>
              {deleting
                ? deleting.taskCount > 0
                  ? `「${deleting.name}」中有 ${deleting.taskCount} 个任务，请选择迁移到的目标列。`
                  : `确定删除看板列「${deleting.name}」吗？该列当前没有任务。`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleting && deleting.taskCount > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="delete-column-target">任务迁移到</Label>
              <Select value={moveTasksTo || undefined} onValueChange={setMoveTasksTo}>
                <SelectTrigger id="delete-column-target" aria-label="选择任务迁移的目标列">
                  <SelectValue placeholder="选择目标列" />
                </SelectTrigger>
                <SelectContent>
                  {columns
                    .filter((column) => column.id !== deleting.id)
                    .map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.name}
                        {column.isDone ? '（完成列）' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteMutation.isPending || ((deleting?.taskCount ?? 0) > 0 && !moveTasksTo)
              }
              onClick={() => {
                if (!deleting) return;
                deleteMutation.mutate({
                  columnId: deleting.id,
                  moveTasksTo: deleting.taskCount > 0 ? moveTasksTo : null,
                });
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
