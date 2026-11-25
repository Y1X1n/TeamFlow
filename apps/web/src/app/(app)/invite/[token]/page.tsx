'use client';

import { useParams } from 'next/navigation';
import { InviteAcceptCard } from '@/features/invites/invite-accept-card';

export default function InvitePage() {
  const params = useParams<{ token: string }>();

  return (
    <>
      <div className="py-4 sm:py-10">
        <InviteAcceptCard token={params.token} />
      </div>
    </>
  );
}
