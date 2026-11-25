import { Module } from '@nestjs/common';
import { LocalFilesController } from './local-files.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [LocalFilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
