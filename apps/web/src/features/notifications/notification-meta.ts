import {
  AlertTriangle,
  AtSign,
  Bell,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Reply,
  ShieldCheck,
  SmilePlus,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  NOTIFICATION_TYPES,
  PROJECT_ROLE_LABELS,
  type NotificationType,
} from '@teamflow/shared/enums';
import type { Notification } from '@/lib/types';

export interface NotificationMeta {
  label: string;
  icon: LucideIcon;
  tone: string;
}

const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  TASK_ASSIGNED: { label: '任务指派', icon: UserPlus, tone: 'bg-indigo-100 text-indigo-600' },
  TASK_COMMENTED: { label: '任务评论', icon: MessageSquare, tone: 'bg-sky-100 text-sky-600' },
  TASK_UPDATED: { label: '任务更新', icon: Pencil, tone: 'bg-blue-100 text-blue-600' },
  COMMENT_REPLY: { label: '回复', icon: Reply, tone: 'bg-cyan-100 text-cyan-600' },
  COMMENT_REACTION: { label: '表情回应', icon: SmilePlus, tone: 'bg-pink-100 text-pink-600' },
  MENTION: { label: '提到我', icon: AtSign, tone: 'bg-violet-100 text-violet-600' },
  TASK_DUE_SOON: { label: '即将到期', icon: Clock, tone: 'bg-amber-100 text-amber-600' },
  TASK_OVERDUE: { label: '任务逾期', icon: AlertTriangle, tone: 'bg-rose-100 text-rose-600' },
  MEMBER_JOINED: { label: '成员加入', icon: Users, tone: 'bg-emerald-100 text-emerald-600' },
  MEMBER_REMOVED: { label: '成员移除', icon: UserMinus, tone: 'bg-muted text-muted-foreground' },
  ROLE_CHANGED: { label: '角色变更', icon: ShieldCheck, tone: 'bg-teal-100 text-teal-600' },
  WEEKLY_REPORT: { label: '周报', icon: FileText, tone: 'bg-indigo-100 text-indigo-600' },
  INVITE: { label: '邀请', icon: Mail, tone: 'bg-orange-100 text-orange-600' },
};

const FALLBACK_META: NotificationMeta = {
  label: '系统通知',
  icon: Bell,
  tone: 'bg-muted text-muted-foreground',
};

export const NOTIFICATION_DESCRIPTIONS: Record<NotificationType, string> = {
  TASK_ASSIGNED: '有人把任务分配给你时提醒。',
  TASK_COMMENTED: '你负责或关注的任务收到新评论时提醒。',
  TASK_UPDATED: '你关注的任务被修改（标题、优先级、截止日期或子任务等）时提醒。',
  COMMENT_REPLY: '有人回复了你在任务下的评论时提醒。',
  COMMENT_REACTION: '有人用表情回应你的评论时提醒。',
  MENTION: '评论中有人 @ 到你时提醒。',
  TASK_DUE_SOON: '任务临近截止时间时提前提醒。',
  TASK_OVERDUE: '任务超过截止日期仍未完成时提醒。',
  MEMBER_JOINED: '有新成员加入你所在的项目时提醒。',
  MEMBER_REMOVED: '你被移出项目时提醒。',
  ROLE_CHANGED: '你的项目角色或权限发生变化时提醒。',
  WEEKLY_REPORT: '项目周报生成后提醒你查看。',
  INVITE: '收到项目邀请时提醒。',
};

export function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPES.some((type) => type === value);
}

export function notificationMeta(type: string): NotificationMeta {
  return isNotificationType(type) ? NOTIFICATION_META[type] : FALLBACK_META;
}

