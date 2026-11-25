import { Controller, Get, Param, Query } from '@nestjs/common';
import { cursorQuerySchema, type CursorQuery } from '@teamflow/shared/schemas';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember } from '../permissions/permission.decorators';
import { ActivitiesService } from './activities.service';

@Controller('projects/:projectId/activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequireMember()
  list(
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ) {
    return this.activities.list(projectId, query.cursor, query.limit ?? 20);
  }
}

@Controller('tasks/:taskId/activities')
export class TaskActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequireMember()
  list(
    @Param('taskId') taskId: string,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ) {
    return this.activities.listForTask(taskId, query.cursor, query.limit ?? 20);
  }
}
