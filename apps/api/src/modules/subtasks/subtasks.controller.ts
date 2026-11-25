import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createSubtaskSchema,
  updateSubtaskSchema,
  type CreateSubtaskInput,
  type UpdateSubtaskInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { SubtasksService } from './subtasks.service';

@Controller()
export class SubtasksController {
  constructor(private readonly subtasks: SubtasksService) {}

  @Get('tasks/:taskId/subtasks')
  @RequireMember()
  list(@Param('taskId') taskId: string) {
    return this.subtasks.list(taskId);
  }

  @Post('tasks/:taskId/subtasks')
  @HttpCode(201)
  @RequirePermission('task:update')
  create(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createSubtaskSchema)) body: CreateSubtaskInput,
  ) {
    return this.subtasks.create(user.id, taskId, body);
  }

  @Patch('subtasks/:subtaskId')
  @RequirePermission('task:update')
  update(
    @CurrentUser() user: { id: string },
    @Param('subtaskId') subtaskId: string,
    @Body(new ZodValidationPipe(updateSubtaskSchema)) body: UpdateSubtaskInput,
  ) {
    return this.subtasks.update(user.id, subtaskId, body);
  }

  @Delete('subtasks/:subtaskId')
  @HttpCode(204)
  @RequirePermission('task:update')
  async remove(
    @CurrentUser() user: { id: string },
    @Param('subtaskId') subtaskId: string,
  ): Promise<void> {
    await this.subtasks.remove(user.id, subtaskId);
  }
}
