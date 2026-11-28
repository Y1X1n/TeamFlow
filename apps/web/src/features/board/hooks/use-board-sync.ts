'use client';

import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { comparePositions } from '@teamflow/shared/fractional';
import { refreshAccessToken } from '@/lib/api';
import { collabUrl } from '@/lib/config';
import { queryKeys } from '@/lib/query-keys';
import { getAccessToken } from '@/lib/token';
import type { BoardData } from '@/lib/types';

export type BoardConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface BoardPresenceEntry {
  userId: string;
  draggingTaskId: string | null;
  selectedTaskId: string | null;
}

export interface UseBoardSyncOptions {
  projectId: string;
  userId: string | null;
  enabled: boolean;
  draggingTaskId: string | null;
  selectedTaskId: string | null;
  onConnectionStatusChange?: (status: BoardConnectionStatus) => void;
}

export interface BoardSyncState {
  connectionStatus: BoardConnectionStatus;
  presence: BoardPresenceEntry[];
  applyPositions: () => void;
}

interface TaskPositionEntry {
  columnId: string;
  position: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTaskPositions(value: unknown): Map<string, TaskPositionEntry> | null {
  if (!(value instanceof Y.Map)) return null;
  const map: Y.Map<unknown> = value;
  const result = new Map<string, TaskPositionEntry>();
  map.forEach((entry, key) => {
    if (typeof key !== 'string' || !isRecord(entry)) return;
    const columnId = entry.columnId;
    const position = entry.position;
    if (typeof columnId === 'string' && typeof position === 'string') {
      result.set(key, { columnId, position });
    }
  });
  return result;
}

function readColumnPositions(value: unknown): Map<string, string> | null {
  if (!(value instanceof Y.Map)) return null;
  const map: Y.Map<unknown> = value;
  const result = new Map<string, string>();
  map.forEach((entry, key) => {
    if (typeof key !== 'string' || !isRecord(entry)) return;
    const position = entry.position;
    if (typeof position === 'string') result.set(key, position);
  });
  return result;
}

function mapWebSocketStatus(status: WebSocketStatus): BoardConnectionStatus {
  switch (status) {
    case WebSocketStatus.Connected:
      return 'connected';
    case WebSocketStatus.Connecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

export function useBoardSync(options: UseBoardSyncOptions): BoardSyncState {
  const { projectId, userId, enabled, draggingTaskId, selectedTaskId, onConnectionStatusChange } =
    options;
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<BoardConnectionStatus>('connecting');
  const [presence, setPresence] = useState<BoardPresenceEntry[]>([]);
  const [sessionReady, setSessionReady] = useState(false);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const syncedRef = useRef(false);
  const authRetriedRef = useRef(false);
  const draggingRef = useRef(draggingTaskId);
  const selectedRef = useRef(selectedTaskId);
  draggingRef.current = draggingTaskId;
  selectedRef.current = selectedTaskId;

  const updateStatus = useCallback(
    (status: BoardConnectionStatus) => {
      setConnectionStatus(status);
      onConnectionStatusChange?.(status);
    },
    [onConnectionStatusChange],
  );

  const applyPositions = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    const boardMap = doc.getMap('board');
    const positions = readTaskPositions(boardMap.get('tasks'));
    const columnPositions = readColumnPositions(boardMap.get('columns'));
    if (!positions && !columnPositions) return;

    queryClient.setQueryData<BoardData>(queryKeys.board(projectId), (previous) => {
      if (!previous) return previous;
      let tasksChanged = false;
      const tasks = previous.tasks.map((task) => {
        const position = positions?.get(task.id);
        if (!position) return task;
        if (position.columnId === task.columnId && position.position === task.position) return task;
        tasksChanged = true;
        return { ...task, columnId: position.columnId, position: position.position };
      });

      let columns = previous.columns;
      if (columnPositions) {
        let columnsChanged = false;
        const merged = previous.columns.map((column) => {
          const nextPosition = columnPositions.get(column.id);
          if (!nextPosition || nextPosition === column.position) return column;
          columnsChanged = true;
          return { ...column, position: nextPosition };
        });
        if (columnsChanged) {
          columns = [...merged].sort(
            (a, b) => comparePositions(a.position, b.position) || a.id.localeCompare(b.id),
          );
        }
      }

      if (!tasksChanged && columns === previous.columns) return previous;
      return { ...previous, tasks, columns };
    });
  }, [projectId, queryClient]);

  const removeTasksFromCache = useCallback(
    (taskIds: string[]) => {
      if (taskIds.length === 0) return;
      const removed = new Set(taskIds);
      queryClient.setQueryData<BoardData>(queryKeys.board(projectId), (previous) => {
        if (!previous) return previous;
        const tasks = previous.tasks.filter((task) => !removed.has(task.id));
        if (tasks.length === previous.tasks.length) return previous;
        return { ...previous, tasks };
      });
    },
    [projectId, queryClient],
  );

  const metaTimerRef = useRef<number | null>(null);
  const pendingTaskIdsRef = useRef<Set<string>>(new Set());

  const scheduleRefresh = useCallback(
    (taskId?: string | null) => {
      if (taskId) pendingTaskIdsRef.current.add(taskId);
      if (metaTimerRef.current !== null) return;
      metaTimerRef.current = window.setTimeout(() => {
        metaTimerRef.current = null;
        const taskIds = Array.from(pendingTaskIdsRef.current);
        pendingTaskIdsRef.current.clear();
        for (const id of taskIds) {
          for (const queryKey of [
            queryKeys.task(id),
            queryKeys.comments(id),
            queryKeys.subtasks(id),
            queryKeys.attachments(id),
            queryKeys.taskActivities(id),
          ]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }
        void queryClient
          .invalidateQueries({ queryKey: queryKeys.board(projectId) })
          .then(() => {
            applyPositions();
          })
          .catch(() => undefined);
      }, 500);
    },
    [applyPositions, projectId, queryClient],
  );

  useEffect(() => {
    if (!enabled || !userId) return;
    let disposed = false;
    const observerCleanups: Array<() => void> = [];

    const detachObservers = () => {
      for (const cleanup of observerCleanups) cleanup();
      observerCleanups.length = 0;
    };

    const yDoc = new Y.Doc();

    const attachObservers = () => {
      const boardMap = yDoc.getMap('board');
      const tasksMap = boardMap.get('tasks');
      detachObservers();
      if (!(tasksMap instanceof Y.Map)) return;

      const map: Y.Map<unknown> = tasksMap;
      const tasksHandler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
        if (transaction.local || disposed) return;
        const removedIds: string[] = [];
        let added = false;
        event.changes.keys.forEach((change, key) => {
          if (change.action === 'delete' && !map.has(key)) removedIds.push(key);
          if (change.action === 'add') added = true;
        });
        if (removedIds.length > 0) removeTasksFromCache(removedIds);
        if (added) scheduleRefresh();
        applyPositions();
      };
      map.observe(tasksHandler);
      observerCleanups.push(() => map.unobserve(tasksHandler));

      const columnsMap = boardMap.get('columns');
      if (columnsMap instanceof Y.Map) {
        const columnMap: Y.Map<unknown> = columnsMap;
        const columnsHandler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
          if (transaction.local || disposed) return;
          let structureChanged = false;
          event.changes.keys.forEach((change) => {
            if (change.action === 'add' || change.action === 'delete') structureChanged = true;
          });
          if (structureChanged) scheduleRefresh();
          applyPositions();
        };
        columnMap.observe(columnsHandler);
        observerCleanups.push(() => columnMap.unobserve(columnsHandler));
      }

      const metaMap = boardMap.get('meta');
      if (metaMap instanceof Y.Map) {
        const meta: Y.Map<unknown> = metaMap;
        const metaHandler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
          if (transaction.local || disposed) return;
          if (!event.keysChanged.has('lastEvent')) return;
          const lastEvent = meta.get('lastEvent');
          const changedTaskId =
            isRecord(lastEvent) && typeof lastEvent.taskId === 'string' ? lastEvent.taskId : null;
          scheduleRefresh(changedTaskId);
        };
        meta.observe(metaHandler);
        observerCleanups.push(() => meta.unobserve(metaHandler));
      }
    };

    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: `project:${projectId}`,
      token: getAccessToken() ?? '',
      document: yDoc,
      onStatus: ({ status }) => {
        if (disposed) return;
        updateStatus(mapWebSocketStatus(status));
      },
      onAuthenticationFailed: () => {
        if (disposed || authRetriedRef.current) return;
        authRetriedRef.current = true;
        void refreshAccessToken().then((nextToken) => {
          if (!nextToken || disposed) return;
          provider.setConfiguration({ token: nextToken });
          void provider.sendToken().catch(() => undefined);
          void provider.configuration.websocketProvider.connect().catch(() => undefined);
        });
      },
      onAuthenticated: () => {
        authRetriedRef.current = false;
      },
      onSynced: ({ state }) => {
        if (!state || disposed) return;
        const firstSync = !syncedRef.current;
        syncedRef.current = true;
        updateStatus('connected');
        attachObservers();
        applyPositions();
        if (!firstSync) scheduleRefresh();
      },
      onClose: ({ event }) => {
        if (disposed) return;
        updateStatus('disconnected');
        if (event.code === 4410) {
          if (!authRetriedRef.current) {
            authRetriedRef.current = true;
            void refreshAccessToken().then((nextToken) => {
              if (!nextToken || disposed) return;
              provider.setConfiguration({ token: nextToken });
              void provider.configuration.websocketProvider.connect().catch(() => undefined);
            });
          }
        }
        if (event.code === 4403 || event.code === 4404) {
          provider.configuration.websocketProvider.disconnect();
        }
        if (event.code === 4401 && !authRetriedRef.current) {
          authRetriedRef.current = true;
          void refreshAccessToken().then((nextToken) => {
            if (!nextToken || disposed) return;
            provider.setConfiguration({ token: nextToken });
            void provider.configuration.websocketProvider.connect().catch(() => undefined);
          });
        }
      },
    });

    providerRef.current = provider;
    docRef.current = yDoc;

    const awareness = provider.awareness;
    if (awareness) {
      awareness.setLocalState({
        userId,
        draggingTaskId: draggingRef.current,
        selectedTaskId: selectedRef.current,
        updatedAt: Date.now(),
      });
      const handlePresenceChange = () => {
        if (disposed) return;
        const seen = new Map<string, BoardPresenceEntry>();
        awareness.getStates().forEach((rawState) => {
          const state: Record<string, unknown> = rawState;
          const stateUserId = state.userId;
          if (typeof stateUserId !== 'string' || stateUserId === userId) return;
          const entry: BoardPresenceEntry = {
            userId: stateUserId,
            draggingTaskId: typeof state.draggingTaskId === 'string' ? state.draggingTaskId : null,
            selectedTaskId: typeof state.selectedTaskId === 'string' ? state.selectedTaskId : null,
          };
          const existing = seen.get(stateUserId);
          if (!existing || (!existing.draggingTaskId && entry.draggingTaskId)) {
            seen.set(stateUserId, entry);
          }
        });
        setPresence(Array.from(seen.values()));
      };
      awareness.on('change', handlePresenceChange);
      handlePresenceChange();
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      provider.awareness?.setLocalStateField('updatedAt', Date.now());
    }, 30_000);

    setSessionReady(true);

    return () => {
      disposed = true;
      setSessionReady(false);
      window.clearInterval(heartbeat);
      if (metaTimerRef.current !== null) {
        window.clearTimeout(metaTimerRef.current);
        metaTimerRef.current = null;
      }
      for (const cleanup of observerCleanups) cleanup();
      observerCleanups.length = 0;
      syncedRef.current = false;
      providerRef.current = null;
      docRef.current = null;
      provider.destroy();
      awareness?.destroy();
      yDoc.destroy();
      setPresence([]);
      setConnectionStatus('connecting');
    };
  }, [
    applyPositions,
    enabled,
    projectId,
    removeTasksFromCache,
    scheduleRefresh,
    updateStatus,
    userId,
  ]);

  useEffect(() => {
    if (!sessionReady) return;
    providerRef.current?.awareness?.setLocalStateField('draggingTaskId', draggingTaskId);
  }, [draggingTaskId, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    providerRef.current?.awareness?.setLocalStateField('selectedTaskId', selectedTaskId);
  }, [selectedTaskId, sessionReady]);

  return { connectionStatus, presence, applyPositions };
}
