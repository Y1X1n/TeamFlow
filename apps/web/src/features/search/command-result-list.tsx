'use client';

import { AlertTriangle, Search } from 'lucide-react';
import { useEffect } from 'react';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarColor, cn } from '@/lib/utils';
import type { CommandEntry, CommandGroup } from './command-items';

interface CommandResultListProps {
  listboxId: string;
  groups: CommandGroup[];
  entries: CommandEntry[];
  activeIndex: number;
  term: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  onActiveChange: (index: number) => void;
  onSelect: (entry: CommandEntry) => void;
}

export function CommandResultList({
  listboxId,
  groups,
  entries,
  activeIndex,
  term,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onActiveChange,
  onSelect,
}: CommandResultListProps) {
  useEffect(() => {
    if (activeIndex < 0) return;
    const node = document.getElementById(`${listboxId}-option-${activeIndex}`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, entries.length, listboxId]);

  if (isLoading) {
    return (
      <div role="status" aria-label="正在搜索" className="space-y-2 p-3">
        <span className="sr-only">正在搜索…</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-1 py-1.5" aria-hidden="true">
            <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Search className="h-5 w-5" aria-hidden="true" />
        </span>
        <p>没有找到与「{term}」相关的项目、任务或成员。</p>
        <p className="text-xs">换个关键词试试，例如项目名、任务标题或成员邮箱。</p>
      </div>
    );
  }

  const indexById = new Map(entries.map((entry, index) => [entry.id, index] as const));

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="搜索结果"
      className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain px-2 py-2 scrollbar-thin"
    >
      {groups.map((group) => (
        <div key={group.key} role="presentation" className="mb-1">
          <div
            role="presentation"
            className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {group.label}
          </div>
          <div role="presentation">
            {group.entries.map((entry) => {
              const index = indexById.get(entry.id) ?? 0;
              const active = index === activeIndex;
              return (
                <div
                  key={entry.id}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(entry)}
                  onMouseEnter={() => onActiveChange(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  {entry.avatar ? (
                    <UserAvatar
                      name={entry.avatar.name}
                      src={entry.avatar.src}
                      color={avatarColor(entry.id)}
                      className="h-6 w-6 shrink-0 text-[10px]"
                    />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color ?? 'currentColor' }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.label}</span>
                    <span
                      className={cn(
                        'block truncate text-xs',
                        active ? 'text-accent-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {entry.description}
                    </span>
                  </span>
                  {entry.badge ? (
                    <span
                      className={cn(
                        'shrink-0 text-[11px]',
                        active ? 'text-accent-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {entry.badge}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
