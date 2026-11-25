import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createInviteSchema,
  updateMemberSchema,
  type CreateInviteInput,
  type UpdateMemberInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { MembersService } from './members.service';

@Controller('projects/:projectId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequireMember()
  list(@Param('projectId') projectId: string) {
    return this.members.list(projectId);
  }

  @Patch(':userId')
  @RequirePermission('member:manage')
  update(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.updateMember(user.id, projectId, userId, body);
  }

  @Delete(':userId')
  @HttpCode(204)
  @RequirePermission('member:manage')
  async remove(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.members.removeMember(user.id, projectId, userId);
  }
}

@Controller('projects/:projectId/invites')
export class InvitesController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('member:invite')
  list(@Param('projectId') projectId: string) {
    return this.members.listInvites(projectId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('member:invite')
  create(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ) {
    return this.members.createInvite(user.id, projectId, body);
  }

  @Delete(':inviteId')
  @HttpCode(204)
  @RequirePermission('member:invite')
  async revoke(
    @Param('projectId') projectId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    await this.members.revokeInvite(projectId, inviteId);
  }
}

@Controller('invites')
export class PublicInvitesController {
  constructor(private readonly members: MembersService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.members.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: { id: string }, @Param('token') token: string) {
    return this.members.accept(user.id, token);
  }
}
