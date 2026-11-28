import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { DomainError } from '../../common/domain-error';
import { randomToken, sha256Hex } from '../../common/hash';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';

export interface SessionResult {
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl' | 'createdAt'>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let dummyHashPromise: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('teamflow-nonexistent-account');
  return dummyHashPromise;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private publicUser(user: User): SessionResult['user'] {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  private refreshTtlMs(): number {
    return this.config.getOrThrow<number>('REFRESH_TTL_DAYS') * 24 * 60 * 60 * 1000;
  }

  async register(input: { email: string; password: string; name: string }): Promise<SessionResult> {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      return this.issueSession(user);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('EMAIL_TAKEN', 409, 'Email already registered');
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string }): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      // 账号不存在时也执行一次等价的 scrypt 校验，降低按响应时间枚举邮箱的风险。
      await verifyPassword(input.password, await dummyPasswordHash());
      throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    return this.issueSession(user);
  }

  private async signAccess(user: User): Promise<{ accessToken: string; expiresIn: number }> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'access' },
      { expiresIn, issuer: 'teamflow', audience: 'teamflow-api' },
    );
    return { accessToken, expiresIn };
  }

  private async issueSession(user: User): Promise<SessionResult> {
    const { accessToken, expiresIn } = await this.signAccess(user);
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return { user: this.publicUser(user), accessToken, refreshToken, expiresIn };
  }

  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    if (!rawToken) throw new DomainError('REFRESH_TOKEN_INVALID', 401, 'Missing refresh token');
    const tokenHash = sha256Hex(rawToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) throw new DomainError('REFRESH_TOKEN_INVALID', 401, 'Invalid refresh token');
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new DomainError('REFRESH_TOKEN_INVALID', 401, 'Refresh token already used');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('REFRESH_TOKEN_INVALID', 401, 'Refresh token expired');
    }

    const nextRaw = randomToken();
    const { accessToken, expiresIn } = await this.signAccess(record.user);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: sha256Hex(nextRaw),
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      }),
    ]);
    return {
      user: this.publicUser(record.user),
      accessToken,
      refreshToken: nextRaw,
      expiresIn,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
