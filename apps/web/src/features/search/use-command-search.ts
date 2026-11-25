'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { SearchResults } from '@/lib/types';

export const SEARCH_QUERY_MAX = 50;
export const SEARCH_RESULT_LIMIT = 6;
const DEBOUNCE_MS = 250;

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export interface CommandSearchState {
  /** 输入框中的关键词（已去除首尾空白并截断到 50 字） */
  term: string;
  /** 经过 250ms 防抖后实际发起请求的关键词 */
  debouncedTerm: string;
  results: SearchResults | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useCommandSearch(rawQuery: string): CommandSearchState {
  const term = rawQuery.trim().slice(0, SEARCH_QUERY_MAX);
  const debouncedTerm = useDebouncedValue(term, DEBOUNCE_MS);

  const query = useQuery({
    queryKey: queryKeys.search(debouncedTerm),
    queryFn: () =>
      api<SearchResults>(
        `/search?q=${encodeURIComponent(debouncedTerm)}&limit=${SEARCH_RESULT_LIMIT}`,
      ),
    enabled: debouncedTerm.length > 0,
    staleTime: 30_000,
  });

  return {
    term,
    debouncedTerm,
    results: query.data,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
