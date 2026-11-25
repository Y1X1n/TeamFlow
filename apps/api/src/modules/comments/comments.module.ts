import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [ActivitiesModule, NotificationsModule, PermissionsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
