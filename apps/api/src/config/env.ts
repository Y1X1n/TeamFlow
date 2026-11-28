import { z } from 'zod';

const boolFromString = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean());

/** 仓库中公开出现过的占位 secret，生产环境必须显式替换。 */
export const KNOWN_DEV_JWT_SECRETS: readonly string[] = [
  'dev-only-change-me-please-32-bytes-minimum',
  'change-me-32-bytes-minimum',
];

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(1235),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  COOKIE_SECURE: boolFromString(true),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TZ: z.string().default('Asia/Shanghai'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('teamflow'),
  S3_FORCE_PATH_STYLE: boolFromString(true),
  SENTRY_DSN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  AI_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  AI_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  AI_MODEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(20_000),
  AI_ALLOW_LOOPBACK: boolFromString(false),
  AGENT_MAIL_ENABLED: boolFromString(false),
  AGENT_MAIL_CLI_ENTRY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WORKER_ONLY: boolFromString(false),
  ENABLE_REALTIME: boolFromString(true),
  ENABLE_JOBS: boolFromString(true),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
})
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && KNOWN_DEV_JWT_SECRETS.includes(value.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'must be replaced with a unique random value in production (repo defaults are public)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