export interface NotificationSummary {
  title: string;
  detail: string | null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readRoleLabel(value: unknown): string | null {
  if (value === 'OWNER' || value === 'ADMIN' || value === 'MEMBER' || value === 'VIEWER') {
    return PROJECT_ROLE_LABELS[value];
  }
  return null;
}

export function notificationSummary(notification: Notification): NotificationSummary {
  const { type, payload } = notification;
  const taskTitle = readString(payload, 'taskTitle');
  const projectName = readString(payload, 'projectName');
  const excerpt = readString(payload, 'excerpt');

  switch (type) {
    case 'TASK_ASSIGNED':
      return {
        title: taskTitle ? `任务「${taskTitle}」已分配给你` : '你有新的任务指派',
        detail: projectName,
      };
    case 'TASK_COMMENTED':
      return {
        title: taskTitle ? `「${taskTitle}」有新的评论` : '你负责的任务有新评论',
        detail: excerpt,
      };
    case 'TASK_UPDATED':
      return {
        title: taskTitle ? `任务「${taskTitle}」有更新` : '你关注的任务有更新',
        detail: projectName,
      };
    case 'COMMENT_REPLY': {
      const author = readString(payload, 'commentAuthorName');
      const replyWhere = taskTitle ? `你在「${taskTitle}」的评论` : '你的评论';
      return {
        title: author ? `${author} 回复了${replyWhere}` : `${replyWhere}收到回复`,
        detail: excerpt,
      };
    }
    case 'COMMENT_REACTION': {
      const reactor = readString(payload, 'reactorName') ?? '有人';
      const emoji = readString(payload, 'emoji');
      return {
        title: `${reactor}${emoji ? `用「${emoji}」` : ''}回应了你的评论`,
        detail: taskTitle ? `任务「${taskTitle}」` : excerpt,
      };
    }
    case 'MENTION':
      return {
        title: taskTitle ? `你在「${taskTitle}」中被提及` : '有人在评论中提到了你',
        detail: excerpt,
      };
    case 'TASK_DUE_SOON':
      return {
        title: taskTitle ? `任务「${taskTitle}」即将到期` : '你有任务即将到期',
        detail: projectName,
      };
    case 'TASK_OVERDUE':
      return {
        title: taskTitle ? `任务「${taskTitle}」已逾期` : '你有任务已逾期',
        detail: projectName,
      };
    case 'MEMBER_JOINED': {
      const name = readString(payload, 'name');
      return {
        title: name ? `${name} 加入了项目` : '有新成员加入项目',
        detail: projectName,
      };
    }
    case 'MEMBER_REMOVED':
      return {
        title: projectName ? `你已被移出项目「${projectName}」` : '你已被移出项目',
        detail: null,
      };
    case 'ROLE_CHANGED': {
      const role = readRoleLabel(payload.role);
      if (payload.kind === 'permissions') {
        return { title: '你的项目权限已被更新', detail: '管理员调整了你的权限配置。' };
      }
      return {
        title: role ? `你的项目角色已变更为「${role}」` : '你的项目角色已更新',
        detail: null,
      };
    }
    case 'WEEKLY_REPORT': {
      const weekStart = readString(payload, 'weekStart');
      return {
        title: projectName ? `「${projectName}」周报已生成` : '新的项目周报已生成',
        detail: weekStart ? `${weekStart} 当周` : null,
      };
    }
    case 'INVITE': {
      const role = readRoleLabel(payload.role);
      return {
        title: projectName ? `你收到项目「${projectName}」的邀请` : '你收到一个项目邀请',
        detail: role ? `邀请角色：${role}` : null,
      };
    }
    default:
      return { title: '你有一条新通知', detail: null };
  }
}

function invitePathname(value: string): string | null {
  try {
    const url = new URL(value, 'http://localhost');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function notificationHref(notification: Notification): string | null {
  const { payload } = notification;
  const projectId = readString(payload, 'projectId');
  const taskId = readString(payload, 'taskId');
  const reportId = readString(payload, 'reportId');
  const inviteUrl = readString(payload, 'inviteUrl');

  if (taskId && projectId) {
    return `/projects/${projectId}?task=${encodeURIComponent(taskId)}`;
  }
  if (reportId && projectId) {
    return `/projects/${projectId}/reports`;
  }
  if (inviteUrl) {
    const pathname = invitePathname(inviteUrl);
    if (pathname) return pathname;
  }
  if (projectId) {
    return `/projects/${projectId}`;
  }
  return null;
}
