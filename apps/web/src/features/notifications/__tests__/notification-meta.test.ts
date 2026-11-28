import { describe, expect, it } from 'vitest';
import type { Notification } from '@/lib/types';
import { notificationHref } from '../notification-meta';

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    type: 'INVITE',
    payload: {},
    read: false,
    readAt: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('notificationHref', () => {
  it('keeps the invite token fragment when linking from a notification', () => {
    const href = notificationHref(
      notification({ payload: { inviteUrl: 'https://app.example.com/invite#secret-token' } }),
    );

    expect(href).toBe('/invite#secret-token');
  });

  it('keeps legacy invite paths working', () => {
    const href = notificationHref(
      notification({ payload: { inviteUrl: 'https://app.example.com/invite/secret-token' } }),
    );

    expect(href).toBe('/invite/secret-token');
  });
});
