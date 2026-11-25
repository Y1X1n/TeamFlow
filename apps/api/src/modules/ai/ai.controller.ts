import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { analyzeRichText } from '@teamflow/shared/richtext';
import { aiPlanSchema, type AiPlanInput } from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { DomainError } from '../../common/domain-error';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../permissions/permission.decorators';
import { AiService } from './ai.service';
import { TaskPlanService } from './task-plan.service';
import type { TaskPlanResult } from './task-plan';

@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly taskPlan: TaskPlanService,
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

  @Post('tasks/:taskId/ai-plan')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission('task:update')
  generatePlan(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(aiPlanSchema)) body: AiPlanInput,
  ): Promise<TaskPlanResult> {
    return this.taskPlan.generate(taskId, user.id, body);
  }
}
