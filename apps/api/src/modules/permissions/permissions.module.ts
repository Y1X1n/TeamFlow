import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionsController } from './permissions.controller';

@Module({
  controllers: [PermissionsController],
  providers: [AccessService],
  exports: [AccessService],
})
export class PermissionsModule {}
