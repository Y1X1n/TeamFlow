import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/public.decorator';
import { RealtimeService } from '../modules/realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async health(): Promise<{
    status: 'ok' | 'degraded';
    uptime: number;
    db: 'up' | 'down';
    redis: 'up' | 'down';
    realtime: 'up' | 'down';
    version: string;
  }> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    const redis = (await this.redis.ping()) ? 'up' : 'down';
    const realtime = this.realtime.isReady ? 'up' : 'down';
    return {
      status: db === 'up' && redis === 'up' && realtime === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      db,
      redis,
      realtime,
      version: this.config.get<string>('npm_package_version') ?? '0.1.0',
    };
  }
}
