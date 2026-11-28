import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createInviteSchema,
  inviteTokenSchema,
  updateMemberSchema,
  updateMemberSkillsSchema,
  type CreateInviteInput,
  type InviteTokenInput,
  type UpdateMemberInput,
  type UpdateMemberSkillsInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { MembersService, type SerializedMember } from './members.service';

@Controller('projects/:projectId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequireMember()
  list(@Param('projectId') projectId: string): Promise<{ items: SerializedMember[] }> {
    return this.members.list(projectId);
  }

  @Patch('me/skills')
  @RequireMember()
  updateMySkills(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateMemberSkillsSchema)) body: UpdateMemberSkillsInput,
  ): Promise<SerializedMember> {
    return this.members.updateMySkills(user.id, projectId, body.skills);
  }

  @Patch(':userId')
  @RequirePermission('member:manage')
  update(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ): Promise<SerializedMember> {
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

  @Post('preview')
  @HttpCode(200)
  previewByBody(
    @Body(new ZodValidationPipe(inviteTokenSchema)) body: InviteTokenInput,
  ) {
    return this.members.preview(body.token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: { id: string }, @Param('token') token: string) {
    return this.members.accept(user.id, token);
  }

  @Post('accept')
  @HttpCode(200)
  acceptByBody(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(inviteTokenSchema)) body: InviteTokenInput,
  ) {
    return this.members.accept(user.id, body.token);
  }
}
