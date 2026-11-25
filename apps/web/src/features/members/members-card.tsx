'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS, type ProjectRole } from '@teamflow/shared/enums';
import { isProjectRole } from '@teamflow/shared/permissions';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import type { Member } from '@/lib/types';
import { avatarColor, formatDate } from '@/lib/utils';
import { MemberPermissionsDialog } from './member-permissions-dialog';

interface MembersCardProps {
  projectId: string;
  myRole: ProjectRole;
  canManage: boolean;
  archived: boolean;
}

function memberErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有管理成员的权限。';
      case 'OWNER_IMMUTABLE':
        return '项目负责人不可被修改或移除。';
      case 'ADMIN_CANNOT_MANAGE_ADMIN':
        return '管理员不能管理其他管理员。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法修改成员。';
      case 'NOT_FOUND':
        return '成员不存在或已离开项目。';
      default:
        return error.message;
    }
  }
  return '操作失败，请稍后重试。';
}

function roleVariant(role: ProjectRole): NonNullable<BadgeProps['variant']> {
  switch (role) {
    case 'OWNER':
      return 'default';
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'secondary';
    default:
      return 'muted';
  }
}

function assignableRole(value: string): value is ProjectRole {
  return isProjectRole(value) && value !== 'OWNER';
}

export function MembersCard({ projectId, myRole, canManage, archived }: MembersCardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [permissionTarget, setPermissionTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => api<{ items: Member[] }>(`/projects/${projectId}/members`),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myPermissions(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activities(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
  }

  const roleMutation = useMutation({
    mutationFn: (variables: { userId: string; role: ProjectRole }) =>
      api<Member>(`/projects/${projectId}/members/${variables.userId}`, {
        method: 'PATCH',
        body: { role: variables.role },
      }),
    onSuccess: (member) => {
      toast.success(`已将 ${member.name} 的角色调整为${PROJECT_ROLE_LABELS[member.role]}`);
      invalidate();
    },
    onError: (error) => toast.error(memberErrorText(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (member: Member) =>
      api<undefined>(`/projects/${projectId}/members/${member.userId}`, { method: 'DELETE' }),
    onSuccess: (_data, member) => {
      toast.success(`已将 ${member.name} 移出项目`);
      setRemoveTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(memberErrorText(error)),
  });

  const members = membersQuery.data?.items ?? [];
  const roleOptions: ProjectRole[] =
    myRole === 'OWNER' ? ['ADMIN', 'MEMBER', 'VIEWER'] : ['MEMBER', 'VIEWER'];

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>成员</CardTitle>
          {membersQuery.data ? <Badge variant="muted">{members.length} 人</Badge> : null}
        </div>
        <CardDescription>
          调整成员角色或为成员单独配置权限覆盖；项目负责人拥有全部权限且不可被修改或移除。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {membersQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : membersQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>成员列表加载失败，请稍后重试。</span>
            <Button variant="outline" size="sm" onClick={() => void membersQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : members.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无成员
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    成员
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    角色
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    加入时间
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isOwnerRow = member.role === 'OWNER';
                  const adminLocked = member.role === 'ADMIN' && myRole !== 'OWNER';
                  const canEditRow = canManage && !isOwnerRow && !adminLocked;
                  const isSelf = member.userId === user?.id;
                  return (
                    <tr key={member.id} className="border-b last:border-0 align-middle">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={member.name}
                            src={member.avatarUrl}
                            color={avatarColor(member.userId)}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {member.name}
                              {isSelf ? (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  （你）
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {canEditRow ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              if (!assignableRole(value) || value === member.role) return;
                              roleMutation.mutate({ userId: member.userId, role: value });
                            }}
                            disabled={roleMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-8 w-[110px]"
                              aria-label={`修改 ${member.name} 的角色`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {PROJECT_ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={roleVariant(member.role)}>
                            {PROJECT_ROLE_LABELS[member.role]}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-muted-foreground">
                        {formatDate(member.joinedAt)}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPermissionTarget(member)}
                            disabled={!canManage}
                            title={canManage ? undefined : '需要成员管理权限'}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                            权限覆盖
                          </Button>
                          {canEditRow ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              aria-label={`移除成员 ${member.name}`}
                              onClick={() => setRemoveTarget(member)}
                              disabled={removeMutation.isPending}
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {archived
            ? '项目已归档，成员管理已停用。'
            : canManage
              ? '管理员不能管理其他管理员；仅项目负责人可以授予管理员角色。'
              : '你没有成员管理权限，当前为只读视图。'}
        </p>
      </CardContent>

      {permissionTarget ? (
        <MemberPermissionsDialog
          projectId={projectId}
          member={permissionTarget}
          open
          onOpenChange={(open) => {
            if (!open) setPermissionTarget(null);
          }}
        />
      ) : null}

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除成员</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `确定将 ${removeTarget.name}（${removeTarget.email}）移出项目吗？对方将立即失去项目访问权限。`
                : null}
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
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (removeTarget) removeMutation.mutate(removeTarget);
              }}
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              )}
              确认移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
