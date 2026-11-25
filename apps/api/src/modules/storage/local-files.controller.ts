import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/public.decorator';
import { StorageService } from './storage.service';

@Controller('files')
export class LocalFilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('local')
  async serve(@Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    if (!token) {
      res.status(404).end();
      return;
    }
    const file = await this.storage.openLocal(token);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    file.stream.pipe(res);
  }
}
