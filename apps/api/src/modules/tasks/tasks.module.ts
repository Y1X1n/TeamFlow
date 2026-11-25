import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ColumnsController, TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ActivitiesModule, NotificationsModule, PermissionsModule],
  controllers: [TasksController, ColumnsController],
  providers: [TasksService],
})
export class TasksModule {}
