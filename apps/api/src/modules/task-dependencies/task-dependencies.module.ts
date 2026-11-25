import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TaskDependenciesController } from './task-dependencies.controller';
import { TaskDependenciesService } from './task-dependencies.service';

@Module({
  imports: [ActivitiesModule, PermissionsModule],
  controllers: [TaskDependenciesController],
  providers: [TaskDependenciesService],
})
export class TaskDependenciesModule {}
