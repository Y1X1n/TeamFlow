'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Member } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PermissionAction {
  key: string;
  label: string;
  group: string;
  description: string;
}

interface PermissionCatalog {
  actions: PermissionAction[];
  rolePresets: Record<string, string[]>;
}

interface MemberPermissionsDialogProps {
  projectId: string;
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function permissionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有管理成员权限的权限。';
      case 'OWNER_IMMUTABLE':
        return '项目负责人不可被修改。';
      case 'ADMIN_CANNOT_MANAGE_ADMIN':
        return '管理员不能管理其他管理员。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法修改成员权限。';
      default:
        return error.message;
    }
  }
  return '保存权限覆盖失败，请稍后重试。';
}

export function MemberPermissionsDialog({
  projectId,
  member,
  open,
  onOpenChange,
}: MemberPermissionsDialogProps) {
  const catalogQuery = useQuery({
    queryKey: queryKeys.permissionCatalog,
    queryFn: () => api<PermissionCatalog>('/permissions/catalog'),
    enabled: open && member !== null,
    staleTime: 5 * 60_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>权限覆盖 · {member?.name ?? '成员'}</DialogTitle>
          <DialogDescription>
            {member
              ? `勾选结果将覆盖「${PROJECT_ROLE_LABELS[member.role]}」角色的默认权限，仅保存与默认值不同的项。`
              : '为成员单独调整项目权限。'}
          </DialogDescription>
        </DialogHeader>

        {member === null ? null : catalogQuery.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : catalogQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>权限目录加载失败，请稍后重试。</span>
            <Button variant="outline" size="sm" onClick={() => void catalogQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <PermissionsForm
            key={`${member.id}:${member.role}`}
            projectId={projectId}
            member={member}
            actions={catalogQuery.data.actions}
            rolePresets={catalogQuery.data.rolePresets}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PermissionsFormProps {
  projectId: string;
  member: Member;
  actions: PermissionAction[];
  rolePresets: Record<string, string[]>;
  onDone: () => void;
}

function PermissionsForm({
  projectId,
  member,
  actions,
  rolePresets,
  onDone,
}: PermissionsFormProps) {
  const queryClient = useQueryClient();
  const isOwner = member.role === 'OWNER';

  const presetKeys = useMemo(() => {
    if (isOwner) return actions.map((action) => action.key);
    return rolePresets[member.role] ?? [];
  }, [actions, isOwner, member.role, rolePresets]);

  const preset = useMemo(() => new Set(presetKeys), [presetKeys]);

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const action of actions) {
      initial[action.key] = isOwner
        ? true
        : (member.permissionOverrides?.[action.key] ?? preset.has(action.key));
    }
    return initial;
  });

  const groups = useMemo(() => {
    const grouped = new Map<string, PermissionAction[]>();
    for (const action of actions) {
      const list = grouped.get(action.group) ?? [];
      list.push(action);
      grouped.set(action.group, list);
    }
    return [...grouped.entries()];
  }, [actions]);

  const enabledCount = actions.filter((action) => checked[action.key] === true).length;

  const saveMutation = useMutation({
    mutationFn: () => {
      const overrides: Record<string, boolean> = {};
      for (const action of actions) {
        const value = checked[action.key] === true;
        if (value !== preset.has(action.key)) overrides[action.key] = value;
      }
      const payload = Object.keys(overrides).length > 0 ? overrides : null;
      return api<Member>(`/projects/${projectId}/members/${member.userId}`, {
        method: 'PATCH',
        body: { permissionOverrides: payload },
      });
    },
    onSuccess: () => {
      toast.success(`已更新 ${member.name} 的权限覆盖`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myPermissions(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
      onDone();
    },
    onError: (error) => toast.error(permissionErrorText(error)),
  });

  function resetToPreset() {
    const next: Record<string, boolean> = {};
    for (const action of actions) next[action.key] = preset.has(action.key);
    setChecked(next);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isOwner) return;
        saveMutation.mutate();
      }}
    >
      {isOwner ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>项目负责人拥有全部权限，且不可被修改或移除。</span>
        </div>
      ) : null}

      <div className="max-h-[52vh] space-y-5 overflow-y-auto pr-1">
        {groups.map(([group, groupActions]) => (
          <fieldset key={group}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </legend>
            <div className="space-y-2">
              {groupActions.map((action) => {
                const id = `perm-${member.userId}-${action.key.replace(':', '-')}`;
                const active = checked[action.key] === true;
                return (
                  <label
                    key={action.key}
                    htmlFor={id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border p-3 transition-colors',
                      isOwner ? 'bg-muted/30' : 'cursor-pointer hover:bg-muted/40',
                    )}
                  >
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={active}
                      disabled={isOwner}
                      onCheckedChange={(value) =>
                        setChecked((previous) => ({
                          ...previous,
                          [action.key]: value === true,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {action.label}
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {action.key}
                        </code>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <DialogFooter className="sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={isOwner ? 'success' : 'muted'}>
            已启用 {enabledCount}/{actions.length} 项
          </Badge>
          {!isOwner ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToPreset}
              disabled={saveMutation.isPending}
            >
              恢复角色默认
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {isOwner ? '关闭' : '取消'}
            </Button>
          </DialogClose>
          {!isOwner ? (
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              保存权限覆盖
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </form>
  );
}
