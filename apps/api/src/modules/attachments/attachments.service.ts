import { Injectable } from '@nestjs/common';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_TASK } from '@teamflow/shared/enums';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { AccessService } from '../permissions/access.service';
import { StorageService } from '../storage/storage.service';

export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const ALLOWED: Record<
  string,
  {
    mime: string;
    kind: 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'text';
  }
> = {
  '.png': { mime: 'image/png', kind: 'png' },
  '.jpg': { mime: 'image/jpeg', kind: 'jpeg' },
  '.jpeg': { mime: 'image/jpeg', kind: 'jpeg' },
  '.gif': { mime: 'image/gif', kind: 'gif' },
  '.webp': { mime: 'image/webp', kind: 'webp' },
  '.pdf': { mime: 'application/pdf', kind: 'pdf' },
  '.txt': { mime: 'text/plain', kind: 'text' },
  '.md': { mime: 'text/markdown', kind: 'text' },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'docx',
  },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'xlsx',
  },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    kind: 'pptx',
  },
};

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isZip(buffer: Buffer): boolean {
  return (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])
  );
}

/** Office Open XML 必须同时包含内容类型表和对应主文档目录，拒绝普通 ZIP 改扩展名。 */
function isOfficeDocument(buffer: Buffer, marker: string): boolean {
  return (
    isZip(buffer) &&
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    buffer.includes(Buffer.from(marker))
  );
}

export function detectAttachmentSignature(
  buffer: Buffer,
  kind: (typeof ALLOWED)[string]['kind'],
): boolean {
  switch (kind) {
    case 'png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
    case 'jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case 'gif':
      return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
    case 'webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'pdf':
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
    case 'docx':
      return isOfficeDocument(buffer, 'word/');
    case 'xlsx':
      return isOfficeDocument(buffer, 'xl/');
    case 'pptx':
      return isOfficeDocument(buffer, 'ppt/');
    case 'text':
      return !buffer.includes(0x00);
  }
}

function normalizeFileName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly storage: StorageService,
  ) {}

  private validateFile(fileName: string, buffer: Buffer): { extension: string; mime: string } {
    if (buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new DomainError('FILE_TOO_LARGE', 413, 'File exceeds 10MB limit');
    }
    const extension = path.extname(fileName).toLowerCase();
    const info = ALLOWED[extension];
    if (!info || !detectAttachmentSignature(buffer, info.kind)) {
      throw new DomainError('UNSUPPORTED_FILE_TYPE', 415, 'Unsupported file type');
    }
    return { extension, mime: info.mime };
  }

  private serialize(attachment: {
    id: string;
    taskId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    uploadedBy: { id: string; name: string };
  }) {
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      uploadedBy: { userId: attachment.uploadedBy.id, name: attachment.uploadedBy.name },
      createdAt: attachment.createdAt,
    };
  }

  async upload(userId: string, taskId: string, file: UploadedFileLike | undefined) {
    if (!file) throw new DomainError('VALIDATION_ERROR', 400, 'File is required');
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, projectId: true, title: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    await this.access.getContext(userId, task.projectId);

    const count = await this.prisma.attachment.count({ where: { taskId } });
    if (count >= ATTACHMENT_MAX_PER_TASK) {
      throw new DomainError('ATTACHMENT_LIMIT_REACHED', 422, 'Attachment limit reached');
    }
    const { extension, mime } = this.validateFile(
      normalizeFileName(file.originalname),
      file.buffer,
    );
    const objectKey = `projects/${task.projectId}/tasks/${taskId}/${randomUUID()}${extension}`;
    await this.storage.upload(objectKey, file.buffer, mime);

    const safeName =
      path
        .basename(normalizeFileName(file.originalname))
        .replace(/[\u0000-\u001f]/g, '')
        .slice(0, 255) || `file${extension}`;
    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          taskId,
          uploadedById: userId,
          fileName: safeName,
          mimeType: mime,
          sizeBytes: file.size,
          objectKey,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      await this.activities.record(tx, {
        projectId: task.projectId,
        actorId: userId,
        taskId,
        type: 'ATTACHMENT_ADDED',
        payload: { taskId, attachmentId: created.id, fileName: created.fileName },
      });
      return created;
    });
    return this.serialize(attachment);
  }

  async list(taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new DomainError('NOT_FOUND', 404, 'Task not found');
    const attachments = await this.prisma.attachment.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { items: attachments.map((attachment) => this.serialize(attachment)) };
  }

  async download(attachmentId: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { task: { select: { projectId: true, deletedAt: true } } },
    });
    if (!attachment || attachment.task.deletedAt) {
      throw new DomainError('NOT_FOUND', 404, 'Attachment not found');
    }
    await this.access.getContext(userId, attachment.task.projectId);
    return this.storage.getDownloadUrl(
      attachment.objectKey,
      attachment.fileName,
      attachment.mimeType,
    );
  }

  async remove(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { task: { select: { projectId: true, id: true, deletedAt: true } } },
    });
    if (!attachment || attachment.task.deletedAt) {
      throw new DomainError('NOT_FOUND', 404, 'Attachment not found');
    }
    const access = await this.access.getContext(userId, attachment.task.projectId);
    if (access.archived) throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    if (attachment.uploadedById !== userId && !access.permissions.includes('attachment:delete')) {
      throw new DomainError('FORBIDDEN', 403, 'Cannot delete this attachment');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachmentId } });
      await this.activities.record(tx, {
        projectId: attachment.task.projectId,
        actorId: userId,
        taskId: attachment.task.id,
        type: 'ATTACHMENT_DELETED',
        payload: { taskId: attachment.task.id, attachmentId, fileName: attachment.fileName },
      });
    });
    await this.storage.delete(attachment.objectKey);
  }
}
