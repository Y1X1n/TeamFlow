import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TaskPlanService } from './task-plan.service';

@Module({
  imports: [PermissionsModule],
  controllers: [AiController],
  providers: [AiService, TaskPlanService],
  exports: [AiService, TaskPlanService],
})
export class AiModule {}
