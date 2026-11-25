'use client';

import { useAuth } from '@/lib/auth';
import { useNotificationStream } from '@/hooks/use-notification-stream';

export function NotificationStreamMount() {
  const { status } = useAuth();
  useNotificationStream(status === 'authenticated');
  return null;
}
