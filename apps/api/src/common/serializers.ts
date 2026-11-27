import type { ProjectRole, TaskPriority, TaskRecurrence } from '@teamflow/shared/enums';

interface AssigneeLike {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskCardLike {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  priority: TaskPriority;
  assignee?: AssigneeLike | null;
  dueDate?: Date | null;
  estimateMinutes?: number | null;
  actualMinutes?: number | null;
  recurrence?: TaskRecurrence;
  labels: string[];
  position: string;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  commentCount?: number;
  attachmentCount?: number;
  subtasks?: Array<{ isDone: boolean }>;
  subtaskTotal?: number;
  subtaskDone?: number;
  blockedByCount?: number;
  blockingCount?: number;
}

export function serializeTaskCard(task: TaskCardLike, assigneeRole: ProjectRole = 'MEMBER') {
  const subtaskTotal = task.subtaskTotal ?? task.subtasks?.length ?? 0;
  const subtaskDone =
    task.subtaskDone ?? task.subtasks?.filter((subtask) => subtask.isDone).length ?? 0;
  return {
    id: task.id,
    projectId: task.projectId,
    columnId: task.columnId,
    title: task.title,
    priority: task.priority,
    assignee: task.assignee
      ? {
          userId: task.assignee.id,
          name: task.assignee.name,
          avatarUrl: task.assignee.avatarUrl,
          role: assigneeRole,
        }
      : null,
    dueDate: task.dueDate ?? null,
    estimateMinutes: task.estimateMinutes ?? null,
    actualMinutes: task.actualMinutes ?? null,
    recurrence: task.recurrence ?? 'NONE',
    labels: task.labels,
    position: task.position,
    completedAt: task.completedAt ?? null,
    commentCount: task.commentCount ?? 0,
    attachmentCount: task.attachmentCount ?? 0,
    subtaskTotal,
    subtaskDone,
    blockedByCount: task.blockedByCount ?? 0,
    blockingCount: task.blockingCount ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export interface ProjectLike {
  id: string;
  name: string;
  description: string | null;
  color: string;
  ownerId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCounts {
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  myOpenTaskCount: number;
}

export function serializeProject(project: ProjectLike, myRole: ProjectRole, counts: ProjectCounts) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    ownerId: project.ownerId,
    myRole,
    archived: project.archivedAt !== null,
    memberCount: counts.memberCount,
    taskCount: counts.taskCount,
    completedTaskCount: counts.completedTaskCount,
    myOpenTaskCount: counts.myOpenTaskCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}
