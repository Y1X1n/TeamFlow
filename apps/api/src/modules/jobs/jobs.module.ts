import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [NotificationsModule, ReportsModule],
  providers: [JobsService],
})
export class JobsModule {}
