import { ListTodo, Users } from 'lucide-react';
import Link from 'next/link';
import { PROJECT_ROLE_LABELS, type ProjectRole } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Project } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

const ROLE_VARIANTS: Record<ProjectRole, BadgeProps['variant']> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  MEMBER: 'outline',
  VIEWER: 'muted',
};

export function ProjectCard({ project }: { project: Project }) {
  const percent =
    project.taskCount > 0 ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`打开项目 ${project.name}`}
    >
      <Card className="flex h-full flex-col overflow-hidden transition-[box-shadow,transform,border-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <div
          className="h-1.5 w-full shrink-0"
          style={{ backgroundColor: project.color }}
          aria-hidden="true"
        />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{project.name}</h3>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
                {project.description ?? '暂无项目描述'}
              </p>
            </div>
            <Badge variant={ROLE_VARIANTS[project.myRole]} className="shrink-0">
              {PROJECT_ROLE_LABELS[project.myRole]}
            </Badge>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>任务完成</span>
              <span>
                {project.completedTaskCount}/{project.taskCount}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={`${project.name} 任务完成进度`}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {project.memberCount} 位成员
            </span>
            <span className="inline-flex items-center gap-1">
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              我的待办 {project.myOpenTaskCount}
            </span>
          </div>

          <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
            更新于 {formatDateTime(project.updatedAt)}
          </p>
        </div>
      </Card>
    </Link>
  );
}
