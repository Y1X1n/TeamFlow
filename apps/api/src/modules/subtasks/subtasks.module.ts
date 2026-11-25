import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';

@Module({
  imports: [ActivitiesModule, PermissionsModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
})
export class SubtasksModule {}
