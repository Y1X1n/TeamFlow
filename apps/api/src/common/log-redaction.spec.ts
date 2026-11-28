import { redactSensitiveUrl } from './log-redaction';

describe('redactSensitiveUrl', () => {
  it('redacts invite tokens in the path', () => {
    expect(redactSensitiveUrl('/api/v1/invites/abc123?x=1')).toBe(
      '/api/v1/invites/[redacted]?x=1',
    );
  });

  it('redacts token query parameters but keeps other parameters', () => {
    expect(redactSensitiveUrl('/api/v1/files/local?token=secret&download=1')).toBe(
      '/api/v1/files/local?token=[redacted]&download=1',
    );
  });

  it('leaves ordinary URLs untouched', () => {
    expect(redactSensitiveUrl('/api/v1/projects/p1/board?status=open')).toBe(
      '/api/v1/projects/p1/board?status=open',
    );
  });
});
