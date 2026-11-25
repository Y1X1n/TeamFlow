import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  assignSuggestionsSchema,
  type AssignSuggestionsInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequirePermission } from '../permissions/permission.decorators';
import { AssignmentsService, type AssignSuggestionsResult } from './assignments.service';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('tasks/:taskId/assign-suggestions')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission('task:assign')
  suggest(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(assignSuggestionsSchema)) body: AssignSuggestionsInput,
  ): Promise<AssignSuggestionsResult> {
    return this.assignments.suggest(user.id, taskId, body);
  }
}