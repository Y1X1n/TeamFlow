'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Camera,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { avatarColor, cn, formatDate } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotificationPreferencesDialog } from '@/features/notifications/notification-preferences-dialog';
import { prepareAvatar } from '@/features/settings/avatar';

function passwordErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CURRENT_PASSWORD') return '当前密码不正确';
    if (error.code === 'VALIDATION_ERROR') return error.message;
    return error.message;
  }
  return '密码修改失败，请稍后重试';
}

export default function AccountSettingsPage() {
  const { user, updateUser, logout } = useAuth();
  if (!user) return null;
  return <AccountSettingsContent user={user} updateUser={updateUser} logout={logout} />;
}

function AccountSettingsContent({
  user,
  updateUser,
  logout,
}: {
  user: User;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);
  const [dragActive, setDragActive] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    setName(user.name);
    setAvatar(user.avatarUrl);
  }, [user.id, user.name, user.avatarUrl]);

  const nameDirty = name.trim() !== user.name;
  const avatarDirty = avatar !== user.avatarUrl;
  const dirty = nameDirty || avatarDirty;
  const nameError = name.trim().length === 0 ? '昵称不能为空' : null;

  const saveProfile = useMutation<User, Error, void>({
    mutationFn: () =>
      api<User>('/users/me', {
        method: 'PATCH',
        body: { name: name.trim(), avatarUrl: avatar },
      }),
    onSuccess: (updated) => {
      updateUser(updated);
      setName(updated.name);
      setAvatar(updated.avatarUrl);
      void queryClient.invalidateQueries();
      toast.success('个人资料已更新');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后重试'),
  });

  const changePassword = useMutation<{ changed: boolean }, Error, void>({
    mutationFn: () =>
      api<{ changed: boolean }>('/users/me/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    onSuccess: () => {
      toast.success('密码已更新，请使用新密码重新登录');
      void logout().then(() => router.replace('/login'));
    },
    onError: (error) => toast.error(passwordErrorText(error)),
  });

  async function applyAvatarFile(file: File) {
    try {
      const dataUrl = await prepareAvatar(file);
      setAvatar(dataUrl);
      toast.success('头像已准备好，点击保存后生效');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '头像处理失败');
    }
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void applyAvatarFile(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void applyAvatarFile(file);
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameError || !dirty || saveProfile.isPending) return;
    saveProfile.mutate();
  }

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordReady =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    !passwordMismatch;

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordReady || changePassword.isPending) return;
    changePassword.mutate();
  }

  const fullAvatar = avatar;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">账号设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理头像、昵称、登录安全与通知偏好。</p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle>个人资料</CardTitle>
          <CardDescription>头像与昵称会展示在项目成员、任务卡片和评论中。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitProfile} className="flex flex-col gap-7 md:flex-row">
            <div className="flex w-full shrink-0 flex-col items-center gap-3 md:w-48">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label="选择头像图片"
                onChange={handleFileSelected}
              />
              <button
                type="button"
                aria-label="更换头像"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={cn(
                  'group relative overflow-hidden rounded-full ring-offset-4 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  dragActive && 'ring-2 ring-primary ring-offset-2',
                )}
              >
                <UserAvatar
                  name={name.trim() || user.name}
                  src={fullAvatar}
                  color={avatarColor(user.id)}
                  className="h-28 w-28 text-3xl"
                />
                <span
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                    dragActive && 'opacity-100',
                  )}
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px]">{dragActive ? '松开上传' : '更换头像'}</span>
                </span>
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                点击或拖入图片
                <br />
                JPG / PNG / WebP，≤5MB，自动裁剪
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  选择图片
                </Button>
                {fullAvatar ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setAvatar(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    移除
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">昵称</Label>
                  <Input
                    id="account-name"
                    value={name}
                    maxLength={40}
                    autoComplete="nickname"
                    onChange={(event) => setName(event.target.value)}
                    aria-invalid={Boolean(nameError)}
                  />
                  <p className="text-[11px] text-muted-foreground">1–40 个字符，可随时修改。</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-email">登录邮箱</Label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="account-email"
                      value={user.email}
                      readOnly
                      disabled
                      className="pl-8"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">邮箱用于登录，暂不支持修改。</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="muted">个人账号</Badge>
                <span>注册于 {formatDate(user.createdAt)}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {nameError ? nameError : dirty ? '有未保存的更改' : '个人资料已是最新'}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!dirty || saveProfile.isPending}
                    onClick={() => {
                      setName(user.name);
                      setAvatar(user.avatarUrl);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    撤销
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!dirty || Boolean(nameError) || saveProfile.isPending}
                  >
                    {saveProfile.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {saveProfile.isPending ? '保存中…' : '保存资料'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              登录与安全
            </CardTitle>
            <CardDescription>修改密码后，其他设备的登录状态会失效。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPassword} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">当前密码</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">至少 8 位，包含字母和数字。</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={passwordMismatch}
                />
                {passwordMismatch ? (
                  <p role="alert" className="text-[11px] text-destructive">
                    两次输入的新密码不一致
                  </p>
                ) : null}
              </div>
              <Button type="submit" size="sm" disabled={!passwordReady || changePassword.isPending}>
                {changePassword.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {changePassword.isPending ? '更新中…' : '更新密码'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
              通知与快捷入口
            </CardTitle>
            <CardDescription>控制提醒类型，快速回到常用页面。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <button
              type="button"
              onClick={() => setPreferencesOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">通知偏好</span>
                <span className="block text-xs text-muted-foreground">
                  按类型开关站内通知与实时提醒
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>

            <Link
              href="/my-tasks"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">我的任务</span>
                <span className="block text-xs text-muted-foreground">
                  查看待办、逾期与已完成任务
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link>

            <Link
              href="/inbox"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Mail className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">通知中心</span>
                <span className="block text-xs text-muted-foreground">查看站内提醒与未读消息</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <NotificationPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </div>
  );
}
