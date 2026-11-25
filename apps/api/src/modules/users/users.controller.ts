import { Body, Controller, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import {
  changePasswordSchema,
  myTasksQuerySchema,
  updateMeSchema,
  type ChangePasswordInput,
  type MyTasksQuery,
  type UpdateMeInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/auth.types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeInput,
  ) {
    return this.users.updateMe(user.id, body);
  }

  @Post('me/password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.users.changePassword(user.id, body);
  }

  @Get('me/tasks')
  myTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(myTasksQuerySchema)) query: MyTasksQuery,
  ) {
    return this.users.myTasks(user.id, query);
  }
}
