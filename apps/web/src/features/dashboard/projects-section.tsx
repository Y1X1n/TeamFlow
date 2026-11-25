'use client';

import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';
import { ProjectCard } from './project-card';
import { QueryError } from './query-error';

interface ProjectsSectionProps {
  onCreate: () => void;
}

export function ProjectsSection({ onCreate }: ProjectsSectionProps) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.projects(false),
    queryFn: () => api<{ items: Project[] }>('/projects?archived=false'),
  });

  const projects = data?.items ?? [];

  return (
    <section aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="projects-heading" className="text-lg font-semibold">
            我的项目
          </h2>
          <p className="text-xs text-muted-foreground">
            你参与的未归档项目{isPending ? '' : ` · 共 ${projects.length} 个`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <QueryError
            message={error instanceof ApiError ? error.message : '项目加载失败，请稍后重试。'}
            onRetry={() => void refetch()}
          />
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <FolderPlus className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">还没有项目</p>
              <p className="mt-1 text-sm text-muted-foreground">
                创建你的第一个项目，自动获得待办、进行中、已完成三个看板列。
              </p>
            </div>
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              创建第一个项目
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
