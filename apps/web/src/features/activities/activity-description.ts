import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { isProjectRole } from '@teamflow/shared/permissions';
import type { Activity } from '@/lib/types';

export interface ActivityDescription {
  text: string;
  meta?: string;
  excerpt?: string;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function memberName(names: Map<string, string>, payload: Record<string, unknown>): string {
  const userId = readString(payload, 'userId');
  if (!userId) return '某成员';
  return names.get(userId) ?? '某成员';
}

function roleLabel(payload: Record<string, unknown>, key: string): string | null {
  const value = readString(payload, key);
  if (!value || !isProjectRole(value)) return null;
  return PROJECT_ROLE_LABELS[value];
}

function taskTitle(payload: Record<string, unknown>): string {
  return readString(payload, 'title') ?? '未命名任务';
}

function quote(value: string): string {
  return `「${value}」`;
}

export function describeActivity(
  activity: Activity,
  names: Map<string, string>,
): ActivityDescription {
  const { type, payload } = activity;

  switch (type) {
    case 'PROJECT_CREATED':
      return { text: '创建了项目' };
    case 'PROJECT_UPDATED':
      return { text: '更新了项目信息' };
    case 'PROJECT_ARCHIVED':
      return { text: '归档了项目' };
    case 'PROJECT_UNARCHIVED':
      return { text: '恢复了项目' };
    case 'MEMBER_JOINED': {
      const role = roleLabel(payload, 'role');
      return { text: '加入了项目', meta: role ? `角色：${role}` : undefined };
    }
    case 'MEMBER_REMOVED':
      return { text: `移除了成员 ${memberName(names, payload)}` };
    case 'MEMBER_ROLE_CHANGED': {
      const from = roleLabel(payload, 'from') ?? '原角色';
      const to = roleLabel(payload, 'to') ?? '新角色';
      return {
        text: `将 ${memberName(names, payload)} 的角色从「${from}」调整为「${to}」`,
      };
    }
    case 'MEMBER_PERMISSIONS_CHANGED':
      return { text: `更新了 ${memberName(names, payload)} 的权限覆盖` };
    case 'COLUMN_CREATED': {
      const name = readString(payload, 'name') ?? '未命名列';
      return { text: `新建了看板列${quote(name)}` };
    }
    case 'COLUMN_UPDATED': {
      const name = readString(payload, 'name') ?? '未命名列';
      if (payload.moved === true) return { text: `调整了看板列${quote(name)}的顺序` };
      if (typeof payload.isDone === 'boolean') {
        return { text: `更新了看板列${quote(name)}的完成标记` };
      }
      return { text: `重命名了看板列${quote(name)}` };
    }
    case 'COLUMN_DELETED': {
      const name = readString(payload, 'name') ?? '未命名列';
      return { text: `删除了看板列${quote(name)}` };
    }
    case 'TASK_CREATED':
      return { text: `创建了任务${quote(taskTitle(payload))}` };
    case 'TASK_UPDATED':
      return { text: `更新了任务${quote(taskTitle(payload))}` };
    case 'TASK_MOVED':
      return { text: `移动了任务${quote(taskTitle(payload))}` };
    case 'TASK_COMPLETED':
      return { text: `完成了任务${quote(taskTitle(payload))}` };
    case 'TASK_REOPENED':
      return { text: `重新打开了任务${quote(taskTitle(payload))}` };
    case 'TASK_ASSIGNED':
      return { text: `指派了任务${quote(taskTitle(payload))}` };
    case 'TASK_DELETED':
      return { text: `删除了任务${quote(taskTitle(payload))}` };
    case 'TASK_DEPENDENCY_ADDED': {
      const blocker = readString(payload, 'blockedByTitle') ?? '其他任务';
      return {
        text: `为任务${quote(taskTitle(payload))}添加依赖`,
        meta: `需先完成「${blocker}」`,
      };
    }
    case 'TASK_DEPENDENCY_REMOVED': {
      const blocker = readString(payload, 'blockedByTitle') ?? '其他任务';
      return {
        text: `移除了任务${quote(taskTitle(payload))}的依赖`,
        meta: `不再等待「${blocker}」`,
      };
    }
    case 'COMMENT_CREATED':
      return {
        text: '发表了评论',
        excerpt: readString(payload, 'excerpt') ?? undefined,
      };
    case 'COMMENT_UPDATED':
      return { text: '更新了评论' };
    case 'COMMENT_DELETED':
      return {
        text: '删除了评论',
        excerpt: readString(payload, 'excerpt') ?? undefined,
      };
    case 'ATTACHMENT_ADDED': {
      const fileName = readString(payload, 'fileName') ?? '附件';
      return { text: `上传了附件${quote(fileName)}` };
    }
    case 'ATTACHMENT_DELETED': {
      const fileName = readString(payload, 'fileName') ?? '附件';
      return { text: `删除了附件${quote(fileName)}` };
    }
    case 'REPORT_GENERATED': {
      const weekStart = readString(payload, 'weekStart');
      return {
        text: weekStart ? `生成了 ${weekStart} 当周的周报` : '生成了项目周报',
      };
    }
    case 'REPORT_EMAIL_SENT': {
      const subject = readString(payload, 'subject');
      const recipientCount = readNumber(payload, 'recipientCount');
      return {
        text: '发送了周报邮件',
        meta: [
          subject ? `主题：${subject}` : null,
          recipientCount !== null ? `收件人：${recipientCount} 位` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    default:
      return { text: '更新了项目动态' };
  }
}
