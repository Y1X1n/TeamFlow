import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createColumnSchema,
  createTaskSchema,
  deleteColumnQuerySchema,
  moveColumnSchema,
  moveTaskSchema,
  updateColumnSchema,
  updateTaskSchema,
  type CreateColumnInput,
  type CreateTaskInput,
  type DeleteColumnQuery,
  type MoveColumnInput,
  type MoveTaskInput,
  type UpdateColumnInput,
  type UpdateTaskInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/tasks')
  @HttpCode(201)
  @RequirePermission('task:create')
  create(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ) {
    return this.tasks.create(user.id, projectId, body);
  }

  @Get('tasks/:taskId')
  @RequireMember()
  get(@CurrentUser() user: { id: string }, @Param('taskId') taskId: string) {
    return this.tasks.get(user.id, taskId);
  }

  @Post('tasks/:taskId/watch')
  @HttpCode(200)
  @RequireMember()
  watch(@CurrentUser() user: { id: string }, @Param('taskId') taskId: string) {
    return this.tasks.setWatch(user.id, taskId, true);
  }

  @Delete('tasks/:taskId/watch')
  @HttpCode(200)
  @RequireMember()
  unwatch(@CurrentUser() user: { id: string }, @Param('taskId') taskId: string) {
    return this.tasks.setWatch(user.id, taskId, false);
  }

  @Patch('tasks/:taskId')
  @RequirePermission('task:update')
  update(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.tasks.update(user.id, taskId, body);
  }

  @Patch('tasks/:taskId/move')
  @RequirePermission('task:move')
  move(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(moveTaskSchema)) body: MoveTaskInput,
  ) {
    return this.tasks.move(user.id, taskId, body);
  }

  @Post('tasks/:taskId/duplicate')
  @HttpCode(201)
  @RequirePermission('task:create')
  duplicate(@CurrentUser() user: { id: string }, @Param('taskId') taskId: string) {
    return this.tasks.duplicate(user.id, taskId);
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  @RequirePermission('task:delete')
  async remove(@CurrentUser() user: { id: string }, @Param('taskId') taskId: string) {
    await this.tasks.remove(user.id, taskId);
  }
}

@Controller()
export class ColumnsController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/columns')
  @HttpCode(201)
  @RequirePermission('board:manage')
  createColumn(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createColumnSchema)) body: CreateColumnInput,
  ) {
    return this.tasks.createColumn(user.id, projectId, body);
  }

  @Patch('columns/:columnId')
  @RequirePermission('board:manage')
  updateColumn(
    @CurrentUser() user: { id: string },
    @Param('columnId') columnId: string,
    @Body(new ZodValidationPipe(updateColumnSchema)) body: UpdateColumnInput,
  ) {
    return this.tasks.updateColumn(user.id, columnId, body);
  }

  @Patch('columns/:columnId/move')
  @RequirePermission('board:manage')
  moveColumn(
    @CurrentUser() user: { id: string },
    @Param('columnId') columnId: string,
    @Body(new ZodValidationPipe(moveColumnSchema)) body: MoveColumnInput,
  ) {
    return this.tasks.moveColumn(user.id, columnId, body);
  }

  @Delete('columns/:columnId')
  @HttpCode(204)
  @RequirePermission('board:manage')
  async deleteColumn(
    @CurrentUser() user: { id: string },
    @Param('columnId') columnId: string,
    @Query(new ZodValidationPipe(deleteColumnQuerySchema)) query: DeleteColumnQuery,
  ): Promise<void> {
    await this.tasks.deleteColumn(user.id, columnId, query.moveTasksTo);
  }
}
