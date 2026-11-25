'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PROJECT_TEMPLATES } from '@teamflow/shared/enums';
import type { ProjectTemplate } from '@teamflow/shared/enums';
import { createProjectSchema } from '@teamflow/shared/schemas';
import type { CreateProjectInput } from '@teamflow/shared/schemas';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

const PROJECT_COLORS = [
  { value: '#6366F1', label: '靛蓝' },
  { value: '#0EA5E9', label: '天蓝' },
  { value: '#10B981', label: '翡翠绿' },
  { value: '#F59E0B', label: '琥珀' },
  { value: '#EF4444', label: '珊瑚红' },
  { value: '#8B5CF6', label: '紫罗兰' },
  { value: '#14B8A6', label: '青碧' },
  { value: '#EC4899', label: '玫红' },
] as const;

const DEFAULT_COLOR = PROJECT_COLORS[0].value;

function emptyValues(): CreateProjectInput {
  return { name: '', description: '', color: DEFAULT_COLOR, template: 'BLANK' };
}

function nameMessage(message?: string): string | undefined {
  return message ? '请输入项目名称（1–60 个字符）。' : undefined;
}

function descriptionMessage(message?: string): string | undefined {
  return message ? '项目描述不能超过 500 个字符。' : undefined;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    mode: 'onTouched',
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (open) form.reset(emptyValues());
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (values: CreateProjectInput) => {
      const body: {
        name: string;
        description?: string;
        color?: string;
        template?: ProjectTemplate;
      } = {
        name: values.name.trim(),
      };
      const description = values.description?.trim();
      if (description) body.description = description;
      if (values.color) body.color = values.color;
      body.template = values.template ?? 'BLANK';
      return api<Project>('/projects', { method: 'POST', body });
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects(false) });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast.success(`项目「${project.name}」创建成功`);
      form.reset(emptyValues());
      onOpenChange(false);
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '创建项目失败，请稍后重试。');
    },
  });

  const selectedColor = form.watch('color') ?? DEFAULT_COLOR;
  const selectedTemplate = form.watch('template') ?? 'BLANK';
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-3rem)] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>
            选择模板可自动生成看板列与示例任务，创建后仍可自由调整。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="project-name">项目名称</Label>
            <Input
              id="project-name"
              placeholder="例如：毕业设计 · 移动端"
              maxLength={60}
              autoFocus
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'project-name-error' : undefined}
              {...form.register('name')}
            />
            {errors.name ? (
              <p id="project-name-error" className="text-xs text-destructive" role="alert">
                {nameMessage(errors.name.message)}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">项目描述</Label>
            <Textarea
              id="project-description"
              placeholder="这个项目要解决什么问题？（可选）"
              maxLength={500}
              rows={3}
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'project-description-error' : undefined}
              {...form.register('description')}
            />
            {errors.description ? (
              <p id="project-description-error" className="text-xs text-destructive" role="alert">
                {descriptionMessage(errors.description.message)}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>项目模板</Label>
            <div role="radiogroup" aria-label="项目模板" className="grid gap-2 sm:grid-cols-2">
              {PROJECT_TEMPLATES.map((template) => (
                <label key={template.id} className="cursor-pointer">
                  <input
                    type="radio"
                    value={template.id}
                    className="peer sr-only"
                    disabled={mutation.isPending}
                    {...form.register('template')}
                  />
                  <span
                    className={cn(
                      'flex h-full flex-col rounded-lg border p-3 transition-colors hover:bg-muted/40 peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {template.label}
                      {selectedTemplate === template.id ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      {template.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              模板会预置看板列与示例任务，例如「课程项目」包含开题、实现、答辩等步骤。
            </p>
          </div>

          <div className="space-y-2">
            <Label>项目颜色</Label>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="项目颜色">
              {PROJECT_COLORS.map((color) => (
                <label key={color.value} className="cursor-pointer">
                  <input
                    type="radio"
                    value={color.value}
                    className="peer sr-only"
                    disabled={mutation.isPending}
                    {...form.register('color')}
                  />
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition peer-checked:ring-2 peer-checked:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    style={{ backgroundColor: color.value }}
                  >
                    <span className="sr-only">{color.label}</span>
                    {selectedColor === color.value ? (
                      <Check className="h-4 w-4 text-white" aria-hidden="true" />
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {mutation.isPending ? '创建中…' : '创建项目'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
