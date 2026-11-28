'use client';

import { useEffect, useState } from 'react';
import { InviteAcceptCard } from '@/features/invites/invite-accept-card';

export default function InviteHashPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) {
      setToken('');
      return;
    }
    try {
      setToken(decodeURIComponent(raw));
    } catch {
      setToken('');
    }
  }, []);

  return (
    <div className="py-4 sm:py-10">
      {token === null ? null : token ? (
        <InviteAcceptCard token={token} />
      ) : (
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">邀请链接无效</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            链接缺少邀请凭证，请联系项目管理员重新发送邀请。
          </p>
        </div>
      )}
    </div>
  );
}
