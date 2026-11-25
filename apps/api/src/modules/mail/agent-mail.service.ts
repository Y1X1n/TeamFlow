import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DomainError } from '../../common/domain-error';

const execFileAsync = promisify(execFile);
const STATUS_CACHE_MS = 5 * 60 * 1000;

interface CliEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface MeData {
  aliases?: Array<{ email?: string; is_primary?: boolean }>;
}

export interface AgentMailStatus {
  enabled: boolean;
  available: boolean;
  provider: 'tencent-agent-mail';
  sender: string | null;
  reason?: string;
}

export interface SendAgentMailInput {
  recipients: string[];
  subject: string;
  body: string;
}

export interface SendAgentMailResult {
  messageId: string | null;
  sender: string;
  recipients: string[];
}

function extractJson(text: string): CliEnvelope<unknown> | null {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  const opening = text[start]!;
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as CliEnvelope<unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

@Injectable()
export class AgentMailService {
  private cachedStatus: { status: AgentMailStatus; at: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('AGENT_MAIL_ENABLED') ?? false;
  }

  private cliCommand(): { command: string; prefix: string[] } | null {
    const entry = this.config.get<string>('AGENT_MAIL_CLI_ENTRY');
    if (entry && existsSync(entry)) {
      return /\.(?:c|m)?js$/i.test(entry)
        ? { command: process.execPath, prefix: [entry] }
        : { command: entry, prefix: [] };
    }
    if (process.platform !== 'win32') {
      return { command: 'agently-cli', prefix: [] };
    }
    return null;
  }

  private mapCliError(error: unknown): DomainError {
    const failure = error as {
      code?: number | string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const envelope = extractJson(failure.stdout ?? '');
    const message =
      envelope?.error?.message?.trim() ||
      failure.stderr?.trim() ||
      failure.message ||
      'Agent Mail 调用失败';
    if (failure.killed) {
      return new DomainError('EMAIL_TIMEOUT', 504, 'Agent Mail 调用超时，请稍后重试');
    }
    if (failure.code === 'ENOENT') {
      return new DomainError('EMAIL_NOT_CONFIGURED', 503, '未找到 agently-cli 可执行文件');
    }
    switch (failure.code) {
      case 2:
        return new DomainError('EMAIL_INVALID_REQUEST', 422, message);
      case 3:
        this.cachedStatus = null;
        return new DomainError('EMAIL_AUTH_REQUIRED', 503, 'Agent Mail 授权已失效，请重新登录 CLI');
      case 6:
        return new DomainError('EMAIL_REJECTED', 422, message);
      case 7:
        return new DomainError('EMAIL_RATE_LIMITED', 429, message);
      default:
        return new DomainError('EMAIL_SEND_FAILED', 502, message);
    }
  }

  private async run<T>(args: string[], cwd?: string): Promise<T> {
    const cli = this.cliCommand();
    if (!cli) {
      throw new DomainError(
        'EMAIL_NOT_CONFIGURED',
        503,
        '未找到 agently-cli 入口，请配置 AGENT_MAIL_CLI_ENTRY',
      );
    }
    try {
      const { stdout } = await execFileAsync(cli.command, [...cli.prefix, ...args], {
        cwd,
        timeout: 25_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: process.env,
      });
      const envelope = extractJson(stdout);
      if (!envelope || envelope.ok === false || envelope.data === undefined) {
        throw new DomainError(
          'EMAIL_SEND_FAILED',
          502,
          envelope?.error?.message || 'Agent Mail 返回格式异常',
        );
      }
      return envelope.data as T;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw this.mapCliError(error);
    }
  }

  async status(force = false): Promise<AgentMailStatus> {
    if (!this.enabled) {
      return {
        enabled: false,
        available: false,
        provider: 'tencent-agent-mail',
        sender: null,
        reason: 'Agent Mail 未启用，请配置发件邮箱并完成授权',
      };
    }
    if (!force && this.cachedStatus && Date.now() - this.cachedStatus.at < STATUS_CACHE_MS) {
      return this.cachedStatus.status;
    }
    try {
      const me = await this.run<MeData>(['+me']);
      const aliases = me.aliases ?? [];
      const sender =
        aliases.find((alias) => alias.is_primary)?.email ??
        aliases.find((alias) => Boolean(alias.email))?.email ??
        null;
      const status: AgentMailStatus = {
        enabled: true,
        available: Boolean(sender),
        provider: 'tencent-agent-mail',
        sender,
        ...(sender ? {} : { reason: 'Agent Mail 未返回可用发件地址' }),
      };
      this.cachedStatus = { status, at: Date.now() };
      return status;
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          enabled: true,
          available: false,
          provider: 'tencent-agent-mail',
          sender: null,
          reason: error.message,
        };
      }
      throw error;
    }
  }

  async send(input: SendAgentMailInput): Promise<SendAgentMailResult> {
    const status = await this.status();
    if (!status.available || !status.sender) {
      throw new DomainError('EMAIL_NOT_CONFIGURED', 503, status.reason ?? 'Agent Mail 当前不可用');
    }

    const directory = await mkdtemp(path.join(tmpdir(), 'teamflow-mail-'));
    try {
      await writeFile(path.join(directory, 'body.txt'), input.body, 'utf8');
      // The API call is the final step of the in-app preview + confirmation flow,
      // so --confirmed represents explicit user authorization for this send.
      const data = await this.run<Record<string, unknown>>(
        [
          'message',
          '+send',
          ...input.recipients.flatMap((recipient) => ['--to', recipient]),
          '--subject',
          input.subject,
          '--body-file',
          'body.txt',
          '--confirmed',
        ],
        directory,
      );
      const messageId =
        (typeof data.message_id === 'string' && data.message_id) ||
        (typeof data.messageId === 'string' && data.messageId) ||
        (typeof data.id === 'string' && data.id) ||
        null;
      return {
        messageId,
        sender: status.sender,
        recipients: input.recipients,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
