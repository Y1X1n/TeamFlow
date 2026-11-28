import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportsService } from '../reports/reports.service';
import { previousWeekStart, shanghaiDateKey } from '../reports/week';

@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly connection: ConnectionOptions;
  private automationQueue?: Queue;
  private reportsQueue?: Queue;
  private automationWorker?: Worker;
  private reportsWorker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
  ) {
    const url = new URL(config.getOrThrow<string>('REDIS_URL'));
    this.connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname && url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('ENABLE_JOBS')) {
      this.logger.log('Background jobs disabled by configuration');
      return;
    }
    try {
      this.automationQueue = new Queue('automation', { connection: this.connection });
      this.reportsQueue = new Queue('reports', { connection: this.connection });
      this.automationWorker = new Worker('automation', (job) => this.process(job), {
        connection: this.connection,
        concurrency: 1,
      });
      this.reportsWorker = new Worker('reports', (job) => this.process(job), {
        connection: this.connection,
        concurrency: 1,
      });
      for (const worker of [this.automationWorker, this.reportsWorker]) {
        worker.on('failed', (job, error) => {
          this.logger.error(`Job ${job?.name ?? 'unknown'} failed: ${error.message}`);
        });
      }
      await this.automationQueue.upsertJobScheduler(
        'overdue-scan',
        { pattern: '*/15 * * * *', tz: 'Asia/Shanghai' },
        {
          name: 'overdue-scan',
          data: {},
          opts: { removeOnComplete: { count: 100 }, removeOnFail: { age: 7 * 86400 } },
        },
      );
      await this.reportsQueue.upsertJobScheduler(
        'weekly-reports',
        { pattern: '0 8 * * 1', tz: 'Asia/Shanghai' },
        {
          name: 'weekly-reports',
          data: {},
          opts: { removeOnComplete: { count: 50 }, removeOnFail: { age: 30 * 86400 } },
        },
      );
    } catch (error) {
      this.logger.warn(`Scheduler bootstrap failed: ${(error as Error).message}`);
    }
  }

  private async process(job: Job): Promise<void> {
    if (job.name === 'overdue-scan') {
      await this.scanOverdue();
      return;
    }
    if (job.name === 'weekly-reports') {
      await this.generateWeeklyReports();
      return;
    }
  }

  private async scanOverdue(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        completedAt: null,
        dueDate: { not: null, lte: soon },
        project: { archivedAt: null },
      },
      take: 2000,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        assigneeId: true,
        createdById: true,
        projectId: true,
        project: { select: { members: { select: { userId: true } } } },
      },
    });
    const dateKey = shanghaiDateKey(now);
    const entries = tasks.flatMap((task) => {
      if (!task.dueDate) return [];
      const recipient = task.assigneeId ?? task.createdById;
      if (!task.project.members.some((member) => member.userId === recipient)) return [];
      const overdue = task.dueDate.getTime() < now.getTime();
      return [
        {
          userId: recipient,
          type: overdue ? ('TASK_OVERDUE' as const) : ('TASK_DUE_SOON' as const),
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.dueDate.toISOString(),
          },
          dedupeKey: `${overdue ? 'overdue' : 'due-soon'}:${task.id}:${recipient}:${dateKey}`,
        },
      ];
    });
    await this.notifications.createMany(entries);
  }

  private async generateWeeklyReports(): Promise<void> {
    const weekStart = previousWeekStart();
    const projects = await this.prisma.project.findMany({
      where: { archivedAt: null },
      select: { id: true },
    });
    for (const project of projects) {
      try {
        await this.reports.generateWeekly(project.id, weekStart, null);
      } catch (error) {
        if (error instanceof DomainError) continue;
        this.logger.error(`Weekly report failed for ${project.id}: ${(error as Error).message}`);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.automationWorker?.close(),
      this.reportsWorker?.close(),
      this.automationQueue?.close(),
      this.reportsQueue?.close(),
    ]);
  }
}
