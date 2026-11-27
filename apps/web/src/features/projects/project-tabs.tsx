'use client';

import {
  BarChart3,
  CalendarDays,
  FileText,
  History,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useSlidingIndicator } from '@/hooks/use-sliding-indicator';
import { cn } from '@/lib/utils';

const TABS = [
  { segment: '', label: '看板', icon: LayoutDashboard },
  { segment: 'overview', label: '概览', icon: BarChart3 },
  { segment: 'calendar', label: '日历', icon: CalendarDays },
  { segment: 'timeline', label: '时间线', icon: History },
  { segment: 'reports', label: '报告', icon: FileText },
  { segment: 'settings', label: '设置', icon: Settings },
] as const;

function isActivePath(pathname: string, href: string, segment: string): boolean {
  if (!segment) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProjectTabs({ projectId, className }: { projectId: string; className?: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        href: tab.segment ? `${base}/${tab.segment}` : base,
      })),
    [base],
  );
  const activeHref = tabs.find((tab) => isActivePath(pathname, tab.href, tab.segment))?.href;
  const { containerRef, registerItem, indicator } = useSlidingIndicator(activeHref);

  // 手机端横向滚动时，把当前激活 Tab 滚入可见区域。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeHref) return;
    container
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeHref, containerRef]);

  return (
    <nav
      ref={containerRef}
      aria-label="项目导航"
      className={cn(
        'relative flex items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b scrollbar-thin md:flex-wrap md:overflow-x-visible',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            ref={(node) => registerItem(tab.href, node)}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary will-change-transform',
          indicator.measured ? 'opacity-100' : 'opacity-0',
          indicator.animated
            ? 'motion-safe:transition-[transform,width,opacity] motion-safe:duration-[250ms] motion-safe:ease-out motion-reduce:transition-none'
            : 'transition-none',
        )}
        style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
      />
    </nav>
  );
}
