'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react';
import { toast } from 'sonner';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_TASK } from '@teamflow/shared/enums';
import { api, refreshAccessToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { queryKeys } from '@/lib/query-keys';
import { getAccessToken } from '@/lib/token';
import type { Attachment } from '@/lib/types';
import { cn, fileSize, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { adjustTaskCount, getErrorMessage } from './task-utils';

interface TaskAttachmentsProps {
  taskId: string;
  projectId: string;
  currentUserId: string;
  canUpload: boolean;
  canDeleteOthers: boolean;
  archived: boolean;
}

type PreviewKind = 'image' | 'pdf';

interface PreviewState {
  attachment: Attachment;
  kind: PreviewKind;
  status: 'loading' | 'ready' | 'error';
  url: string | null;
  error: string | null;
}

function previewKindFor(mimeType: string): PreviewKind | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('application/pdf')) return 'pdf';
  return null;
}

async function fetchAttachmentBlob(attachment: Attachment): Promise<Blob> {
  const request = (token: string | null) =>
    fetch(`${API_BASE}/attachments/${attachment.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: 'follow',
    });
  let response = await request(getAccessToken());
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await request(refreshed);
  }
  if (!response.ok) throw new Error('附件下载失败');
  return response.blob();
}

export function TaskAttachments({
  taskId,
  projectId,
  currentUserId,
  canUpload,
  canDeleteOthers,
  archived,
}: TaskAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const attachmentsQuery = useQuery<{ items: Attachment[] }, Error>({
    queryKey: queryKeys.attachments(taskId),
    queryFn: () => api<{ items: Attachment[] }>(`/tasks/${taskId}/attachments`),
  });
  const items = attachmentsQuery.data?.items ?? [];

  const uploadFiles = async (files: File[]) => {
    if (!canUpload || archived || uploading) return;
    const remaining = ATTACHMENT_MAX_PER_TASK - items.length;
    if (remaining <= 0) {
      toast.error(`每个任务最多 ${ATTACHMENT_MAX_PER_TASK} 个附件`);
      return;
    }
    const accepted: File[] = [];
    for (const file of files) {
      if (accepted.length >= remaining) {
        toast.error(`每个任务最多 ${ATTACHMENT_MAX_PER_TASK} 个附件，部分文件未上传`);
        break;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast.error(`「${file.name}」超过 10MB，已跳过`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    let succeeded = 0;
    let failure: unknown = null;
    for (const file of accepted) {
      try {
        const form = new FormData();
        form.append('file', file);
        await api<Attachment>(`/tasks/${taskId}/attachments`, { method: 'POST', form });
        succeeded += 1;
      } catch (error) {
        failure = error;
        break;
      }
    }
    if (succeeded > 0) {
      toast.success(succeeded === 1 ? '附件已上传' : `已上传 ${succeeded} 个附件`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(taskId) });
      adjustTaskCount(queryClient, projectId, taskId, 'attachmentCount', succeeded);
    }
    if (failure) toast.error(getErrorMessage(failure));
    setUploading(false);
  };

  const deleteAttachment = useMutation<void, Error, Attachment>({
    mutationFn: (attachment) => api<void>(`/attachments/${attachment.id}`, { method: 'DELETE' }),
    onSuccess: (_data, attachment) => {
      toast.success(`附件「${attachment.fileName}」已删除`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(taskId) });
      adjustTaskCount(queryClient, projectId, taskId, 'attachmentCount', -1);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const releasePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const closePreview = () => {
    previewRequestRef.current += 1;
    releasePreviewUrl();
    setPreview(null);
  };

  const openPreview = async (attachment: Attachment) => {
    const kind = previewKindFor(attachment.mimeType);
    if (!kind) return;
    previewRequestRef.current += 1;
    const requestId = previewRequestRef.current;
    releasePreviewUrl();
    setPreview({ attachment, kind, status: 'loading', url: null, error: null });
    try {
      const blob = await fetchAttachmentBlob(attachment);
      if (requestId !== previewRequestRef.current) return;
      const typedBlob = new Blob([blob], { type: blob.type || attachment.mimeType });
      const url = URL.createObjectURL(typedBlob);
      previewUrlRef.current = url;
      setPreview((previous) =>
        previous &&
        previous.attachment.id === attachment.id &&
        requestId === previewRequestRef.current
          ? { ...previous, status: 'ready', url }
          : previous,
      );
    } catch (error) {
      if (requestId !== previewRequestRef.current) return;
      setPreview((previous) =>
        previous && previous.attachment.id === attachment.id
          ? { ...previous, status: 'error', error: getErrorMessage(error) }
          : previous,
      );
    }
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;
    void uploadFiles(files);
  };

  const hasFilePayload = (event: DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).includes('Files');

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!canUpload || archived || !hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canUpload || archived || !hasFilePayload(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!canUpload || archived) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canUpload || archived) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void uploadFiles(files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!canUpload || archived || uploading) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  };

  const downloadAttachment = async (attachment: Attachment) => {
    setDownloadingId(attachment.id);
    try {
      const blob = await fetchAttachmentBlob(attachment);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section aria-labelledby="attachments-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="attachments-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          附件
          <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        </h3>
        {canUpload ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              aria-label="选择附件文件"
              multiple
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.docx,.xlsx,.pptx"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {uploading ? '上传中…' : '上传附件'}
            </Button>
          </>
        ) : null}
      </div>
      {canUpload ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          可多选文件，或拖拽、粘贴截图到下方区域；单个文件不超过 10MB。
        </p>
      ) : null}

      <div
        role="group"
        aria-label="附件上传区域"
        tabIndex={canUpload && !archived ? 0 : undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={cn(
          'relative rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragActive && 'bg-primary/5 ring-2 ring-primary',
        )}
      >
        {dragActive ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary">
            松开即可上传附件
          </div>
        ) : null}
        {attachmentsQuery.isLoading ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : attachmentsQuery.isError ? (
          <div className="mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            附件加载失败。
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-1"
              onClick={() => void attachmentsQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">暂无附件</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {items.map((attachment) => {
              const canDelete =
                !archived && (attachment.uploadedBy.userId === currentUserId || canDeleteOthers);
              const downloading = downloadingId === attachment.id;
              const previewKind = previewKindFor(attachment.mimeType);
              return (
                <li
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    {previewKind ? (
                      <button
                        type="button"
                        onClick={() => void openPreview(attachment)}
                        className="block max-w-full truncate rounded-sm text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`预览附件 ${attachment.fileName}`}
                      >
                        {attachment.fileName}
                      </button>
                    ) : (
                      <p className="truncate text-sm">{attachment.fileName}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {fileSize(attachment.sizeBytes)} · {attachment.uploadedBy.name} ·{' '}
                      {formatDateTime(attachment.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {previewKind ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`预览附件 ${attachment.fileName}`}
                        onClick={() => void openPreview(attachment)}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`下载附件 ${attachment.fileName}`}
                      disabled={downloading}
                      onClick={() => void downloadAttachment(attachment)}
                    >
                      {downloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={cn('text-destructive hover:text-destructive')}
                        aria-label={`删除附件 ${attachment.fileName}`}
                        disabled={deleteAttachment.isPending}
                        onClick={() => setDeleteTarget(attachment)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-w-4xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8 text-base">
                  {preview.attachment.fileName}
                </DialogTitle>
                <DialogDescription>
                  {preview.kind === 'image' ? '图片预览' : 'PDF 预览'} ·{' '}
                  {fileSize(preview.attachment.sizeBytes)} · {preview.attachment.uploadedBy.name}
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden rounded-lg border bg-muted/30">
                {preview.status === 'loading' ? (
                  <div
                    className="flex h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"
                    aria-busy="true"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    正在加载附件预览…
                  </div>
                ) : preview.status === 'error' ? (
                  <div
                    role="alert"
                    className="flex h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center text-sm"
                  >
                    <p className="text-destructive">{preview.error ?? '附件预览失败'}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openPreview(preview.attachment)}
                    >
                      重试
                    </Button>
                  </div>
                ) : preview.url ? (
                  preview.kind === 'image' ? (
                    <div className="relative h-[55vh] w-full">
                      <Image
                        src={preview.url}
                        alt={`附件预览：${preview.attachment.fileName}`}
                        fill
                        unoptimized
                        sizes="(max-width: 1024px) 100vw, 900px"
                        className="object-contain"
                        onError={() =>
                          setPreview((previous) =>
                            previous
                              ? { ...previous, status: 'error', error: '图片无法显示，请尝试下载' }
                              : previous,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <iframe
                      src={preview.url}
                      title={`附件预览：${preview.attachment.fileName}`}
                      className="h-[65vh] w-full"
                    />
                  )
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closePreview}>
                  关闭
                </Button>
                <Button
                  type="button"
                  onClick={() => void downloadAttachment(preview.attachment)}
                  disabled={downloadingId === preview.attachment.id}
                >
                  {downloadingId === preview.attachment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  {downloadingId === preview.attachment.id ? '下载中…' : '下载'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除附件"
        description={
          deleteTarget
            ? `确定删除附件「${deleteTarget.fileName}」？删除后文件将从任务中移除，且无法恢复。`
            : ''
        }
        confirmLabel="删除附件"
        destructive
        loading={deleteAttachment.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteAttachment.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
