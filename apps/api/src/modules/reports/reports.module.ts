import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ActivitiesModule, NotificationsModule, PermissionsModule, AiModule, MailModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
