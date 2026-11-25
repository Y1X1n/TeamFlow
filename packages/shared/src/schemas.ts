import { z } from 'zod';
import {
  INVITE_ROLES,
  MEMBER_SKILL_MAX_LENGTH,
  MEMBER_SKILLS_MAX,
  NOTIFICATION_TYPES,
  PROJECT_ROLES,
  PROJECT_TEMPLATE_IDS,
  REACTION_EMOJIS,
  SUBTASK_TITLE_MAX_LENGTH,
  TASK_LABEL_MAX_LENGTH,
  TASK_LABELS_MAX,
  TASK_PRIORITIES,
} from './enums';
import { invalidPermissionKeys, isPermissionKey, type PermissionOverrides } from './permissions';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, '密码必须包含字母')
  .regex(/\d/, '密码必须包含数字');
const nameSchema = z.string().trim().min(1).max(40);
const skillSchema = z
  .string()
  .trim()
  .min(1)
  .max(MEMBER_SKILL_MAX_LENGTH)
  .regex(/^[^\r\n]+$/, '职能标签不能包含换行');
const memberSkillsSchema = z
  .array(skillSchema)
  .max(MEMBER_SKILLS_MAX, `最多 ${MEMBER_SKILLS_MAX} 个职能标签`)
  .refine((items) => new Set(items).size === items.length, '职能标签不能重复');
const httpAvatarUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), '头像必须是 http(s) URL');
const dataAvatarUrlSchema = z
  .string()
  .trim()
  .max(100_000, '头像文件过大')
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, '头像必须是 PNG/JPEG/WebP 图片');
const avatarUrlSchema = z.union([httpAvatarUrlSchema, dataAvatarUrlSchema]);
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是 #RRGGBB');
const idSchema = z.string().trim().min(1).max(64);
const dateTimeSchema = z.string().datetime({ offset: true });
const labelsSchema = z
  .array(z.string().trim().min(1).max(TASK_LABEL_MAX_LENGTH))
  .max(TASK_LABELS_MAX);
const richTextSchema = z.record(z.unknown());
const overridesSchema = z.record(z.boolean()).superRefine((value, ctx) => {
  const invalid = invalidPermissionKeys(value);
  if (invalid.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `未知权限键: ${invalid.join(', ')}`,
      path: ['permissionOverrides'],
    });
  }
});

const booleanQuery = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(72),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const updateMeSchema = z
  .object({
    name: nameSchema.optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, '新密码不能与当前密码相同');
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(500).optional(),
    color: colorSchema.optional(),
    template: z.enum(PROJECT_TEMPLATE_IDS).optional(),
  })
  .strict();
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: colorSchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createInviteSchema = z
  .object({
    email: emailSchema,
    role: z.enum(INVITE_ROLES),
  })
  .strict();
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional(),
    permissionOverrides: overridesSchema.nullable().optional(),
    skills: memberSkillsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const updateMemberSkillsSchema = z
  .object({
    skills: memberSkillsSchema,
  })
  .strict();
export type UpdateMemberSkillsInput = z.infer<typeof updateMemberSkillsSchema>;

export const createColumnSchema = z
  .object({
    name: z.string().trim().min(1).max(30),
    isDone: z.boolean().optional(),
  })
  .strict();
export type CreateColumnInput = z.infer<typeof createColumnSchema>;

export const updateColumnSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    isDone: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;

export const moveColumnSchema = z
  .object({
    beforeColumnId: idSchema.nullable().optional(),
  })
  .strict();
export type MoveColumnInput = z.infer<typeof moveColumnSchema>;

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: richTextSchema.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: idSchema.nullable().optional(),
    dueDate: dateTimeSchema.nullable().optional(),
    labels: labelsSchema.optional(),
    columnId: idSchema.optional(),
  })
  .strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: richTextSchema.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: idSchema.nullable().optional(),
    dueDate: dateTimeSchema.nullable().optional(),
    labels: labelsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const moveTaskSchema = z
  .object({
    columnId: idSchema,
    beforeTaskId: idSchema.nullable().optional(),
    force: z.boolean().optional(),
  })
  .strict();
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const createTaskDependencySchema = z
  .object({
    blockedByTaskId: idSchema,
  })
  .strict();
export type CreateTaskDependencyInput = z.infer<typeof createTaskDependencySchema>;

