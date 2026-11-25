'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export interface RichTextEditorProps {
  value?: Record<string, unknown> | null;
  onChange: (json: Record<string, unknown>, text: string) => void;
  members?: Array<{ userId: string; name: string }>;
  disabled?: boolean;
  minHeight?: string;
}

export const RichTextEditor = dynamic(
  () => import('./rich-text-editor-inner').then((module) => module.RichTextEditorInner),
  {
    ssr: false,
    loading: () => <Skeleton className="h-28 w-full" />,
  },
);
