'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PROJECT_ROLE_LABELS } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  Member,
  ReportEmailPreview,
  ReportEmailSendResult,
  ReportEmailStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/features/tasks/task-utils';

const MAX_RECIPIENTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ReportEmailDialog({
  open,
  onOpenChange,
  projectId,
  canGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  canGenerate: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [note, setNote] = useState('');
  const [tone, setTone] = useState<'concise' | 'detailed'>('concise');
  const [preview, setPreview] = useState<ReportEmailPreview | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const membersQuery = useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => api<{ items: Member[] }>(`/projects/${projectId}/members`),
    enabled: open,
  });
  const statusQuery = useQuery({
    queryKey: queryKeys.reportEmailStatus(projectId),
    queryFn: () => api<ReportEmailStatus>(`/projects/${projectId}/reports/current/email/status`),
    enabled: open && canGenerate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data]);
  const memberEmails = useMemo(() => members.map((member) => member.email), [members]);

  useEffect(() => {
    if (open) return;
    setInitialized(false);
    setSelected([]);
    setCustomEmail('');
    setNote('');
    setTone('concise');
    setPreview(null);
    setSubject('');
    setBody('');
    setConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || initialized || !membersQuery.data) return;
    setSelected(Array.from(new Set(memberEmails)).slice(0, MAX_RECIPIENTS));
    setInitialized(true);
  }, [open, initialized, membersQuery.data, memberEmails]);

  const invalidatePreview = () => {
    setPreview(null);
    setSubject('');
    setBody('');
  };

  const toggleRecipient = (email: string, checked: boolean) => {
    invalidatePreview();
    setSelected((current) =>
      checked
        ? current.includes(email)
          ? current
          : [...current, email].slice(0, MAX_RECIPIENTS)
        : current.filter((item) => item !== email),
    );
  };

  const addCustomEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = customEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }
    if (selected.includes(email)) {
      toast.error('该邮箱已在收件人列表中');
      return;
    }
    if (selected.length >= MAX_RECIPIENTS) {
      toast.error(`最多 ${MAX_RECIPIENTS} 个收件人`);
      return;
    }
    invalidatePreview();
    setSelected((current) => [...current, email]);
    setCustomEmail('');
  };

  const previewMutation = useMutation<ReportEmailPreview, Error, void>({
    mutationFn: () =>
      api<ReportEmailPreview>(`/projects/${projectId}/reports/current/email/preview`, {
        method: 'POST',
        body: {
          recipients: selected,
          tone,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: (result) => {
      setPreview(result);
      setSubject(result.subject);
      setBody(result.body);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const sendMutation = useMutation<ReportEmailSendResult, Error, void>({
    mutationFn: () => {
      if (!preview) throw new Error('请先生成邮件预览');
      return api<ReportEmailSendResult>(`/projects/${projectId}/reports/current/email/send`, {
        method: 'POST',
        body: {
          recipients: preview.recipients,
          subject: subject.trim(),
          body: body.trim(),
          confirm: true,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`周报邮件已发送给 ${result.recipients.length} 位收件人`);
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const status = statusQuery.data;
  const canSend =
    Boolean(preview?.emailAvailable) && Boolean(subject.trim()) && Boolean(body.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            智能发送周报邮件
          </DialogTitle>
          <DialogDescription>
            根据当前周实时任务汇总生成邮件；发送前需在页面内预览并确认，不会自动群发。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1 scrollbar-thin">
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-xs',
              status?.available
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800',
            )}
          >
            {statusQuery.isPending ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : status?.available ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium">
                {status?.available
                  ? `Agent Mail 已连接：${status.sender}`
                  : statusQuery.isPending
                    ? '正在检查 Agent Mail 状态…'
                    : 'Agent Mail 当前不可用'}
              </p>
              {!status?.available && !statusQuery.isPending ? (
                <p className="mt-0.5">
                  {status?.reason ??
                    statusQuery.error?.message ??
                    '请完成 agently-cli 授权后再发送。'}
                </p>
              ) : null}
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  收件人
                  <Badge variant="muted">{selected.length}</Badge>
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  默认选择项目成员，可添加外部邮箱；最多 {MAX_RECIPIENTS} 个。
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    invalidatePreview();
                    setSelected(Array.from(new Set(memberEmails)).slice(0, MAX_RECIPIENTS));
                  }}
                >
                  全选成员
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    invalidatePreview();
                    setSelected([]);
                  }}
                  disabled={selected.length === 0}
                >
                  清空
                </Button>
              </div>
            </div>

            {membersQuery.isPending ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                正在加载成员…
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {members.map((member) => {
                  const checked = selected.includes(member.email);
                  return (
                    <label
                      key={member.userId}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        checked ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleRecipient(member.email, value === true)}
                        aria-label={`选择收件人 ${member.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{member.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      </span>
                      <Badge variant="muted">{PROJECT_ROLE_LABELS[member.role]}</Badge>
                    </label>
                  );
                })}
              </div>
            )}

            <form onSubmit={addCustomEmail} noValidate className="mt-2 flex items-center gap-2">
              <Label htmlFor="report-email-custom" className="sr-only">
                外部收件邮箱
              </Label>
              <Input
                id="report-email-custom"
                type="email"
                value={customEmail}
                onChange={(event) => setCustomEmail(event.target.value)}
                placeholder="添加外部邮箱，回车确认"
                className="h-8"
              />
              <Button type="submit" variant="outline" size="sm" disabled={!customEmail.trim()}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                添加
              </Button>
            </form>

            {selected.some((email) => !memberEmails.includes(email)) ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected
                  .filter((email) => !memberEmails.includes(email))
                  .map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    >
                      {email}
                      <button
                        type="button"
                        aria-label={`移除外部收件人 ${email}`}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                        onClick={() => toggleRecipient(email, false)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="report-email-note">补充说明（可选）</Label>
              <Textarea
                id="report-email-note"
                value={note}
                maxLength={500}
                rows={2}
                placeholder="例如：本周五 18:00 前完成评审"
                onChange={(event) => {
                  setNote(event.target.value);
                  invalidatePreview();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-email-tone">内容风格</Label>
              <Select
                value={tone}
                onValueChange={(value) => {
                  if (value !== 'concise' && value !== 'detailed') return;
                  setTone(value);
                  invalidatePreview();
                }}
              >
                <SelectTrigger id="report-email-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">简洁</SelectItem>
                  <SelectItem value="detailed">详细</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {preview ? (
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  邮件预览
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={preview.source === 'ai' ? 'default' : 'muted'}>
                    {preview.source === 'ai' ? `AI · ${preview.model ?? '模型'}` : '本地模板'}
                  </Badge>
                  <Badge variant="outline">
                    {preview.weekStart} ~ {preview.weekEnd}
                  </Badge>
                </div>
              </div>
              {preview.notice ? (
                <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {preview.notice}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="report-email-subject">主题</Label>
                <Input
                  id="report-email-subject"
                  value={subject}
                  maxLength={120}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-email-body">正文</Label>
                <Textarea
                  id="report-email-body"
                  value={body}
                  maxLength={12_000}
                  rows={14}
                  onChange={(event) => setBody(event.target.value)}
                  className="font-mono text-xs leading-5"
                />
                <p className="text-right text-[11px] text-muted-foreground">{body.length}/12000</p>
              </div>
            </section>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              选择收件人并点击「生成邮件预览」，AI 或本地模板会基于本周实时汇总生成内容。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendMutation.isPending}
          >
            取消
          </Button>
          {preview ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || selected.length === 0}
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                重新生成
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend || selected.length === 0}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                确认发送
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || selected.length === 0 || !canGenerate}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {previewMutation.isPending ? '生成中…' : '生成邮件预览'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!sendMutation.isPending) setConfirmOpen(next);
        }}
        title="发送周报邮件"
        description={
          preview
            ? `将通过 Agent Mail（${preview.sender ?? '已授权账号'}）把「${subject.trim() || '周报邮件'}」发送给 ${preview.recipients.length} 位收件人。发送后不可撤回。`
            : ''
        }
        confirmLabel="确认发送"
        loading={sendMutation.isPending}
        onConfirm={() => sendMutation.mutate()}
      />
    </Dialog>
  );
}
