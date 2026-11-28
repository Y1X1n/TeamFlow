'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CommandPalette } from '@/components/command-palette';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import { useSlidingIndicator } from '@/hooks/use-sliding-indicator';
import { cn, avatarColor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const APP_NAV = [
  { href: '/', label: '工作台', icon: LayoutDashboard },
  { href: '/my-tasks', label: '我的任务', icon: ClipboardList },
  { href: '/inbox', label: '通知', icon: Inbox },
  { href: '/settings', label: '设置', icon: Settings },
];

export function AppShell({ children, fluid }: { children: ReactNode; fluid?: boolean }) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fluidLayout = fluid ?? /^\/projects\/[^/]+$/.test(pathname);
  const activeNavHref = APP_NAV.find((item) =>
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  )?.href;
  const {
    containerRef: navRef,
    registerItem: registerNavItem,
    indicator: navIndicator,
  } = useSlidingIndicator(activeNavHref);

  useEffect(() => {
    if (status === 'guest') {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, router]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data: unread } = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    enabled: status === 'authenticated',
    refetchInterval: 30_000,
  });

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在加载工作台…
      </div>
    );
  }

  return (
    <div className="px-safe min-h-screen bg-background">
      <header className="pt-safe sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div
          className={cn(
            'mx-auto flex h-12 items-center gap-3 px-3 md:h-14 md:gap-4 md:px-4',
            fluidLayout ? 'max-w-none' : 'max-w-6xl',
          )}
        >
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-primary text-sm text-primary-foreground shadow-sm">
              T
            </span>
            <span>TeamFlow</span>
          </Link>
          <nav
            ref={navRef}
            aria-label="主导航"
            className="relative ml-4 hidden shrink-0 items-center gap-1 md:flex"
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute left-0 top-0 h-8 rounded-md bg-accent shadow-sm will-change-transform',
                navIndicator.measured ? 'opacity-100' : 'opacity-0',
                navIndicator.animated
                  ? 'motion-safe:transition-[transform,width,opacity] motion-safe:duration-[250ms] motion-safe:ease-out motion-reduce:transition-none'
                  : 'transition-none',
              )}
              style={{
                transform: `translateX(${navIndicator.left}px)`,
                width: navIndicator.width,
              }}
            />
            {APP_NAV.map((item) => {
              const active = item.href === activeNavHref;
              return (
                <Link
                  key={item.href}
                  ref={(node) => registerNavItem(item.href, node)}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    'relative z-10 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors duration-200 sm:px-3',
                    active
                      ? 'text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden whitespace-nowrap lg:inline">{item.label}</span>
                  {item.href === '/inbox' && (unread?.count ?? 0) > 0 ? (
                    <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {unread?.count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              aria-label="搜索（Ctrl+K 或 ⌘K）"
              aria-keyshortcuts="Control+K Meta+K"
              className="gap-2 text-muted-foreground"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">搜索</span>
              <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
                Ctrl K
              </kbd>
            </Button>
            <Button variant="ghost" size="icon" asChild className="hidden md:inline-flex">
              <Link href="/inbox" aria-label="通知">
                <Bell className="h-4 w-4" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="账户菜单"
                  title={user.name}
                  className="group flex items-center gap-1 rounded-full p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar
                    name={user.name}
                    src={user.avatarUrl}
                    color={avatarColor(user.id)}
                    className="h-9 w-9 text-xs ring-2 ring-background transition group-hover:ring-border"
                  />
                  <ChevronDown
                    className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 sm:block"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
                <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      name={user.name}
                      src={user.avatarUrl}
                      color={avatarColor(user.id)}
                      className="h-12 w-12 text-sm ring-2 ring-background"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">已登录 TeamFlow</p>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                      个人资料与设置
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-tasks" className="cursor-pointer">
                      <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      我的任务
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/inbox" className="cursor-pointer">
                      <Inbox className="h-4 w-4" aria-hidden="true" />
                      通知中心
                      {unread?.count ? (
                        <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                          {unread.count}
                        </span>
                      ) : (
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="my-1.5 h-px bg-border" />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => {
                    void logout().then(() => router.replace('/login'));
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main
        className={cn(
          'mx-auto px-4 py-4 pb-safe-nav md:py-6 md:pb-6',
          fluidLayout ? 'max-w-none' : 'max-w-6xl',
        )}
      >
        {children}
      </main>
      <footer className="mx-auto hidden max-w-6xl px-4 pb-6 text-xs text-muted-foreground md:block">
        TeamFlow MVP · 实时看板 · 细粒度权限 · 自动化周报
      </footer>

      {/* 移动端底部 Tab；桌面端由顶部导航承载。 */}
      <nav
        aria-label="移动端主导航"
        className="px-safe fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-safe shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden"
      >
        <div className="flex items-stretch justify-around px-2">
          {APP_NAV.map((item) => {
            const active = item.href === activeNavHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7 w-10 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary/10',
                  )}
                >
                  <item.icon className="h-[21px] w-[21px]" aria-hidden="true" />
                  {item.href === '/inbox' && (unread?.count ?? 0) > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full bg-primary px-1 text-[9px] leading-[15px] text-primary-foreground">
                      {(unread?.count ?? 0) > 9 ? '9+' : unread?.count}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function CreateProjectButton() {
  return (
    <Button asChild size="sm">
      <Link href="/?create=1">
        <Plus className="h-4 w-4" />
        新建项目
      </Link>
    </Button>
  );
}
