'use client';

import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ProjectTabs } from '@/features/projects/project-tabs';
import { avatarColor, cn } from '@/lib/utils';
import type { MemberSummary, Project } from '@/lib/types';

interface BoardHeaderProps {
  project: Project;
  members: MemberSummary[];
  onlineUserIds: string[];
  canCreateTask: boolean;
  onCreateTask: () => void;
}

export function BoardHeader({
  project,
  members,
  onlineUserIds,
  canCreateTask,
  onCreateTask,
}: BoardHeaderProps) {
  const onlineSet = new Set(onlineUserIds);
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const onlineMembers = onlineUserIds.flatMap((id) => {
    const member = memberById.get(id);
    return member ? [member] : [];
  });
  const shownMembers = members.slice(0, 6);
  const hiddenCount = members.length - shownMembers.length;
  const onlineNames = onlineMembers
    .slice(0, 3)
    .map((member) => member.name)
    .join('、');
  const moreOnline = onlineMembers.length - 3;

  return (
    <div className="space-y-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        返回工作台
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
            {project.archived ? <Badge variant="warning">已归档</Badge> : null}
            <Badge variant="muted">{PROJECT_ROLE_LABELS[project.myRole]}</Badge>
          </div>
          {project.description ? (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center" aria-label="项目成员">
              {shownMembers.map((member, index) => {
                const online = onlineSet.has(member.userId);
                return (
                  <span
                    key={member.userId}
                    title={online ? `${member.name}（在线）` : member.name}
                    className={cn('inline-flex rounded-full', index > 0 && '-ml-2')}
                  >
                    <UserAvatar
                      name={member.name}
                      src={member.avatarUrl}
                      color={avatarColor(member.userId)}
                      className={cn(
                        'h-7 w-7 border-2 border-background',
                        online && 'ring-2 ring-emerald-500',
                      )}
                    />
                  </span>
                );
              })}
              {hiddenCount > 0 ? (
                <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] text-muted-foreground">
                  +{hiddenCount}
                </span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {onlineMembers.length > 0
                ? `在线 ${onlineMembers.length} 人：${onlineNames}${moreOnline > 0 ? ' 等' : ''}`
                : '暂无其他成员在线'}
            </span>
          </div>
        </div>

        {canCreateTask ? (
          <Button onClick={onCreateTask}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建任务
          </Button>
        ) : null}
      </div>

      <ProjectTabs projectId={project.id} />
    </div>
  );
}
