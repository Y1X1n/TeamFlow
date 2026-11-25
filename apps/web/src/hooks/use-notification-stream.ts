'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  isNotificationType,
  notificationSummary,
} from '@/features/notifications/notification-meta';
import { refreshAccessToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { queryKeys } from '@/lib/query-keys';
import { getAccessToken } from '@/lib/token';
import type { Notification } from '@/lib/types';

const STREAM_URL = `${API_BASE}/notifications/stream`;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_BACKOFF_STEPS = 5;
const MAX_AUTH_RETRIES = 2;

function parseNotification(value: unknown): Notification | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { id, type, payload, read, readAt, createdAt } = record;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof type !== 'string' || !isNotificationType(type)) return null;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  return {
    id,
    type,
    payload: payload as Record<string, unknown>,
    read: read === true,
    readAt: typeof readAt === 'string' ? readAt : null,
    createdAt: typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
  };
}

/**
 * 订阅当前登录用户的实时通知。
 *
 * 使用 fetch + AbortController 读取 SSE（EventSource 无法携带 Authorization 头），
 * 收到通知后弹出页面内 Toast 并失效相关查询；断线按指数退避重连，401 时先刷新令牌。
 * 不启用浏览器原生 Notification API。
 */
export function useNotificationStream(enabled = true): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let disposed = false;
    let connecting = false;
    let attempt = 0;
    let authRetries = 0;
    let requestId = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function clearReconnectTimer() {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (disposed) return;
      clearReconnectTimer();
      const step = Math.min(attempt, MAX_BACKOFF_STEPS);
      const base = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** step);
      const delay = Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(BASE_RETRY_DELAY_MS, Math.round(base * (0.8 + Math.random() * 0.4))),
      );
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    }

    function handleNotification(notification: Notification) {
      const summary = notificationSummary(notification);
      toast(summary.title, {
        description: summary.detail ?? undefined,
        duration: 6_000,
      });

      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (pathnameRef.current === '/inbox') {
        void queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' });
      }
    }

    function flushEvent(eventName: string, dataLines: string[]) {
      if (eventName !== 'notification' || dataLines.length === 0) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      const notification = parseNotification(parsed);
      if (notification) handleNotification(notification);
    }

    async function consume(stream: ReadableStream<Uint8Array>, stale: () => boolean) {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines: string[] = [];

      try {
        while (!stale()) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const rawLine = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

            if (line === '') {
              flushEvent(eventName, dataLines);
              eventName = 'message';
              dataLines = [];
            } else if (!line.startsWith(':')) {
              const separator = line.indexOf(':');
              const field = separator === -1 ? line : line.slice(0, separator);
              let fieldValue = separator === -1 ? '' : line.slice(separator + 1);
              if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);
              if (field === 'event') {
                eventName = fieldValue;
              } else if (field === 'data') {
                dataLines.push(fieldValue);
              }
            }

            newlineIndex = buffer.indexOf('\n');
          }
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // 流已被中断或释放，忽略清理异常
        }
      }
    }

    async function connect(): Promise<void> {
      if (disposed || connecting) return;
      connecting = true;
      const currentRequest = ++requestId;
      const stale = () => disposed || currentRequest !== requestId;

      try {
        while (!stale()) {
          const token = getAccessToken();
          const headers: Record<string, string> = { accept: 'text/event-stream' };
          if (token) headers.authorization = `Bearer ${token}`;

          const response = await fetch(STREAM_URL, {
            method: 'GET',
            headers,
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (stale()) return;

          if (response.status === 401) {
            if (authRetries >= MAX_AUTH_RETRIES) break;
            authRetries += 1;
            const refreshed = await refreshAccessToken();
            if (stale() || !refreshed) break;
            continue;
          }

          if (!response.ok || !response.body) break;

          authRetries = 0;
          attempt = 0;
          await consume(response.body, stale);
          break;
        }
      } catch {
        // 网络错误或连接被中断：交给下方退避重连（销毁时不再重试）
      } finally {
        if (currentRequest === requestId) connecting = false;
      }

      if (stale()) return;
      scheduleReconnect();
    }

    void connect();

    return () => {
      disposed = true;
      requestId += 1;
      clearReconnectTimer();
      controller.abort();
    };
  }, [enabled, queryClient]);
}
