'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { buildCommandGroups, flattenCommandGroups } from '@/features/search/command-items';
import type { CommandEntry } from '@/features/search/command-items';
import { CommandResultList } from '@/features/search/command-result-list';
import { SEARCH_QUERY_MAX, useCommandSearch } from '@/features/search/use-command-search';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const LISTBOX_ID = 'command-palette-listbox';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const { term, debouncedTerm, results, isPending, isFetching, isError, error, refetch } =
    useCommandSearch(query);

  const groups = useMemo(() => buildCommandGroups(results), [results]);
  const entries = useMemo(() => flattenCommandGroups(groups), [groups]);

  const hasTerm = debouncedTerm.length > 0 && term.length > 0;
  const activeOptionIndex =
    entries.length > 0 ? Math.min(Math.max(activeIndex, 0), entries.length - 1) : -1;
  const isLoading = hasTerm && results === undefined && (isPending || isFetching);
  const showError = hasTerm && isError && results === undefined;
  const errorMessage = error instanceof ApiError ? error.message : '搜索失败，请稍后重试。';

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedTerm]);

  useEffect(() => {
    setActiveIndex((previous) => (entries.length > 0 ? Math.min(previous, entries.length - 1) : 0));
  }, [entries.length]);

  useEffect(() => {
    if (open && isError && debouncedTerm.length > 0) {
      toast.error(error instanceof ApiError ? error.message : '搜索失败，请稍后重试。');
    }
  }, [open, isError, error, debouncedTerm]);

  function selectEntry(entry: CommandEntry) {
    onOpenChange(false);
    router.push(entry.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((previous) => (previous + 1) % entries.length);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((previous) => (previous - 1 + entries.length) % entries.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      const entry = activeOptionIndex >= 0 ? entries[activeOptionIndex] : undefined;
      if (entry) {
        event.preventDefault();
        selectEntry(entry);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">全局搜索</DialogTitle>
        <DialogDescription className="sr-only">
          输入关键词搜索你有权限访问的项目、任务与成员，使用上下方向键选择，回车打开。
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索项目、任务或成员…"
            aria-label="搜索项目、任务或成员"
            role="combobox"
            aria-expanded={entries.length > 0}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              activeOptionIndex >= 0 ? `${LISTBOX_ID}-option-${activeOptionIndex}` : undefined
            }
            maxLength={SEARCH_QUERY_MAX}
            autoComplete="off"
            spellCheck={false}
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {hasTerm ? (
          <CommandResultList
            listboxId={LISTBOX_ID}
            groups={groups}
            entries={entries}
            activeIndex={activeOptionIndex}
            term={term}
            isLoading={isLoading}
            isError={showError}
            errorMessage={errorMessage}
            onRetry={refetch}
            onActiveChange={setActiveIndex}
            onSelect={selectEntry}
          />
        ) : (
          <div className="space-y-3 px-4 py-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">快速跳转</p>
            <p>搜索你参与的项目、任务标题，或按姓名 / 邮箱查找成员。</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                选择
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Enter</Kbd>
                打开
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Esc</Kbd>
                关闭
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span>每类最多 6 条结果</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground',
      )}
    >
      {children}
    </kbd>
  );
}
