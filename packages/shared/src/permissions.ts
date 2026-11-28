import { PROJECT_ROLES, type ProjectRole } from './enums';

export const PERMISSIONS = [
  {
    key: 'project:update',
    label: '编辑项目',
    group: '项目',
    description: '修改项目名称、描述与颜色',
  },
  { key: 'project:archive', label: '归档项目', group: '项目', description: '归档或恢复项目' },
  {
    key: 'project:delete',
    label: '删除项目',
    group: '项目',
    description: '永久删除项目（仅负责人）',
  },
  { key: 'member:invite', label: '邀请成员', group: '成员', description: '创建邀请链接' },
  {
    key: 'member:manage',
    label: '管理成员',
    group: '成员',
    description: '移除成员、修改角色与权限覆盖',
  },
  { key: 'board:manage', label: '管理看板列', group: '看板', description: '增删改与排序列' },
  { key: 'task:create', label: '创建任务', group: '任务', description: '在项目中创建任务' },
  {
    key: 'task:update',
    label: '编辑任务',
    group: '任务',
    description: '修改任务标题、描述、优先级、截止时间与标签',
  },
  { key: 'task:assign', label: '指派任务', group: '任务', description: '修改任务负责人' },
  { key: 'task:move', label: '移动任务', group: '任务', description: '拖拽任务改变列与排序' },
  { key: 'task:delete', label: '删除任务', group: '任务', description: '删除任务' },
  {
    key: 'comment:create',
    label: '发表评论',
    group: '评论',
    description: '在任务下发表评论与 @成员',
  },
  {
    key: 'comment:moderate',
    label: '管理评论',
    group: '评论',
    description: '删除他人的评论（编辑仅限作者本人）',
  },
  { key: 'attachment:upload', label: '上传附件', group: '附件', description: '向任务上传附件' },
  {
    key: 'attachment:delete',
    label: '删除附件',
    group: '附件',
    description: '删除他人上传的附件（本人附件始终可删）',
  },
  { key: 'report:view', label: '查看周报', group: '周报', description: '查看项目周报' },
  { key: 'report:generate', label: '生成周报', group: '周报', description: '手动生成项目周报' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export type PermissionOverrides = Partial<Record<Permission, boolean>>;

export const PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map((item) => item.key);

/** 无论权限覆盖如何配置，都只属于项目负责人的权限。 */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = ['project:delete'];

const ALL: readonly Permission[] = PERMISSION_KEYS;

export const ROLE_PRESETS: Record<ProjectRole, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((key) => key !== 'project:delete'),
  MEMBER: [
    'task:create',
    'task:update',
    'task:assign',
    'task:move',
    'task:delete',
    'comment:create',
    'attachment:upload',
    'report:view',
  ],
  VIEWER: ['comment:create', 'report:view'],
};

export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}

export function isPermissionKey(value: string): value is Permission {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function resolvePermissions(
  role: ProjectRole,
  overrides?: PermissionOverrides | null,
): Permission[] {
  if (role === 'OWNER') return [...ALL];
  const effective = new Set<Permission>(ROLE_PRESETS[role]);
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (!isPermissionKey(key) || typeof value !== 'boolean') continue;
      if (value && OWNER_ONLY_PERMISSIONS.includes(key)) continue;
      if (value) effective.add(key);
      else effective.delete(key);
    }
  }
  return PERMISSION_KEYS.filter((key) => effective.has(key));
}

export function hasPermission(
  role: ProjectRole,
  overrides: PermissionOverrides | null | undefined,
  permission: Permission,
): boolean {
  return resolvePermissions(role, overrides).includes(permission);
}

export function invalidPermissionKeys(overrides: Record<string, boolean>): string[] {
  return Object.keys(overrides).filter((key) => !isPermissionKey(key));
}
