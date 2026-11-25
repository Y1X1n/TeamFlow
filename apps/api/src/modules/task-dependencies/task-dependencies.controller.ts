import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import {
  createTaskDependencySchema,
  type CreateTaskDependencyInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequirePermission } from '../permissions/permission.decorators';
import { TaskDependenciesService } from './task-dependencies.service';

@Controller()
export class TaskDependenciesController {
  constructor(private readonly dependencies: TaskDependenciesService) {}

  @Post('tasks/:taskId/dependencies')
  @HttpCode(201)
  @RequirePermission('task:update')
  add(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createTaskDependencySchema)) body: CreateTaskDependencyInput,
  ) {
    return this.dependencies.add(user.id, taskId, body);
  }

  @Delete('tasks/:taskId/dependencies/:blockedByTaskId')
  @HttpCode(200)
  @RequirePermission('task:update')
  remove(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Param('blockedByTaskId') blockedByTaskId: string,
  ) {
    return this.dependencies.remove(user.id, taskId, blockedByTaskId);
  }
}
