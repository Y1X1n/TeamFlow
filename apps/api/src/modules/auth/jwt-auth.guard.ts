import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DomainError } from '../../common/domain-error';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new DomainError('UNAUTHORIZED', 401, 'Authentication required');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(token, {
        issuer: 'teamflow',
        audience: 'teamflow-api',
      });
      if (payload.typ !== 'access' || !payload.sub) {
        throw new DomainError('UNAUTHORIZED', 401, 'Invalid access token');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
      });
      if (!user) throw new DomainError('UNAUTHORIZED', 401, 'User no longer exists');
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if ((error as Error).name === 'TokenExpiredError') {
        throw new DomainError('TOKEN_EXPIRED', 401, 'Access token expired');
      }
      throw new DomainError('UNAUTHORIZED', 401, 'Invalid access token');
    }
  }
}