export const createCommentSchema = z
  .object({
    body: richTextSchema,
    parentId: idSchema.nullable().optional(),
  })
  .strict();
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z
  .object({
    body: richTextSchema,
  })
  .strict();
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const createSubtaskSchema = z
  .object({
    title: z.string().trim().min(1).max(SUBTASK_TITLE_MAX_LENGTH),
  })
  .strict();
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

export const updateSubtaskSchema = z
  .object({
    title: z.string().trim().min(1).max(SUBTASK_TITLE_MAX_LENGTH).optional(),
    isDone: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;

export const reactionSchema = z
  .object({
    emoji: z.enum(REACTION_EMOJIS),
  })
  .strict();
export type ReactionInput = z.infer<typeof reactionSchema>;

export const notificationPreferencesSchema = z
  .object({
    preferences: z
      .record(z.string(), z.boolean())
      .refine(
        (value) => Object.keys(value).every((key) => NOTIFICATION_TYPES.includes(key as never)),
        '包含未知通知类型',
      ),
  })
  .strict();
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(50),
    limit: z.coerce.number().int().min(1).max(10).optional(),
  })
  .strict();
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const generateReportSchema = z
  .object({
    weekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD')
      .optional(),
  })
  .strict();
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

const reportRecipientsSchema = z
  .array(emailSchema)
  .min(1, '至少选择一个收件人')
  .max(20, '最多 20 个收件人')
  .refine((items) => new Set(items).size === items.length, '收件人不能重复');

export const previewReportEmailSchema = z
  .object({
    recipients: reportRecipientsSchema,
    tone: z.enum(['concise', 'detailed']).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type PreviewReportEmailInput = z.infer<typeof previewReportEmailSchema>;

export const sendReportEmailSchema = z
  .object({
    recipients: reportRecipientsSchema,
    subject: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\r\n]+$/, '邮件主题不能包含换行'),
    body: z.string().trim().min(1).max(12_000),
    confirm: z.literal(true),
  })
  .strict();
export type SendReportEmailInput = z.infer<typeof sendReportEmailSchema>;

export const projectsQuerySchema = z
  .object({
    archived: booleanQuery,
  })
  .strict();
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>;

export const myTasksQuerySchema = z
  .object({
    status: z.enum(['open', 'overdue', 'done']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>;

export const cursorQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const commentsQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export type CommentsQuery = z.infer<typeof commentsQuerySchema>;

export const notificationsQuerySchema = z
  .object({
    unreadOnly: booleanQuery,
    type: z.enum(NOTIFICATION_TYPES).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const reportsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict();
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

const reportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD');
const reportPeriodSchema = z.enum(['daily', 'weekly']);
const reportScopeSchema = z.enum(['team', 'member']);

export const periodReportQuerySchema = z
  .object({
    period: reportPeriodSchema.optional(),
    date: reportDateSchema.optional(),
    scope: reportScopeSchema.optional(),
    userId: idSchema.optional(),
  })
  .strict();
export type PeriodReportQuery = z.infer<typeof periodReportQuerySchema>;

export const periodReportNarrativeSchema = z
  .object({
    period: reportPeriodSchema.optional(),
    date: reportDateSchema.optional(),
    scope: reportScopeSchema.optional(),
    userId: idSchema.optional(),
    tone: z.enum(['concise', 'detailed']).optional(),
  })
  .strict();
export type PeriodReportNarrativeInput = z.infer<typeof periodReportNarrativeSchema>;

export const assignSuggestionsSchema = z
  .object({
    limit: z.number().int().min(1).max(5).optional(),
    useAi: z.boolean().optional(),
  })
  .strict();
export type AssignSuggestionsInput = z.infer<typeof assignSuggestionsSchema>;

export const aiPlanSchema = z
  .object({
    useAi: z.boolean().optional(),
  })
  .strict();
export type AiPlanInput = z.infer<typeof aiPlanSchema>;

export const deleteColumnQuerySchema = z
  .object({
    moveTasksTo: idSchema.optional(),
  })
  .strict();
export type DeleteColumnQuery = z.infer<typeof deleteColumnQuerySchema>;

export const roleSchema = z.enum(PROJECT_ROLES);
export type Role = z.infer<typeof roleSchema>;

export type { PermissionOverrides };
export { isPermissionKey };
