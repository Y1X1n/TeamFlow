import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const APP_TIME_ZONE = 'Asia/Shanghai';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 仅接受站内绝对路径，避免开放重定向或回到登录页形成循环。 */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /%(?:2f|5c)/i.test(value)
  ) {
    return '/';
  }
  let url: URL;
  try {
    url = new URL(value, 'https://teamflow.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://teamflow.local') return '/';
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  if (
    path === '/login' ||
    path.startsWith('/login?') ||
    path === '/register' ||
    path.startsWith('/register?')
  ) {
    return '/';
  }
  return path;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 返回上海时区当天 [00:00, 24:00) 对应的瞬时，供“今天”筛选使用。 */
export function shanghaiDayRange(now: Date = new Date()): { start: number; end: number } {
  const validNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(validNow);
  const start = new Date(`${dateKey}T00:00:00+08:00`).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 - 1 };
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export function isOverdue(dueDate: string | null, completedAt: string | null): boolean {
  if (!dueDate || completedAt) return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
