'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, ArchiveRestore, Loader2, Save } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { BoardColumnsCard } from '@/features/activities/board-columns-card';
import { ProjectPageError, ProjectPageHeader } from '@/features/activities/project-page-header';
import { InvitesCard } from '@/features/invites/invites-card';
import { MembersCard } from '@/features/members/members-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { MyPermissions, Project } from '@/lib/types';

const PROJECT_COLORS = [
  '#6366F1',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

function loadErrorText(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    if (error.status === 404) return '项目不存在，或你无权访问该项目。';
    if (error.status === 403) return '你无权访问该项目。';
    return error.message;
  }
  return undefined;
}

function projectWriteErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有执行该操作的权限。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，请先恢复项目。';
      case 'VALIDATION_ERROR':
        return error.message;
      default:
        return error.message;
    }
  }
  return '操作失败，请稍后重试。';
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api<Project>(`/projects/${projectId}`),
  });
  const permissionsQuery = useQuery({
    queryKey: queryKeys.myPermissions(projectId),
    queryFn: () => api<MyPermissions>(`/projects/${projectId}/permissions/me`),
  });

  const project = projectQuery.data;
  const permissions = permissionsQuery.data;
  const loading = projectQuery.isPending || permissionsQuery.isPending;
  const loadError = projectQuery.error ?? permissionsQuery.error;

  const permissionSet = new Set(permissions?.permissions ?? []);
  const archived = Boolean(project?.archived || permissions?.archived);
  const canUpdate = permissionSet.has('project:update') && !archived;
  const canArchive = permissionSet.has('project:archive');
  const canDelete =
    permissionSet.has('project:delete') && permissions?.role === 'OWNER' && !archived;
  const canManageMembers = permissionSet.has('member:manage') && !archived;
  const canInvite = permissionSet.has('member:invite');
  const canManageBoard = permissionSet.has('board:manage') && !archived;

  return (
    <>
      <ProjectPageHeader projectId={projectId} project={project} />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : loadError ? (
        <ProjectPageError message={loadErrorText(loadError)} />
      ) : project && permissions ? (
        <div className="space-y-6">
          {archived ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                项目已归档，所有写操作已停用。
                {canArchive ? '可在下方「归档」区域恢复项目。' : ''}
              </span>
            </div>
          ) : null}

          <BasicInfoCard
            key={project.id}
            project={project}
            canUpdate={canUpdate}
            canArchive={canArchive}
            canDelete={canDelete}
            archived={archived}
            showDanger={permissions.role === 'OWNER'}
          />

          <MembersCard
            projectId={project.id}
            myRole={permissions.role}
            canManage={canManageMembers}
            archived={archived}
          />

          <InvitesCard
            projectId={project.id}
            myRole={permissions.role}
            canInvite={canInvite}
            archived={archived}
          />

          <BoardColumnsCard projectId={project.id} canManage={canManageBoard} archived={archived} />
        </div>
      ) : (
        <ProjectPageError />
      )}
    </>
  );
}

interface BasicInfoCardProps {
  project: Project;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
  archived: boolean;
  showDanger: boolean;
}

function BasicInfoCard({
  project,
  canUpdate,
  canArchive,
  canDelete,
  archived,
  showDanger,
}: BasicInfoCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState(project.color);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const descriptionValue = description.trim();
  const dirty =
    name.trim() !== project.name ||
    descriptionValue !== (project.description ?? '') ||
    color !== project.color;

  function refreshProjectQueries() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(project.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myPermissions(project.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activities(project.id) });
  }

  const saveMutation = useMutation({
    mutationFn: (input: { name: string; description: string | null; color: string }) =>
      api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: input }),
    onSuccess: (updated) => {
      setName(updated.name);
      setDescription(updated.description ?? '');
      setColor(updated.color);
      toast.success('项目信息已保存');
      refreshProjectQueries();
    },
    onError: (error) => toast.error(projectWriteErrorText(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      api<Project>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: { archived: !project.archived },
      }),
    onSuccess: (updated) => {
      setArchiveOpen(false);
      toast.success(updated.archived ? '项目已归档' : '项目已恢复');
      refreshProjectQueries();
    },
    onError: (error) => toast.error(projectWriteErrorText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api<undefined>(`/projects/${project.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('项目已删除');
      queryClient.removeQueries({ queryKey: queryKeys.project(project.id) });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.replace('/');
    },
    onError: (error) => toast.error(projectWriteErrorText(error)),
  });

  function resetForm() {
    setName(project.name);
    setDescription(project.description ?? '');
    setColor(project.color);
  }

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle>基本信息</CardTitle>
        <CardDescription>项目名称、描述与主题色会展示在看板和邀请页面。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !canUpdate) return;
            saveMutation.mutate({
              name: name.trim(),
              description: descriptionValue || null,
              color,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-name">项目名称</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              disabled={!canUpdate}
              required
            />
            <p className="text-xs text-muted-foreground">1–60 个字符。</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">项目描述</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={!canUpdate}
              placeholder="一句话介绍项目目标与范围"
            />
            <p className="text-right text-xs text-muted-foreground">{description.length}/500</p>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium leading-none">项目颜色</span>
            <div
              role="group"
              aria-label="选择项目颜色"
              className="flex flex-wrap items-center gap-2"
            >
              {PROJECT_COLORS.map((option) => {
                const selected = color.toLowerCase() === option.toLowerCase();
                return (
                  <button
                    key={option}
                    type="button"
                    aria-label={`使用颜色 ${option}`}
                    aria-pressed={selected}
                    disabled={!canUpdate}
                    onClick={() => setColor(option)}
                    className="h-8 w-8 rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      backgroundColor: option,
                      boxShadow: selected
                        ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${option}`
                        : undefined,
                    }}
                  />
                );
              })}
              <span
                className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {color}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {!canUpdate
                ? archived
                  ? '项目已归档，恢复后才能编辑。'
                  : '你没有编辑项目的权限。'
                : dirty
                  ? '有未保存的更改'
                  : '所有更改已保存'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={!dirty || saveMutation.isPending}
              >
                撤销更改
              </Button>
              <Button
                type="submit"
                disabled={!dirty || !name.trim() || !canUpdate || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                保存更改
              </Button>
            </div>
          </div>
        </form>

        <Separator className="my-6" />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-semibold">{archived ? '恢复项目' : '归档项目'}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {archived
                ? '恢复后项目将重新允许任务、评论与成员变更。'
                : '归档后项目变为只读，可随时恢复。'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!canArchive || archiveMutation.isPending}
            onClick={() => setArchiveOpen(true)}
          >
            {archived ? (
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Archive className="h-4 w-4" aria-hidden="true" />
            )}
            {archived ? '恢复项目' : '归档项目'}
          </Button>
        </div>

        {showDanger ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              危险区
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              删除项目会永久移除项目、看板列、任务与评论，操作不可恢复。
              {archived ? '请先恢复项目后再删除。' : ''}
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="mt-3"
              disabled={!canDelete || deleteMutation.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              删除项目
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{archived ? '恢复项目' : '归档项目'}</DialogTitle>
            <DialogDescription>
              {archived
                ? '恢复后成员可以继续编辑任务、评论和看板列。'
                : '归档后项目进入只读状态，成员无法创建任务、评论或调整看板；历史数据与周报仍可查看。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate()}
            >
              {archiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {archived ? '确认恢复' : '确认归档'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirm('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              此操作不可恢复。请输入项目名称「{project.name}」以确认删除。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-project-confirm">项目名称</Label>
            <Input
              id="delete-project-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={project.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || deleteConfirm.trim() !== project.name}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              )}
              永久删除项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
