import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const LABEL_COLOR_CLASSES = [
  'border-sky-200 bg-sky-50 text-sky-700',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-teal-200 bg-teal-50 text-teal-700',
  'border-indigo-200 bg-indigo-50 text-indigo-700',
  'border-orange-200 bg-orange-50 text-orange-700',
] as const;

const DEFAULT_LABEL_COLOR_CLASS = 'border-border bg-muted text-muted-foreground';

export function labelColorClass(label: string): string {
  const normalized = label.trim();
  if (!normalized) return DEFAULT_LABEL_COLOR_CLASS;

  let hash = 0;
  for (const char of normalized) {
    hash = (hash + (char.codePointAt(0) ?? 0)) % 9973;
  }

  return LABEL_COLOR_CLASSES[hash % LABEL_COLOR_CLASSES.length] ?? DEFAULT_LABEL_COLOR_CLASS;
}

export function TaskLabelBadge({ label, className }: { label: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(labelColorClass(label), 'px-1.5 py-0 text-[10px] font-normal', className)}
    >
      {label}
    </Badge>
  );
}
