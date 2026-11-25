import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Connection, Server as HocuspocusServer } from '@hocuspocus/server' with {
  'resolution-mode': 'import',
};
import type * as Y from 'yjs' with { 'resolution-mode': 'import' };
import { BOARD_EVENTS_CHANNEL, type BoardEvent } from '../events/events.module';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

interface RealtimeContext {
  userId: string;
  projectId: string;
  tokenExpiresAt: number;
}

interface TrackedConnection {
  connection: Connection;
  userId: string;
  projectId: string;
  timer: NodeJS.Timeout;
}

interface TaskPosition {
  columnId: string;
  position: string;
  updatedAt: number;
}

interface ColumnPosition {
  position: string;
  updatedAt: number;
}

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: HocuspocusServer;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ESM-only yjs requires an import() type query
  private yjs?: typeof import('yjs', { with: { 'resolution-mode': 'import' } });
  private ready = false;
  private readonly connections = new Map<string, TrackedConnection>();
  private readonly onRedisMessage = (channel: string, payload: string): void => {
    if (channel !== BOARD_EVENTS_CHANNEL) return;
    void this.applyEvent(payload);
  };

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  get isReady(): boolean {
    return this.ready;
  }

  private parseProjectId(documentName: string): string | null {
    if (!documentName.startsWith('project:')) return null;
    const projectId = documentName.slice('project:'.length);
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(projectId)) return null;
    return projectId;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('ENABLE_REALTIME')) {
      this.logger.log('Realtime server disabled by configuration');
      return;
    }
    const port = this.config.getOrThrow<number>('REALTIME_PORT');
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ESM-only package requires an import() type query
    let ServerClass: typeof import('@hocuspocus/server', {
      with: { 'resolution-mode': 'import' },
    }).Server;
    try {
      const [hocuspocusModule, yjsModule] = await Promise.all([
        import('@hocuspocus/server'),
        import('yjs'),
      ]);
      ServerClass = hocuspocusModule.Server;
      this.yjs = yjsModule;
    } catch (error) {
      this.logger.error(`Realtime modules failed to load: ${(error as Error).message}`);
      return;
    }
    this.server = new ServerClass({
      port,
      address: '0.0.0.0',
      stopOnSignals: false,
      onAuthenticate: async ({ token, documentName, connectionConfig }) => {
        const projectId = this.parseProjectId(documentName);
        if (!projectId) throw new Error('Invalid document name');
        if (!token) throw new Error('Unauthorized');
        let payload: { sub?: string; typ?: string; exp?: number };
        try {
          payload = await this.jwt.verifyAsync(token, {
            issuer: 'teamflow',
            audience: 'teamflow-api',
          });
        } catch {
          throw new Error('Unauthorized');
        }
        if (!payload.sub || payload.typ !== 'access') throw new Error('Unauthorized');

        const [user, project, member] = await Promise.all([
          this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } }),
          this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
          this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: payload.sub } },
            select: { id: true },
          }),
        ]);
        if (!user || !project || !member) throw new Error('Unauthorized');

        connectionConfig.readOnly = true;
        const expiresAt = (payload.exp ?? Math.floor(Date.now() / 1000) + 900) * 1000;
        return {
          userId: payload.sub,
          projectId,
          tokenExpiresAt: expiresAt,
        } satisfies RealtimeContext;
      },
      onLoadDocument: async ({ documentName }) => this.loadDocument(documentName),
      connected: async ({ context, connection, socketId }) => {
        const ctx = context as RealtimeContext;
        if (!ctx?.userId) return;
        connection.readOnly = true;
        const delay = Math.max(0, ctx.tokenExpiresAt - Date.now());
        const timer = setTimeout(() => {
          try {
            connection.close({ code: 4410, reason: 'Token expired' });
          } catch {
            // connection already closed
          }
        }, delay);
        timer.unref?.();
        this.connections.set(socketId, {
          connection,
          userId: ctx.userId,
          projectId: ctx.projectId,
          timer,
        });
        this.updateMetrics();
      },
      onDisconnect: async ({ socketId }) => {
        const tracked = this.connections.get(socketId);
        if (tracked) {
          clearTimeout(tracked.timer);
          this.connections.delete(socketId);
          this.updateMetrics();
        }
      },
      onAwarenessUpdate: async () => {
        // Presence is a public hint channel: all clients' states are included here and v3
        // cannot attribute a state to the current connection. Identity is resolved
        // client-side from the member list; presence never grants permissions.
      },
      beforeHandleMessage: async () => {
        // Expired tokens are closed by the per-connection timer in `connected`.
        // Throwing here would surface as an unhandled rejection and crash the server.
      },
    });

    try {
      await this.server.listen();
      this.ready = true;
      await this.redis.subscriber.subscribe(BOARD_EVENTS_CHANNEL);
      this.redis.subscriber.on('message', this.onRedisMessage);
      this.updateMetrics();
      this.logger.log(`Realtime server listening on :${port}`);
    } catch (error) {
      this.logger.error(`Realtime server failed to start: ${(error as Error).message}`);
    }
  }

  private async loadDocument(documentName: string): Promise<Y.Doc> {
    const projectId = this.parseProjectId(documentName);
    if (!projectId) throw new Error('Invalid document name');
    const [columns, tasks] = await Promise.all([
      this.prisma.boardColumn.findMany({ where: { projectId } }),
      this.prisma.task.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, columnId: true, position: true, updatedAt: true },
      }),
    ]);
    const doc = new this.yjs!.Doc();
    const board = doc.getMap('board');
    const taskMap = new this.yjs!.Map<TaskPosition>();
    const columnMap = new this.yjs!.Map<ColumnPosition>();
    const meta = new this.yjs!.Map<unknown>();
    meta.set('schemaVersion', 1);
    board.set('tasks', taskMap);
    board.set('columns', columnMap);
    board.set('meta', meta);
    for (const column of columns) {
      columnMap.set(column.id, {
        position: column.position,
        updatedAt: column.updatedAt.getTime(),
      });
    }
    for (const task of tasks) {
      taskMap.set(task.id, {
        columnId: task.columnId,
        position: task.position,
        updatedAt: task.updatedAt.getTime(),
      });
    }
    return doc;
  }

  private async applyEvent(raw: string): Promise<void> {
    let event: BoardEvent;
    try {
      event = JSON.parse(raw) as BoardEvent;
    } catch {
      return;
    }
    if (!event || event.v !== 1 || typeof event.projectId !== 'string') return;

    if (event.type === 'project.member.changed') {
      const userId = typeof event.payload.userId === 'string' ? event.payload.userId : undefined;
      this.revokeConnections(event.projectId, userId);
      return;
    }

    const documentName = `project:${event.projectId}`;
    if (!this.server?.hocuspocus.documents.has(documentName)) return;
    try {
      const connection = await this.server.hocuspocus.openDirectConnection(documentName, {
        source: 'redis-bridge',
      });
      await connection.transact((document) => {
        this.applyMutation(document, event);
      });
      await connection.disconnect();
      this.updateMetrics();
    } catch (error) {
      this.logger.warn(`Board event apply failed (${event.type}): ${(error as Error).message}`);
    }
  }

  private applyMutation(document: Y.Doc, event: BoardEvent): void {
    const board = document.getMap('board');
    let tasks = board.get('tasks') as Y.Map<TaskPosition> | undefined;
    let columns = board.get('columns') as Y.Map<ColumnPosition> | undefined;
    let meta = board.get('meta') as Y.Map<unknown> | undefined;
    if (!tasks) {
      tasks = new this.yjs!.Map<TaskPosition>();
      board.set('tasks', tasks);
    }
    if (!columns) {
      columns = new this.yjs!.Map<ColumnPosition>();
      board.set('columns', columns);
    }
    if (!meta) {
      meta = new this.yjs!.Map<unknown>();
      meta.set('schemaVersion', 1);
      board.set('meta', meta);
    }

    const payload = event.payload;
    const taskId = typeof payload.taskId === 'string' ? payload.taskId : undefined;
    const columnId = typeof payload.columnId === 'string' ? payload.columnId : undefined;
    const position = typeof payload.position === 'string' ? payload.position : undefined;
    const now = Date.now();

    switch (event.type) {
      case 'task.created':
      case 'task.moved':
        if (taskId && columnId && position) {
          tasks.set(taskId, { columnId, position, updatedAt: now });
        }
        break;
      case 'task.deleted':
        if (taskId) tasks.delete(taskId);
        break;
      case 'task.updated':
        meta.set('lastEvent', { type: event.type, taskId, at: now });
        break;
      case 'column.created':
      case 'column.moved':
        if (columnId && position) {
          columns.set(columnId, { position, updatedAt: now });
        }
        break;
      case 'column.deleted':
        if (columnId) columns.delete(columnId);
        break;
      case 'column.updated':
        meta.set('lastEvent', { type: event.type, columnId, at: now });
        break;
      default:
        break;
    }
  }

  private revokeConnections(projectId: string, userId?: string): void {
    for (const [socketId, tracked] of this.connections.entries()) {
      if (tracked.projectId !== projectId) continue;
      if (userId && tracked.userId !== userId) continue;
      clearTimeout(tracked.timer);
      try {
        tracked.connection.close({ code: 4403, reason: 'Membership changed' });
      } catch {
        // already closed
      }
      this.connections.delete(socketId);
    }
    this.updateMetrics();
  }

  private updateMetrics(): void {
    this.metrics.wsConnections.set(this.connections.size);
    this.metrics.wsDocuments.set(this.server?.hocuspocus.documents.size ?? 0);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.subscriber.unsubscribe(BOARD_EVENTS_CHANNEL);
      this.redis.subscriber.off('message', this.onRedisMessage);
    } catch {
      // ignore
    }
    for (const tracked of this.connections.values()) {
      clearTimeout(tracked.timer);
      try {
        tracked.connection.close({ code: 1000, reason: 'Server shutting down' });
      } catch {
        // already closed
      }
    }
    this.connections.clear();
    this.ready = false;
    await this.server?.destroy();
  }
}
