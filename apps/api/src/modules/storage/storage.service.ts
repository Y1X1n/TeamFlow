import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { DomainError } from '../../common/domain-error';

interface LocalTokenPayload {
  key: string;
  name: string;
  mime: string;
  exp: number;
}

export interface LocalFile {
  stream: ReadStream;
  fileName: string;
  mimeType: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly localRoot: string;
  private readonly secret: string;
  private readonly publicBaseUrl: string;
  private readonly bucket: string;
  private readonly s3?: S3Client;
  private readonly s3PublicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    this.driver = config.getOrThrow<'local' | 's3'>('STORAGE_DRIVER');
    this.localRoot = path.resolve(config.getOrThrow<string>('STORAGE_LOCAL_DIR'));
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.publicBaseUrl = config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/$/, '');
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.s3PublicEndpoint = config.getOrThrow<string>('S3_PUBLIC_ENDPOINT');
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
        region: config.getOrThrow<string>('S3_REGION'),
        forcePathStyle: config.getOrThrow<boolean>('S3_FORCE_PATH_STYLE'),
        credentials: {
          accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
          secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
        },
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.driver === 'local') {
      await mkdir(this.localRoot, { recursive: true });
      return;
    }
    try {
      await this.s3?.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3?.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.logger.warn(`Unable to ensure bucket ${this.bucket}: ${(error as Error).message}`);
      }
    }
  }

  private localPath(key: string): string {
    if (key.includes('\0') || key.includes('\\') || key.startsWith('/')) {
      throw new DomainError('NOT_FOUND', 404, 'Invalid file key');
    }
    const segments = key.split('/');
    const safeSegments =
      segments.length > 0 &&
      segments.every(
        (segment) =>
          segment.length > 0 &&
          segment !== '.' &&
          segment !== '..' &&
          /^[A-Za-z0-9_.-]+$/.test(segment),
      );
    if (!safeSegments) throw new DomainError('NOT_FOUND', 404, 'Invalid file key');
    const full = path.join(this.localRoot, ...segments);
    const relative = path.relative(this.localRoot, full);
    if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new DomainError('NOT_FOUND', 404, 'Invalid file key');
    }
    return full;
  }

  async upload(key: string, body: Buffer, mimeType: string): Promise<void> {
    if (this.driver === 'local') {
      const full = this.localPath(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return;
    }
    try {
      await this.s3?.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
        }),
      );
    } catch (error) {
      this.logger.error(`Upload failed: ${(error as Error).message}`);
      throw new DomainError('STORAGE_UNAVAILABLE', 503, 'File storage unavailable');
    }
  }

  async delete(key: string): Promise<void> {
    if (this.driver === 'local') {
      try {
        await unlink(this.localPath(key));
      } catch {
        return;
      }
      return;
    }
    try {
      await this.s3?.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Delete failed for ${key}: ${(error as Error).message}`);
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.allSettled(keys.map((key) => this.delete(key)));
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
  }

  async getDownloadUrl(key: string, fileName: string, mimeType: string): Promise<string> {
    if (this.driver === 'local') {
      const payload: LocalTokenPayload = {
        key,
        name: fileName,
        mime: mimeType,
        exp: Math.floor(Date.now() / 1000) + 300,
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const token = `${payloadB64}.${this.sign(payloadB64)}`;
      return `${this.publicBaseUrl}/api/v1/files/local?token=${encodeURIComponent(token)}`;
    }
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: mimeType,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
      const signed = await getSignedUrl(this.s3 as S3Client, command, { expiresIn: 300 });
      const target = new URL(signed);
      const publicUrl = new URL(this.s3PublicEndpoint);
      target.protocol = publicUrl.protocol;
      target.host = publicUrl.host;
      target.port = publicUrl.port;
      return target.toString();
    } catch (error) {
      this.logger.error(`Presign failed: ${(error as Error).message}`);
      throw new DomainError('STORAGE_UNAVAILABLE', 503, 'File storage unavailable');
    }
  }

  private verifyLocalToken(token: string): LocalTokenPayload {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) throw new DomainError('NOT_FOUND', 404, 'Invalid file link');
    const expected = Buffer.from(this.sign(payloadB64));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new DomainError('NOT_FOUND', 404, 'Invalid file link');
    }
    let payload: LocalTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as LocalTokenPayload;
    } catch {
      throw new DomainError('NOT_FOUND', 404, 'Invalid file link');
    }
    if (!payload.key || !payload.name || !payload.mime || payload.exp < Date.now() / 1000) {
      throw new DomainError('NOT_FOUND', 404, 'File link expired');
    }
    return payload;
  }

  async openLocal(token: string): Promise<LocalFile> {
    const payload = this.verifyLocalToken(token);
    const full = this.localPath(payload.key);
    try {
      await stat(full);
    } catch {
      throw new DomainError('NOT_FOUND', 404, 'File not found');
    }
    return {
      stream: createReadStream(full),
      fileName: payload.name,
      mimeType: payload.mime,
    };
  }
}
