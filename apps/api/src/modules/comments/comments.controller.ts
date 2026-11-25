import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  commentsQuerySchema,
  createCommentSchema,
  reactionSchema,
  updateCommentSchema,
  type CommentsQuery,
  type CreateCommentInput,
  type ReactionInput,
  type UpdateCommentInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('tasks/:taskId/comments')
  @RequireMember()
  list(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Query(new ZodValidationPipe(commentsQuerySchema)) query: CommentsQuery,
  ) {
    return this.comments.list(taskId, user.id, query.cursor, query.limit ?? 50);
  }

  @Post('tasks/:taskId/comments')
  @HttpCode(201)
  @RequirePermission('comment:create')
  create(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput,
  ) {
    return this.comments.create(user.id, taskId, body);
  }

  @Patch('comments/:commentId')
  update(
    @CurrentUser() user: { id: string },
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) body: UpdateCommentInput,
  ) {
    return this.comments.update(user.id, commentId, body);
  }

  @Delete('comments/:commentId')
  @HttpCode(204)
  async remove(@CurrentUser() user: { id: string }, @Param('commentId') commentId: string) {
    await this.comments.remove(user.id, commentId);
  }

  @Put('comments/:commentId/reactions')
  @HttpCode(200)
  @RequireMember()
  addReaction(
    @CurrentUser() user: { id: string },
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(reactionSchema)) body: ReactionInput,
  ) {
    return this.comments.addReaction(user.id, commentId, body.emoji);
  }

  @Delete('comments/:commentId/reactions')
  @HttpCode(200)
  @RequireMember()
  removeReaction(
    @CurrentUser() user: { id: string },
    @Param('commentId') commentId: string,
    @Query(new ZodValidationPipe(reactionSchema)) query: ReactionInput,
  ) {
    return this.comments.removeReaction(user.id, commentId, query.emoji);
  }
}
