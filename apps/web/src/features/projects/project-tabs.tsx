'use client';

import { BarChart3, FileText, History, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useSlidingIndicator } from '@/hooks/use-sliding-indicator';
import { cn } from '@/lib/utils';

const TABS = [
  { segment: '', label: '看板', icon: LayoutDashboard },
  { segment: 'overview', label: '概览', icon: BarChart3 },
  { segment: 'timeline', label: '时间线', icon: History },
  { segment: 'reports', label: '周报', icon: FileText },
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

  return (
    <nav
      ref={containerRef}
      aria-label="项目导航"
      className={cn('relative flex flex-wrap items-center gap-0.5 border-b', className)}
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
              '-mb-px inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
          'pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-primary will-change-transform',
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
