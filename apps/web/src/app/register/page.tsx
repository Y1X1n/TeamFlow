'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@teamflow/shared/schemas';
import type { RegisterInput } from '@teamflow/shared/schemas';
import { ArrowRight, Eye, EyeOff, LayoutDashboard, Loader2, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
    if (error.code === 'EMAIL_TAKEN') return '该邮箱已注册，请直接登录。';
    if (error.code === 'RATE_LIMITED') return '注册过于频繁，请稍后再试。';
    if (error.code === 'VALIDATION_ERROR') return '请检查填写的信息后重试。';
    return error.message;
  }
  return '注册失败，请检查网络后重试。';
}

function nameMessage(message?: string): string | undefined {
  return message ? '昵称不能为空，且不超过 40 个字符。' : undefined;
}

function emailMessage(message?: string): string | undefined {
  return message ? '请输入有效的邮箱地址。' : undefined;
}

function passwordMessage(message?: string): string | undefined {
  if (!message) return undefined;
  if (message.includes('at least 8')) return '密码至少需要 8 位字符。';
  if (message.includes('at most 72')) return '密码不能超过 72 位字符。';
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
          从第一个项目
          <br />
          开始高效协作
        </h2>
        <p className="mt-3 text-sm leading-6 text-indigo-100">
          注册即可创建项目、邀请伙伴、分配任务，让每一次协作都有迹可循。
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

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '' },
  });
  const submitting = form.formState.isSubmitting;
  const errors = form.formState.errors;

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  async function onSubmit(values: RegisterInput) {
    try {
      await register(values.name, values.email, values.password);
      toast.success('注册成功，欢迎加入 TeamFlow');
      router.replace('/');
    } catch (error) {
      toast.error(authErrorMessage(error));
    }
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
            <h1 className="text-2xl font-semibold tracking-tight">创建账号</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              免费加入 TeamFlow，几分钟内搭建你的第一个项目。
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                autoComplete="nickname"
                placeholder="你的名字或昵称"
                maxLength={40}
                disabled={submitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
                {...form.register('name')}
              />
              {errors.name ? (
                <p id="name-error" className="text-xs text-destructive" role="alert">
                  {nameMessage(errors.name.message)}
                </p>
              ) : null}
            </div>

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
                  autoComplete="new-password"
                  placeholder="设置登录密码"
                  className="pr-10"
                  disabled={submitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : 'password-hint'}
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
              ) : (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  8–72 位，需同时包含字母和数字。
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  注册中…
                </>
              ) : (
                <>
                  注册并进入工作台
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            已有账号？
            <Link
              href="/login"
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              直接登录
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
