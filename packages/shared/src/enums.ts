export const PROJECT_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  OWNER: '负责人',
  ADMIN: '管理员',
  MEMBER: '成员',
  VIEWER: '只读成员',
};

export const INVITE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
};

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_COMMENTED',
  'TASK_UPDATED',
  'COMMENT_REPLY',
  'COMMENT_REACTION',
  'MENTION',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'MEMBER_JOINED',
  'MEMBER_REMOVED',
  'ROLE_CHANGED',
  'WEEKLY_REPORT',
  'INVITE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ACTIVITY_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'PROJECT_UNARCHIVED',
  'MEMBER_JOINED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_PERMISSIONS_CHANGED',
  'COLUMN_CREATED',
  'COLUMN_UPDATED',
  'COLUMN_DELETED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'TASK_ASSIGNED',
  'TASK_DELETED',
  'COMMENT_CREATED',
  'COMMENT_UPDATED',
  'COMMENT_DELETED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_DELETED',
  'REPORT_GENERATED',
  'REPORT_EMAIL_SENT',
  'TASK_DEPENDENCY_ADDED',
  'TASK_DEPENDENCY_REMOVED',
  'MEMBER_SKILLS_CHANGED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TASK = 20;
export const TASK_BOARD_LIMIT = 1000;
export const TASK_DESCRIPTION_MAX_BYTES = 100 * 1024;
export const COMMENT_TEXT_MAX_LENGTH = 5000;
export const TASK_LABELS_MAX = 5;
export const TASK_LABEL_MAX_LENGTH = 20;
export const TASK_ESTIMATE_MIN_MINUTES = 15;
export const TASK_ESTIMATE_MAX_MINUTES = 7 * 24 * 60;
export const MEMBER_SKILLS_MAX = 6;
export const MEMBER_SKILL_MAX_LENGTH = 20;
export const MEMBER_SKILL_PRESETS = [
  '前端',
  '后端',
  '设计',
  '文档',
  '测试',
  '运营',
  '答辩',
] as const;
export const BOARD_DEFAULT_COLUMNS = [
  { name: '待办', isDone: false },
  { name: '进行中', isDone: false },
  { name: '已完成', isDone: true },
] as const;

export const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '👀'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const SUBTASK_MAX_PER_TASK = 50;
export const SUBTASK_TITLE_MAX_LENGTH = 120;

export const PROJECT_TEMPLATE_IDS = ['BLANK', 'COURSE', 'CLUB', 'COMPETITION'] as const;
export type ProjectTemplate = (typeof PROJECT_TEMPLATE_IDS)[number];

export const PROJECT_TEMPLATES = [
  {
    id: 'BLANK',
    label: '空白项目',
    description: '标准三列看板，从零开始。',
    columns: BOARD_DEFAULT_COLUMNS,
    tasks: [],
  },
  {
    id: 'COURSE',
    label: '课程项目',
    description: '适合课程设计、毕业设计等学期任务。',
    columns: BOARD_DEFAULT_COLUMNS,
    tasks: [
      { title: '选题与调研', priority: 'HIGH', labels: ['调研'] },
      { title: '开题报告', priority: 'HIGH', labels: ['文档'] },
      { title: '核心功能实现', priority: 'MEDIUM', labels: ['开发'] },
      { title: '中期检查', priority: 'MEDIUM', labels: ['评审'] },
      { title: '论文初稿', priority: 'HIGH', labels: ['文档'] },
      { title: '答辩准备', priority: 'MEDIUM', labels: ['演示'] },
    ],
  },
  {
    id: 'CLUB',
    label: '社团活动',
    description: '从策划到复盘的完整活动流程。',
    columns: [
      { name: '策划', isDone: false },
      { name: '筹备', isDone: false },
      { name: '执行', isDone: false },
      { name: '复盘', isDone: true },
    ],
    tasks: [
      { title: '确定活动主题与目标', priority: 'HIGH', labels: ['策划'] },
      { title: '场地与预算申请', priority: 'HIGH', labels: ['筹备'] },
      { title: '宣传物料设计', priority: 'MEDIUM', labels: ['宣传'] },
      { title: '报名与通知', priority: 'MEDIUM', labels: ['运营'] },
      { title: '现场执行与拍照', priority: 'HIGH', labels: ['执行'] },
      { title: '复盘总结', priority: 'LOW', labels: ['复盘'] },
    ],
  },
  {
    id: 'COMPETITION',
    label: '竞赛项目',
    description: '适合黑客松、学科竞赛的提交节奏。',
    columns: [
      { name: '构思', isDone: false },
      { name: '开发', isDone: false },
      { name: '提交', isDone: false },
      { name: '答辩', isDone: true },
    ],
    tasks: [
      { title: '确定赛题与分工', priority: 'URGENT', labels: ['规划'] },
      { title: '技术方案评审', priority: 'HIGH', labels: ['设计'] },
      { title: '核心功能开发', priority: 'URGENT', labels: ['开发'] },
      { title: '演示视频录制', priority: 'MEDIUM', labels: ['演示'] },
      { title: '提交材料检查', priority: 'HIGH', labels: ['交付'] },
      { title: '答辩演练', priority: 'MEDIUM', labels: ['答辩'] },
    ],
  },
] as const satisfies ReadonlyArray<{
  id: ProjectTemplate;
  label: string;
  description: string;
  columns: ReadonlyArray<{ name: string; isDone: boolean }>;
  tasks: ReadonlyArray<{ title: string; priority: TaskPriority; labels: string[] }>;
}>;
