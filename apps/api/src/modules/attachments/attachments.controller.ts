import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ATTACHMENT_MAX_BYTES } from '@teamflow/shared/enums';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { AttachmentsService, type UploadedFileLike } from './attachments.service';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('tasks/:taskId/attachments')
  @RequireMember()
  list(@Param('taskId') taskId: string) {
    return this.attachments.list(taskId);
  }

  @Post('tasks/:taskId/attachments')
  @HttpCode(201)
  @RequirePermission('attachment:upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }))
  upload(
    @CurrentUser() user: { id: string },
    @Param('taskId') taskId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.attachments.upload(user.id, taskId, file);
  }

  @Delete('attachments/:attachmentId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    await this.attachments.remove(user.id, attachmentId);
  }

  @Get('attachments/:attachmentId/download')
  async download(
    @CurrentUser() user: { id: string },
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.attachments.download(attachmentId, user.id);
    res.redirect(302, url);
  }
}
