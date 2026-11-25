import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { SearchResults } from '@/lib/types';

export type CommandGroupKey = 'projects' | 'tasks' | 'members';

export interface CommandEntry {
  /** 全局唯一，用作 listbox 选项 id 的一部分 */
  id: string;
  href: string;
  label: string;
  description: string;
  /** 项目 / 任务项目色点 */
  color?: string;
  /** 成员头像 */
  avatar?: { name: string; src: string | null };
  /** 右侧附加语义，例如优先级 */
  badge?: string;
}

export interface CommandGroup {
  key: CommandGroupKey;
  label: string;
  entries: CommandEntry[];
}

export function buildCommandGroups(results: SearchResults | undefined): CommandGroup[] {
  if (!results) return [];

  const groups: CommandGroup[] = [];

  if (results.projects.length > 0) {
    groups.push({
      key: 'projects',
      label: '项目',
      entries: results.projects.map((project) => ({
        id: `project-${project.id}`,
        href: `/projects/${project.id}`,
        label: project.name,
        description: project.description?.trim() || (project.archived ? '已归档项目' : '项目'),
        color: project.color,
        badge: project.archived ? '已归档' : undefined,
      })),
    });
  }

  if (results.tasks.length > 0) {
    groups.push({
      key: 'tasks',
      label: '任务',
      entries: results.tasks.map((task) => ({
        id: `task-${task.id}`,
        href: `/projects/${task.projectId}?task=${task.id}`,
        label: task.title,
        description: `${task.projectName} · ${task.columnName}`,
        color: task.projectColor,
        badge: TASK_PRIORITY_LABELS[task.priority],
      })),
    });
  }

  const memberEntries = results.members.flatMap((member) => {
    const firstProject = member.projects[0];
    if (!firstProject) return [];
    return [
      {
        id: `member-${member.userId}`,
        href: `/projects/${firstProject.id}/settings`,
        label: member.name,
        description: member.email,
        avatar: { name: member.name, src: member.avatarUrl },
        badge: member.projects.length > 1 ? `${member.projects.length} 个项目` : firstProject.name,
      },
    ];
  });

  if (memberEntries.length > 0) {
    groups.push({ key: 'members', label: '成员', entries: memberEntries });
  }

  return groups;
}

export function flattenCommandGroups(groups: CommandGroup[]): CommandEntry[] {
  return groups.flatMap((group) => group.entries);
}
