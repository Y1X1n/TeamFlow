import { KNOWN_DEV_JWT_SECRETS, validateEnv } from './env';

const baseEnv = {
  DATABASE_URL: 'postgresql://teamflow:teamflow@localhost:55432/teamflow',
  REDIS_URL: 'redis://localhost:6380',
  JWT_SECRET: 'a-unique-production-secret-at-least-32-chars',
};

describe('validateEnv', () => {
  it('accepts a unique secret in production', () => {
    const env = validateEnv({ ...baseEnv, NODE_ENV: 'production' });

    expect(env.NODE_ENV).toBe('production');
    expect(env.TRUST_PROXY).toBe(0);
  });

  it.each(KNOWN_DEV_JWT_SECRETS)('rejects the public default secret %s in production', (secret) => {
    expect(() =>
      validateEnv({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: secret }),
    ).toThrow(/JWT_SECRET/);
  });

  it('still allows the documented development placeholder outside production', () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      JWT_SECRET: KNOWN_DEV_JWT_SECRETS[0],
    });

    expect(env.JWT_SECRET).toBe(KNOWN_DEV_JWT_SECRETS[0]);
  });

  it('parses TRUST_PROXY for deployments behind a reverse proxy', () => {
    expect(validateEnv({ ...baseEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it('requires HTTPS for AI calls in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        AI_BASE_URL: 'http://ai.example.com/v1',
      }),
    ).toThrow(/AI_BASE_URL/);
    expect(
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        AI_BASE_URL: 'https://ai.example.com/v1',
      }).AI_BASE_URL,
    ).toBe('https://ai.example.com/v1');
  });

  it('rejects loopback AI calls in production', () => {
    expect(() =>
      validateEnv({ ...baseEnv, NODE_ENV: 'production', AI_ALLOW_LOOPBACK: 'true' }),
    ).toThrow(/AI_ALLOW_LOOPBACK/);
  });
});
