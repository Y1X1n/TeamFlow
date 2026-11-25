'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { CreateProjectDialog } from './create-project-dialog';
import { MyTasksSection } from './my-tasks-section';
import { NotificationsSummary } from './notifications-summary';
import { ProjectsSection } from './projects-section';

interface DashboardViewProps {
  autoCreate?: boolean;
}

export function DashboardView({ autoCreate = false }: DashboardViewProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (autoCreate) setCreateOpen(true);
  }, [autoCreate]);

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open && autoCreate) {
      router.replace('/', { scroll: false });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            欢迎回来，{user?.name ?? '伙伴'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">看看项目进度，处理分配给你的任务。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          新建项目
        </Button>
      </div>

      <ProjectsSection onCreate={() => setCreateOpen(true)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MyTasksSection />
        </div>
        <div>
          <NotificationsSummary />
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={handleCreateOpenChange} />
    </div>
  );
}
