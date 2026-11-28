import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/public.decorator';
import { StorageService } from './storage.service';

@Controller('files')
export class LocalFilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('local')
  async serve(
    @Req() request: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      res.status(404).end();
      return;
    }
    if (request.method === 'HEAD') {
      const file = await this.storage.describeLocal(token);
      this.setFileHeaders(res, file.fileName, file.mimeType);
      res.status(200).end();
      return;
    }
    const file = await this.storage.openLocal(token);
    this.setFileHeaders(res, file.fileName, file.mimeType);
    file.stream.pipe(res);
  }

  private setFileHeaders(res: Response, fileName: string, mimeType: string): void {
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
  }
}
