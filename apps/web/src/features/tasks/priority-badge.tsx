import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PRIORITY_VARIANTS: Record<TaskPriority, NonNullable<BadgeProps['variant']>> = {
  LOW: 'muted',
  MEDIUM: 'secondary',
  HIGH: 'warning',
  URGENT: 'destructive',
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} className={cn('px-2 py-0 text-[11px]', className)}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
