'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, MailPlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS, type InviteRole, type ProjectRole } from '@teamflow/shared/enums';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Invite } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

interface InvitesCardProps {
  projectId: string;
  myRole: ProjectRole;
  canInvite: boolean;
  archived: boolean;
}

interface InviteCreatedResponse {
  invite: Invite;
  inviteUrl: string;
}

interface CreatedInvite {
  url: string;
  email: string;
  role: InviteRole;
}

function isInviteRole(value: string): value is InviteRole {
  return value === 'ADMIN' || value === 'MEMBER' || value === 'VIEWER';
}

function normalizeInviteRole(role: ProjectRole): InviteRole {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'VIEWER') return 'VIEWER';
  return 'MEMBER';
}

function inviteRoleVariant(role: InviteRole): NonNullable<BadgeProps['variant']> {
  switch (role) {
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'secondary';
    default:
      return 'muted';
  }
}

function inviteErrorText(error: unknown, role?: InviteRole): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return role === 'ADMIN' ? '仅项目负责人可以邀请管理员。' : '你没有邀请成员的权限。';
      case 'ALREADY_MEMBER':
        return '该邮箱对应的用户已经是项目成员。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法创建邀请。';
      case 'VALIDATION_ERROR':
        return error.message;
      default:
        return error.message;
    }
  }
  return '创建邀请失败，请稍后重试。';
}

export function InvitesCard({ projectId, myRole, canInvite, archived }: InvitesCardProps) {
  const queryClient = useQueryClient();
  const [emailInput, setEmailInput] = useState('');
  const [role, setRole] = useState<InviteRole>('MEMBER');
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const invitesQuery = useQuery({
    queryKey: queryKeys.invites(projectId),
    queryFn: () => api<{ items: Invite[] }>(`/projects/${projectId}/invites`),
    enabled: canInvite,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.invites(projectId) });
  }

  const createMutation = useMutation({
    mutationFn: (input: { email: string; role: InviteRole }) =>
      api<InviteCreatedResponse>(`/projects/${projectId}/invites`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (result) => {
      toast.success(`已为 ${result.invite.email} 创建邀请`);
      setCreated({
        url: result.inviteUrl,
        email: result.invite.email,
        role: normalizeInviteRole(result.invite.role),
      });
      setEmailInput('');
      invalidate();
    },
    onError: (error, variables) => toast.error(inviteErrorText(error, variables.role)),
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) =>
      api<undefined>(`/projects/${projectId}/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('邀请已撤销');
      invalidate();
    },
    onError: (error) => toast.error(inviteErrorText(error)),
  });

  const roleOptions: InviteRole[] =
    myRole === 'OWNER' ? ['ADMIN', 'MEMBER', 'VIEWER'] : ['MEMBER', 'VIEWER'];
  const invites = invitesQuery.data?.items ?? [];
  const readOnly = archived;

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      toast.success('邀请链接已复制');
    } catch {
      toast.error('复制失败，请手动选择链接复制');
    }
  }

  if (!canInvite) return null;

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle>邀请成员</CardTitle>
        <CardDescription>
          邀请链接 7 天内有效且仅可使用一次；创建后复制链接发送给对方即可。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const email = emailInput.trim();
            if (!email) {
              toast.error('请输入受邀成员的邮箱');
              return;
            }
            createMutation.mutate({ email, role });
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="invite-email">邮箱</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                placeholder="teammate@example.com"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                disabled={readOnly || createMutation.isPending}
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-[140px]">
              <Label htmlFor="invite-role">角色</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (isInviteRole(value)) setRole(value);
                }}
                disabled={readOnly || createMutation.isPending}
              >
                <SelectTrigger id="invite-role" aria-label="邀请角色">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PROJECT_ROLE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={readOnly || createMutation.isPending || !emailInput.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <MailPlus className="h-4 w-4" aria-hidden="true" />
              )}
              创建邀请
            </Button>
          </div>
          {myRole !== 'OWNER' ? (
            <p className="text-xs text-muted-foreground">仅项目负责人可以邀请管理员。</p>
          ) : null}
        </form>

        {created ? (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium">
              已为 {created.email} 生成邀请（
              {PROJECT_ROLE_LABELS[created.role]}）
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={created.url}
                aria-label="邀请链接"
                className="bg-background font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                复制链接
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              链接包含一次性凭证，请只发送给受邀成员。
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="text-sm font-medium">待处理邀请</h3>
          {invitesQuery.isPending ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : invitesQuery.isError ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span>邀请列表加载失败，请稍后重试。</span>
              <Button variant="outline" size="sm" onClick={() => void invitesQuery.refetch()}>
                重试
              </Button>
            </div>
          ) : invites.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              暂无待处理的邀请
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      有效期至 {formatDateTime(invite.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={inviteRoleVariant(normalizeInviteRole(invite.role))}>
                      {PROJECT_ROLE_LABELS[invite.role]}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={readOnly || revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(invite.id)}
                    >
                      {revokeMutation.isPending && revokeMutation.variables === invite.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <X className="h-4 w-4" aria-hidden="true" />
                      )}
                      撤销
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {readOnly ? (
          <p className="text-xs text-muted-foreground">项目已归档，无法创建或撤销邀请。</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
