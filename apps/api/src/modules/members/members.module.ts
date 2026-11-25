import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectsModule } from '../projects/projects.module';
import {
  InvitesController,
  MembersController,
  PublicInvitesController,
} from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [ActivitiesModule, NotificationsModule, PermissionsModule, ProjectsModule],
  controllers: [MembersController, InvitesController, PublicInvitesController],
  providers: [MembersService],
})
export class MembersModule {}
