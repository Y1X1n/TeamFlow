'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Tag, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import {
  MEMBER_SKILL_MAX_LENGTH,
  MEMBER_SKILL_PRESETS,
  MEMBER_SKILLS_MAX,
} from '@teamflow/shared/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import type { Member } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  isPresetSkill,
  normalizeSkills,
  skillsChanged,
  toggleSkill,
  validateNewSkill,
} from './member-skills';

interface MemberSkillsDialogProps {
  projectId: string;
  member: Member;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function skillsErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有编辑该成员职能标签的权限。';
      case 'OWNER_IMMUTABLE':
        return '项目负责人不可被修改。';
      case 'ADMIN_CANNOT_MANAGE_ADMIN':
        return '管理员不能管理其他管理员。';
      case 'PROJECT_ARCHIVED':
        return '项目已归档，无法修改职能标签。';
      case 'NOT_FOUND':
        return '成员不存在或已离开项目。';
      case 'VALIDATION_ERROR':
        return error.message;
      default:
        return error.message;
    }
  }
  return '保存职能标签失败，请稍后重试。';
}

export function MemberSkillsDialog({
  projectId,
  member,
  canManage,
  open,
  onOpenChange,
}: MemberSkillsDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSelf = member.userId === user?.id;
  const editable = isSelf || canManage;

  const initialSkills = normalizeSkills(member.skills);
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation<Member, Error, string[]>({
    mutationFn: (nextSkills) => {
      const body = { skills: nextSkills };
      if (isSelf) {
        return api<Member>(`/projects/${projectId}/members/me/skills`, {
          method: 'PATCH',
          body,
        });
      }
      return api<Member>(`/projects/${projectId}/members/${member.userId}`, {
        method: 'PATCH',
        body,
      });
    },
    onSuccess: (updated) => {
      toast.success(`已更新 ${updated.name} 的职能标签`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      onOpenChange(false);
    },
    onError: (saveError) => toast.error(skillsErrorText(saveError)),
  });

  const dirty = skillsChanged(skills, initialSkills);
  const atLimit = skills.length >= MEMBER_SKILLS_MAX;
  const overLimit = skills.length > MEMBER_SKILLS_MAX;
  const disabled = !editable || saveMutation.isPending;
  const customSkills = skills.filter((skill) => !isPresetSkill(skill));

  function selectSkill(skill: string) {
    const result = toggleSkill(skills, skill);
    setSkills(result.skills);
    setError(result.error);
  }

  function removeSkill(skill: string) {
    setSkills((current) => current.filter((item) => item !== skill));
    setError(null);
  }

  function addCustomSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateNewSkill(draft, skills);
    setError(result.error);
    const skill = result.skill;
    if (!skill) return;
    setSkills((current) => [...current, skill]);
    setDraft('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saveMutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" aria-hidden="true" />
            职能标签 · {member.name}
          </DialogTitle>
          <DialogDescription>
            职能标签用于智能分工推荐，最多 {MEMBER_SKILLS_MAX} 个，每个不超过{' '}
            {MEMBER_SKILL_MAX_LENGTH} 个字符。
            {isSelf ? '你可以随时调整自己的职能标签。' : null}
          </DialogDescription>
        </DialogHeader>

        {!editable ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            你没有编辑该成员职能标签的权限。
          </div>
        ) : null}

        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">常用职能</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="切换职能标签">
              {MEMBER_SKILL_PRESETS.map((preset) => {
                const selected = skills.some(
                  (skill) => skill.toLowerCase() === preset.toLowerCase(),
                );
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    className="h-6 rounded-full px-2.5 text-xs"
                    aria-pressed={selected}
                    disabled={disabled || (!selected && atLimit)}
                    title={
                      !selected && atLimit ? `最多 ${MEMBER_SKILLS_MAX} 个职能标签` : undefined
                    }
                    onClick={() => selectSkill(preset)}
                  >
                    {preset}
                  </Button>
                );
              })}
              {customSkills.map((skill) => (
                <Button
                  key={skill}
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-6 rounded-full px-2.5 text-xs"
                  aria-pressed
                  disabled={disabled}
                  onClick={() => selectSkill(skill)}
                >
                  {skill}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">已选职能</span>
              <Badge variant={atLimit ? 'warning' : 'muted'} className="tabular-nums">
                {skills.length}/{MEMBER_SKILLS_MAX}
              </Badge>
            </div>
            {skills.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                尚未设置职能标签，成员将不会在智能推荐中获得职能匹配加分。
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="已选职能标签">
                {skills.map((skill) => (
                  <li key={skill}>
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
                      {skill}
                      <button
                        type="button"
                        aria-label={`移除职能标签 ${skill}`}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        disabled={disabled}
                        onClick={() => removeSkill(skill)}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="space-y-1.5" onSubmit={addCustomSkill}>
            <Label
              htmlFor="member-skill-input"
              className="text-xs font-medium text-muted-foreground"
            >
              自定义职能
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="member-skill-input"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (error) setError(null);
                }}
                placeholder={atLimit ? `已达 ${MEMBER_SKILLS_MAX} 个上限` : '例如：数据分析'}
                maxLength={MEMBER_SKILL_MAX_LENGTH}
                disabled={disabled || atLimit}
                aria-invalid={error !== null}
                aria-describedby={error ? 'member-skill-error' : undefined}
              />
              <Button
                type="submit"
                size="sm"
                disabled={disabled || atLimit || draft.trim().length === 0}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                添加
              </Button>
            </div>
            <p
              id="member-skill-error"
              role={error ? 'alert' : undefined}
              aria-live="polite"
              className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
            >
              {error ?? '支持中英文与空格，按回车或点击「添加」加入。'}
            </p>
          </form>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {dirty ? '有未保存的修改' : '职能标签未修改'}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saveMutation.isPending}>
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={disabled || !dirty || saveMutation.isPending || overLimit}
              onClick={() => saveMutation.mutate(skills)}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              保存职能标签
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
