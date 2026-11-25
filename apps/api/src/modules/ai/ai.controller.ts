import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { analyzeRichText } from '@teamflow/shared/richtext';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../permissions/permission.decorators';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('ai/status')
  status() {
    return this.ai.status();
  }

  @Post('tasks/:taskId/ai-breakdown')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission('task:update')
  async breakdown(@Param('taskId') taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true, description: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    const description = task.description ? analyzeRichText(task.description).text : null;
    return this.ai.breakdown(task.title, description);
  }
}
