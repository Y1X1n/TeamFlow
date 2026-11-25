import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RealtimeModule } from '../modules/realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [HealthController],
})
export class HealthModule {}
