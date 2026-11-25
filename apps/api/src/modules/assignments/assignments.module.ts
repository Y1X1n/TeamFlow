import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [PermissionsModule, AiModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}