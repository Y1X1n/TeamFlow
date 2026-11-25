'use client';

import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectTabs } from '@/features/projects/project-tabs';
import type { Project } from '@/lib/types';

interface ProjectPageHeaderProps {
  projectId: string;
  project?: Project;
}

export function ProjectPageHeader({ projectId, project }: ProjectPageHeaderProps) {
  const base = `/projects/${projectId}`;

  return (
    <div className="mb-6 space-y-4">
      <Link
        href={base}
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回看板
      </Link>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {project ? (
          <>
            <span
              className="h-4 w-4 shrink-0 rounded-full ring-2 ring-background"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            {project.archived ? <Badge variant="warning">已归档</Badge> : null}
            <Badge variant="muted">{PROJECT_ROLE_LABELS[project.myRole]}</Badge>
          </>
        ) : (
          <Skeleton className="h-8 w-56" />
        )}
      </div>

      <ProjectTabs projectId={projectId} />
    </div>
  );
}

export function ProjectPageError({ message }: { message?: string }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold">无法加载项目</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? '项目不存在，或你无权访问该项目。'}
      </p>
      <Button asChild className="mt-5">
        <Link href="/">返回工作台</Link>
      </Button>
    </Card>
  );
}
