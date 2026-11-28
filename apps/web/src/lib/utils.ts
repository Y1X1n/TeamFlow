import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
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
