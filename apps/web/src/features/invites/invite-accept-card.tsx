'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  FolderKanban,
  Loader2,
  Mail,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import type { InvitePreview, Project } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

interface InvitePageErrorInfo {
  title: string;
  description: string;
  retry: boolean;
}

function previewErrorInfo(error: unknown): InvitePageErrorInfo {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVITE_EXPIRED':
        return {
          title: '邀请已过期',
          description: '该邀请链接已超过有效期，请联系项目管理员重新发送邀请。',
          retry: false,
        };
      case 'INVITE_REVOKED':
        return {
          title: '邀请已被撤销',
          description: '项目管理员已撤销该邀请，请联系管理员重新邀请你。',
          retry: false,
        };
      case 'INVITE_USED':
        return {
          title: '邀请已被使用',
          description: '该邀请链接已经使用过，无法再次接受。',
          retry: false,
        };
      case 'NOT_FOUND':
        return {
          title: '邀请链接无效',
          description: '请确认链接完整无误，或联系项目管理员重新发送邀请。',
          retry: false,
        };
      case 'PROJECT_ARCHIVED':
        return {
          title: '项目已归档',
          description: '该项目当前已归档，暂时无法加入。',
          retry: false,
        };
      default:
        return {
          title: '无法加载邀请',
          description: error.message,
          retry: error.status >= 500,
        };
    }
  }
  return {
    title: '无法加载邀请',
    description: '网络异常，请稍后重试。',
    retry: true,
  };
}

interface AcceptErrorInfo {
  title: string;
  description: string;
  code: string | null;
}

function acceptErrorInfo(
  error: unknown,
  preview: InvitePreview | undefined,
  currentEmail: string | null,
): AcceptErrorInfo {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVITE_EMAIL_MISMATCH':
        return {
          title: '邮箱不匹配',
          description: `该邀请发送给 ${preview?.email ?? '指定邮箱'}，而你当前登录的是 ${
            currentEmail ?? '其他账号'
          }。请退出后使用受邀邮箱登录再接受邀请。`,
          code: error.code,
        };
      case 'INVITE_EXPIRED':
        return {
          title: '邀请已过期',
          description: '该邀请链接已超过有效期，请联系项目管理员重新发送邀请。',
          code: error.code,
        };
      case 'INVITE_REVOKED':
        return {
          title: '邀请已被撤销',
          description: '项目管理员已撤销该邀请，请联系管理员重新邀请你。',
          code: error.code,
        };
      case 'INVITE_USED':
        return {
          title: '邀请已被使用',
          description: '该邀请链接已经使用过，无法再次接受。',
          code: error.code,
        };
      case 'ALREADY_MEMBER':
        return {
          title: '你已是项目成员',
          description: '无需再次接受邀请，可以直接进入项目。',
          code: error.code,
        };
      case 'PROJECT_ARCHIVED':
        return {
          title: '项目已归档',
          description: '该项目当前已归档，暂时无法加入。',
          code: error.code,
        };
      default:
        return {
          title: '接受邀请失败',
          description: error.message,
          code: error.code,
        };
    }
  }
  return {
    title: '接受邀请失败',
    description: '网络异常，请稍后重试。',
    code: null,
  };
}

export function InviteAcceptCard({ token }: { token: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const previewQuery = useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      api<Project>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
    onSuccess: (project) => {
      toast.success(`已加入「${project.name}」`);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${project.id}`);
    },
  });

  const preview = previewQuery.data;
  const currentEmail = user?.email ?? null;
  const emailMismatch = Boolean(
    preview && currentEmail && preview.email.toLowerCase() !== currentEmail.toLowerCase(),
  );

  if (previewQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (previewQuery.isError || !preview) {
    const info = previewErrorInfo(previewQuery.error);
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto h-9 w-9 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">{info.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          {info.retry ? (
            <Button variant="outline" onClick={() => void previewQuery.refetch()}>
              重试
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/">返回工作台</Link>
          </Button>
        </div>
      </div>
    );
  }

  const acceptError = acceptMutation.error
    ? acceptErrorInfo(acceptMutation.error, preview, currentEmail)
    : null;

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="h-2" style={{ backgroundColor: preview.projectColor }} aria-hidden="true" />
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: preview.projectColor }}
            aria-hidden="true"
          >
            <FolderKanban className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold">{preview.projectName}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">邀请你加入项目</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              邀请人
            </dt>
            <dd className="font-medium">{preview.inviterName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">我的角色</dt>
            <dd>
              <Badge>{PROJECT_ROLE_LABELS[preview.role]}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-4 w-4" aria-hidden="true" />
              受邀邮箱
            </dt>
            <dd className="min-w-0 truncate font-medium">{preview.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              有效期至
            </dt>
            <dd className="text-muted-foreground">{formatDateTime(preview.expiresAt)}</dd>
          </div>
        </dl>

        {emailMismatch && !acceptError ? (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
            role="status"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              当前登录账号 {currentEmail} 与邀请邮箱 {preview.email}{' '}
              不一致，需使用受邀邮箱登录后才能接受邀请。
            </span>
          </div>
        ) : null}

        {acceptError ? (
          <div
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            role="alert"
          >
            <p className="text-sm font-medium text-destructive">{acceptError.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{acceptError.description}</p>
            {acceptError.code === 'ALREADY_MEMBER' ? (
              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                <Link href={`/projects/${preview.projectId}`}>前往项目</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <Button
          className="mt-5 w-full"
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending || acceptMutation.isSuccess}
        >
          {acceptMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          {acceptMutation.isSuccess ? '已加入，正在跳转…' : '接受邀请'}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          接受后你将以「{PROJECT_ROLE_LABELS[preview.role]}」角色加入该项目。
        </p>
      </div>
    </div>
  );
}
