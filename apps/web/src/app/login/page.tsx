'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@teamflow/shared/schemas';
import type { LoginInput } from '@teamflow/shared/schemas';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { safeNextPath } from '@/lib/utils';

const DEMO_ACCOUNTS = (process.env.NEXT_PUBLIC_DEMO_ACCOUNTS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [label, email] = entry.split(':');
    return { label: label?.trim() ?? '', email: email?.trim() ?? '' };
  })
  .filter((account) => account.label.length > 0 && account.email.length > 0);

const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const SHOW_DEMO = DEMO_ACCOUNTS.length > 0 && DEMO_PASSWORD.length > 0;

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: '实时看板',
    text: '拖拽卡片、在线协作，项目进度一目了然。',
  },
  {
    icon: ShieldCheck,
    title: '细粒度权限',
    text: '负责人、管理员、成员与只读角色按需配置。',
  },
  {
    icon: Zap,
    title: '自动化提醒',
    text: '逾期提醒与每周周报自动送达，不再遗漏。',
  },
] as const;

function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return '邮箱或密码不正确，请重试。';
    if (error.code === 'RATE_LIMITED') return '尝试过于频繁，请稍后再试。';
    return error.message;
  }
  return '登录失败，请检查网络后重试。';
}

function emailMessage(message?: string): string | undefined {
  return message ? '请输入有效的邮箱地址。' : undefined;
}

function passwordMessage(message?: string): string | undefined {
  if (!message) return undefined;
  if (message.includes('at least')) return '请输入密码。';
  if (message.includes('at most')) return '密码不能超过 72 位字符。';
  return message;
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 p-12 text-white lg:flex lg:flex-col">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sky-300/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">T</span>
        TeamFlow
      </div>
      <div className="relative mt-16 max-w-md">
        <h2 className="text-3xl font-semibold leading-snug">
          让团队协作
          <br />
          简单而高效
        </h2>
        <p className="mt-3 text-sm leading-6 text-indigo-100">
          实时看板、细粒度权限与自动化提醒，帮助学生团队与小型工作室把精力用在真正重要的事上。
        </p>
        <ul className="mt-10 space-y-6">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <feature.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium">{feature.title}</span>
                <span className="mt-0.5 block text-xs text-indigo-100">{feature.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative mt-auto pt-10 text-xs text-indigo-100/80">
        TeamFlow MVP · 实时看板 · 细粒度权限 · 自动化周报
      </p>
    </aside>
  );
}

function LoginPageContent() {
  const { login, status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });
  const submitting = form.formState.isSubmitting;
  const errors = form.formState.errors;

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  async function onSubmit(values: LoginInput) {
    try {
      await login(values.email, values.password);
      router.replace(next);
    } catch (error) {
      toast.error(authErrorMessage(error));
    }
  }

  function fillDemo(email: string) {
    form.setValue('email', email, { shouldValidate: true, shouldDirty: true });
    form.setValue('password', DEMO_PASSWORD, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 text-lg font-semibold lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              T
            </span>
            TeamFlow
          </div>

          <div className="mt-8 lg:mt-0">
            <h1 className="text-2xl font-semibold tracking-tight">欢迎回来</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              登录你的 TeamFlow 账号，继续推进团队项目。
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled={submitting}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
              {errors.email ? (
                <p id="email-error" className="text-xs text-destructive" role="alert">
                  {emailMessage(errors.email.message)}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  className="pr-10"
                  disabled={submitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password ? (
                <p id="password-error" className="text-xs text-destructive" role="alert">
                  {passwordMessage(errors.password.message)}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  登录中…
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          {SHOW_DEMO ? (
            <Card className="mt-6 border-dashed bg-muted/40 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">演示账号</CardTitle>
                <CardDescription className="text-xs">
                  密码均为 <span className="font-mono">{DEMO_PASSWORD}</span>，点击按钮可一键填入。
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <Button
                      key={account.email}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fillDemo(account.email)}
                      disabled={submitting}
                      aria-label={`填入演示账号 ${account.label}（${account.email}）`}
                    >
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      一键填入 {account.label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {DEMO_ACCOUNTS.map((account) => account.email).join(' / ')}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            还没有账号？
            <Link
              href={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              创建账号
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
