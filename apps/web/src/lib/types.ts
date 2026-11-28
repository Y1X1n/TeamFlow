import type { NotificationType, ProjectRole, TaskPriority, TaskRecurrence } from '@teamflow/shared/enums';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  ownerId: string;
  myRole: ProjectRole;
  archived: boolean;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  myOpenTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  id: string;
  projectId: string;
  name: string;
  position: string;
  isDone: boolean;
  taskCount: number;
}

export interface MemberSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  skills?: string[];
}

export interface Member extends MemberSummary {
  id: string;
  email: string;
  permissionOverrides: Record<string, boolean> | null;
  joinedAt: string;
}

export interface TaskCard {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  priority: TaskPriority;
  assignee: MemberSummary | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  recurrence: TaskRecurrence;
  labels: string[];
  position: string;
  completedAt: string | null;
  commentCount: number;
  attachmentCount: number;
  subtaskTotal: number;
  subtaskDone: number;
  blockedByCount: number;
  blockingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrashTask {
  id: string;
  projectId: string;
  title: string;
  columnId: string;
  columnName: string;
  priority: TaskPriority;
  assignee: { userId: string; name: string; avatarUrl: string | null } | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  recurrence: TaskRecurrence;
  labels: string[];
  deletedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependencyRef {
  taskId: string;
  title: string;
  columnId: string;
  columnName: string;
  completed: boolean;
}

export interface TaskDetail extends TaskCard {
  description: Record<string, unknown> | null;
  createdBy: { userId: string; name: string };
  subtasks: Subtask[];
  watching: boolean;
  watcherCount: number;
  blockedBy: TaskDependencyRef[];
  blocking: TaskDependencyRef[];
}

export interface BoardData {
  project: Project;
  columns: BoardColumn[];
  tasks: TaskCard[];
  members: MemberSummary[];
  myPermissions: string[];
}

export interface CommentReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userNames: string[];
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: { userId: string; name: string; avatarUrl: string | null };
  parentId: string | null;
  replyTo: { commentId: string; userId: string; name: string } | null;
  body: Record<string, unknown> | null;
  bodyText: string | null;
  mentions: string[];
  reactions: CommentReaction[];
  replyCount: number;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { userId: string; name: string };
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  actor: { userId: string; name: string; avatarUrl: string | null } | null;
  taskId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface WeekTaskRef {
  taskId: string;
  title: string;
  columnName: string;
  assigneeName: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  blockedByCount: number;
  blockedByTitles: string[];
  reason?: string;
}

export interface WeekMetrics {
  createdTasks: number;
  completedTasks: number;
  activeTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  comments: number;
  activeMembers: number;
  totalTasks: number;
}

export interface WeekSummaryData {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  metrics: WeekMetrics;
  summary: string;
  activeMemberDetails: Array<{ userId: string; name: string; actions: number }>;
  completionByMember: Array<{ userId: string; name: string; completed: number }>;
  highlightTasks: Array<{ taskId: string; title: string; completedAt: string | null }>;
  completedTaskList: WeekTaskRef[];
  openTaskList: WeekTaskRef[];
  riskTaskList: WeekTaskRef[];
  upcomingTaskList: WeekTaskRef[];
}

export interface CurrentWeekSummary extends WeekSummaryData {
  project: { id: string; name: string; color: string; archived: boolean };
}

export interface WeeklyReport {
  id: string;
  projectId: string;
  weekStart: string;
  weekEnd: string;
  data: {
    weekStart?: string;
    weekEnd?: string;
    generatedAt?: string;
    metrics?: {
      createdTasks?: number;
      completedTasks?: number;
      activeTasks?: number;
      overdueTasks?: number;
      blockedTasks?: number;
      comments?: number;
      activeMembers?: number;
      totalTasks?: number;
    };
    summary?: string;
    activeMemberDetails?: Array<{ userId: string; name: string; actions: number }>;
    completionByMember?: Array<{ userId: string; name: string; completed: number }>;
    highlightTasks?: Array<{ taskId: string; title: string; completedAt: string | null }>;
    completedTaskList?: WeekTaskRef[];
    openTaskList?: WeekTaskRef[];
    riskTaskList?: WeekTaskRef[];
    upcomingTaskList?: WeekTaskRef[];
  };
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportEmailStatus {
  enabled: boolean;
  available: boolean;
  provider: string;
  sender: string | null;
  reason?: string;
}

export interface ReportEmailPreview {
  weekStart: string;
  weekEnd: string;
  recipients: string[];
  subject: string;
  body: string;
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
  sender: string | null;
  emailAvailable: boolean;
  emailReason: string | null;
  previewToken: string;
}

export interface ReportEmailSendResult {
  sent: boolean;
  messageId: string | null;
  sender: string;
  recipients: string[];
  sentAt: string;
}

export interface InvitePreview {
  projectId: string;
  projectName: string;
  projectColor: string;
  role: ProjectRole;
  inviterName: string;
  email: string;
  expiresAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: ProjectRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationPage extends Paginated<Notification> {
  unreadCount: number;
}

export interface SearchResults {
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string;
    archived: boolean;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    projectColor: string;
    columnId: string;
    columnName: string;
    priority: TaskPriority;
    dueDate: string | null;
    completedAt: string | null;
  }>;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    projects: Array<{ id: string; name: string }>;
  }>;
}

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  fallback: 'local';
  costNotice: string | null;
}

export interface AiBreakdown {
  subtasks: string[];
  source: 'ai' | 'local';
  model?: string;
  notice?: string;
}

export interface MyTask extends TaskCard {
  project: { id: string; name: string; color: string };
}

export interface MyPermissions {
  projectId: string;
  role: ProjectRole;
  permissions: string[];
  overrides: Record<string, boolean> | null;
  archived: boolean;
}

export type ReportPeriod = 'daily' | 'weekly';
export type ReportScope = 'team' | 'member';

export interface PeriodMemberStats {
  userId: string;
  name: string;
  role: ProjectRole;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
}

export interface PeriodReport {
  project: { id: string; name: string; color: string; archived: boolean };
  period: ReportPeriod;
  scope: ReportScope;
  startDate: string;
  endDate: string;
  generatedAt: string;
  assignee: MemberSummary | null;
  metrics: WeekMetrics;
  summary: string;
  memberStats?: PeriodMemberStats[];
  unassignedOpenTaskCount?: number;
  activeMemberDetails: Array<{ userId: string; name: string; actions: number }>;
  completionByMember: Array<{ userId: string; name: string; completed: number }>;
  highlightTasks: Array<{ taskId: string; title: string; completedAt: string | null }>;
  completedTaskList: WeekTaskRef[];
  openTaskList: WeekTaskRef[];
  riskTaskList: WeekTaskRef[];
  upcomingTaskList: WeekTaskRef[];
}

export interface PeriodReportNarrative {
  narrative: string;
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
  generatedAt: string;
}

export interface AssignSuggestionCandidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
  score: number;
  skillMatches: string[];
  reasons: string[];
}

export interface AssignSuggestionsResult {
  task: { id: string; title: string };
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
  costNotice: string | null;
  candidates: AssignSuggestionCandidate[];
}

export interface AiPlanStep {
  title: string;
  reason: string | null;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  priority: TaskPriority;
  dueInDays: number | null;
  dependsOn: number[];
}

export interface AiPlanResult {
  steps: AiPlanStep[];
  source: 'ai' | 'local';
  model?: string;
  notice?: string;
}
