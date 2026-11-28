'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import {
  CornerDownRight,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { REACTION_EMOJIS } from '@teamflow/shared/enums';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CommentReaction, MemberSummary, Paginated, TaskComment } from '@/lib/types';
import { avatarColor, cn, formatDateTime } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { adjustTaskCount, getErrorMessage } from './task-utils';
import { groupCommentThreads } from './task-types';

interface TaskCommentsProps {
  taskId: string;
  projectId: string;
  currentUserId: string;
  members: MemberSummary[];
  canComment: boolean;
  canModerate: boolean;
  archived: boolean;
}

const initialCursor: string | null = null;

interface ReactionBarProps {
  comment: TaskComment;
  canReact: boolean;
  pending: boolean;
  onToggle: (emoji: string, reacted: boolean) => void;
}

function ReactionBar({ comment, canReact, pending, onToggle }: ReactionBarProps) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {comment.reactions.map((reaction: CommentReaction) => (
        <button
          key={reaction.emoji}
          type="button"
          aria-pressed={reaction.reactedByMe}
          disabled={!canReact || pending}
          title={reaction.userNames.join('、')}
          onClick={() => onToggle(reaction.emoji, reaction.reactedByMe)}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-[11px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            reaction.reactedByMe
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'bg-background hover:bg-muted',
          )}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
          <span className="sr-only">
            {reaction.reactedByMe ? '已回应，点击取消' : '点击添加回应'}
          </span>
        </button>
      ))}

      {canReact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-muted-foreground"
              aria-label="添加表情回应"
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="text-sm leading-none">
                  +
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex min-w-0 items-center gap-0.5 p-1">
            {REACTION_EMOJIS.map((emoji) => {
              const reacted = comment.reactions.some(
                (reaction) => reaction.emoji === emoji && reaction.reactedByMe,
              );
              return (
                <DropdownMenuItem
                  key={emoji}
                  className="h-7 w-7 cursor-pointer justify-center p-0 text-base"
                  onSelect={() => onToggle(emoji, reacted)}
                  aria-label={`回应 ${emoji}${reacted ? '（取消）' : ''}`}
                >
                  <span aria-hidden="true">{emoji}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

interface CommentItemProps {
  comment: TaskComment;
  currentUserId: string;
  members: MemberSummary[];
  canModerate: boolean;
  canReply: boolean;
  canReact: boolean;
  archived: boolean;
  isReply: boolean;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  reactionPending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onRequestDelete: (comment: TaskComment) => void;
  onReply: () => void;
  onToggleReaction: (emoji: string, reacted: boolean) => void;
}

function CommentItem({
  comment,
  currentUserId,
  members,
  canModerate,
  canReply,
  canReact,
  archived,
  isReply,
  editing,
  saving,
  deleting,
  reactionPending,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRequestDelete,
  onReply,
  onToggleReaction,
}: CommentItemProps) {
  const [editJson, setEditJson] = useState<Record<string, unknown> | null>(null);
  const isAuthor = comment.author.userId === currentUserId;
  const canEdit = !archived && isAuthor && !comment.deleted;
  const canDelete = !archived && !comment.deleted && (isAuthor || canModerate);
  const hasActions = canEdit || canDelete;
  const replyToName = comment.replyTo?.name ?? null;
  const showReactions = !comment.deleted && comment.reactions.length > 0;

  return (
    <div className={cn('flex gap-2.5', isReply && 'gap-2')}>
      <UserAvatar
        name={comment.author.name}
        src={comment.author.avatarUrl}
        color={avatarColor(comment.author.userId)}
        className={cn('mt-0.5', isReply ? 'h-6 w-6 text-[10px]' : 'h-7 w-7')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{comment.author.name}</span>
          {replyToName && !comment.deleted ? (
            <span className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground">
              <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              回复 @{replyToName}
            </span>
          ) : null}
          <time className="text-[11px] text-muted-foreground" dateTime={comment.createdAt}>
            {formatDateTime(comment.createdAt)}
          </time>
          {comment.edited && !comment.deleted ? (
            <span className="text-[11px] text-muted-foreground">（已编辑）</span>
          ) : null}
          {!isReply && comment.replyCount > 0 && !comment.deleted ? (
            <span className="text-[11px] text-muted-foreground">{comment.replyCount} 条回复</span>
          ) : null}
          {comment.deleted ? <Badge variant="muted">已删除</Badge> : null}
          {hasActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="评论操作"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem onClick={onStartEdit}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    编辑
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onRequestDelete(comment)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    删除
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {editing && !comment.deleted ? (
          <div className="mt-1.5">
            <RichTextEditor
              key={`edit-${comment.id}`}
              value={comment.body}
              onChange={(json) => setEditJson(json)}
              members={members}
              minHeight="70px"
              disabled={saving || archived}
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditJson(null);
                  onCancelEdit();
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || archived}
                onClick={async () => {
                  const body = editJson ?? comment.body;
                  if (!body) return;
                  try {
                    await onSave(body);
                    setEditJson(null);
                  } catch {
                    // 保留草稿，错误提示由 mutation 的 onError 负责。
                  }
                }}
              >
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        ) : comment.deleted || !comment.body ? (
          <p className="mt-1 text-sm italic text-muted-foreground">评论已删除</p>
        ) : (
          <div className={cn('mt-1 rounded-md bg-muted/40 px-3 py-2')}>
            <RichTextView doc={comment.body} />
          </div>
        )}

        {!comment.deleted && (showReactions || canReact || canReply) ? (
          <div className="flex flex-wrap items-center gap-1">
            <ReactionBar
              comment={comment}
              canReact={canReact}
              pending={reactionPending}
              onToggle={onToggleReaction}
            />
            {canReply ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                onClick={onReply}
              >
                <Reply className="h-3 w-3" aria-hidden="true" />
                回复
              </Button>
            ) : null}
          </div>
        ) : null}

        {deleting ? <p className="mt-1 text-[11px] text-muted-foreground">正在删除…</p> : null}
      </div>
    </div>
  );
}

interface CreateCommentVariables {
  body: Record<string, unknown>;
  parentId: string | null;
}

interface ReactionVariables {
  comment: TaskComment;
  emoji: string;
  reacted: boolean;
}

export function TaskComments({
  taskId,
  projectId,
  currentUserId,
  members,
  canComment,
  canModerate,
  archived,
}: TaskCommentsProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ json: Record<string, unknown> | null; text: string }>({
    json: null,
    text: '',
  });
  const [editorKey, setEditorKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskComment | null>(null);
  const [replyTarget, setReplyTarget] = useState<TaskComment | null>(null);

  const commentsQuery = useInfiniteQuery({
    queryKey: queryKeys.comments(taskId),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : '';
      return api<Paginated<TaskComment>>(`/tasks/${taskId}/comments?limit=50${cursor}`);
    },
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const threads = groupCommentThreads(comments);
  const canReply = !archived && canComment;
  const canReact = !archived;

  const createComment = useMutation<TaskComment, Error, CreateCommentVariables>({
    mutationFn: ({ body, parentId }) =>
      api<TaskComment>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: { body, parentId },
      }),
    onSuccess: (_created, variables) => {
      toast.success(variables.parentId ? '回复已发布' : '评论已发布');
      setDraft({ json: null, text: '' });
      setEditorKey((key) => key + 1);
      setReplyTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
      adjustTaskCount(queryClient, projectId, taskId, 'commentCount', 1);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const editComment = useMutation<
    TaskComment,
    Error,
    { commentId: string; body: Record<string, unknown> }
  >({
    mutationFn: ({ commentId, body }) =>
      api<TaskComment>(`/comments/${commentId}`, { method: 'PATCH', body: { body } }),
    onSuccess: () => {
      toast.success('评论已更新');
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteComment = useMutation<void, Error, TaskComment>({
    mutationFn: (comment) => api<void>(`/comments/${comment.id}`, { method: 'DELETE' }),
    onSuccess: (_data, comment) => {
      toast.success('评论已删除');
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivities(taskId) });
      if (!comment.deleted) adjustTaskCount(queryClient, projectId, taskId, 'commentCount', -1);
      if (replyTarget?.id === comment.id) setReplyTarget(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleReaction = useMutation<{ reactions: CommentReaction[] }, Error, ReactionVariables>({
    mutationFn: ({ comment, emoji, reacted }) =>
      reacted
        ? api<{ reactions: CommentReaction[] }>(
            `/comments/${comment.id}/reactions?emoji=${encodeURIComponent(emoji)}`,
            { method: 'DELETE' },
          )
        : api<{ reactions: CommentReaction[] }>(`/comments/${comment.id}/reactions`, {
            method: 'PUT',
            body: { emoji },
          }),
    onSuccess: ({ reactions }, { comment }) => {
      queryClient.setQueryData<InfiniteData<Paginated<TaskComment>>>(
        queryKeys.comments(taskId),
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.id === comment.id ? { ...item, reactions } : item,
                  ),
                })),
              }
            : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const replyTargetId = replyTarget?.id ?? null;

  return (
    <section aria-labelledby="comments-heading">
      <h3 id="comments-heading" className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        评论
        <span className="text-xs font-normal text-muted-foreground">
          {comments.length}
          {commentsQuery.hasNextPage ? '+' : ''}
        </span>
      </h3>

      {commentsQuery.isLoading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : commentsQuery.isError ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          评论加载失败。
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-1"
            onClick={() => void commentsQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : threads.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无评论，来发表第一条吧。</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {threads.map((thread) => (
            <li key={thread.root.id}>
              <CommentItem
                comment={thread.root}
                currentUserId={currentUserId}
                members={members}
                canModerate={canModerate}
                canReply={canReply}
                canReact={canReact}
                archived={archived}
                isReply={false}
                editing={editingId === thread.root.id}
                saving={editComment.isPending}
                deleting={deleteComment.isPending && deleteComment.variables?.id === thread.root.id}
                reactionPending={
                  toggleReaction.isPending &&
                  toggleReaction.variables?.comment.id === thread.root.id
                }
                onStartEdit={() => setEditingId(thread.root.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={async (body) => {
                  await editComment.mutateAsync({ commentId: thread.root.id, body });
                }}
                onRequestDelete={(target) => setDeleteTarget(target)}
                onReply={() => setReplyTarget(thread.root)}
                onToggleReaction={(emoji, reacted) =>
                  toggleReaction.mutate({ comment: thread.root, emoji, reacted })
                }
              />

              {thread.replies.length > 0 ? (
                <ul className="ml-9 mt-3 space-y-3 border-l pl-3">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        currentUserId={currentUserId}
                        members={members}
                        canModerate={canModerate}
                        canReply={canReply}
                        canReact={canReact}
                        archived={archived}
                        isReply
                        editing={editingId === reply.id}
                        saving={editComment.isPending}
                        deleting={
                          deleteComment.isPending && deleteComment.variables?.id === reply.id
                        }
                        reactionPending={
                          toggleReaction.isPending &&
                          toggleReaction.variables?.comment.id === reply.id
                        }
                        onStartEdit={() => setEditingId(reply.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSave={async (body) => {
                          await editComment.mutateAsync({ commentId: reply.id, body });
                        }}
                        onRequestDelete={(target) => setDeleteTarget(target)}
                        onReply={() => setReplyTarget(thread.root)}
                        onToggleReaction={(emoji, reacted) =>
                          toggleReaction.mutate({ comment: reply, emoji, reacted })
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {commentsQuery.hasNextPage ? (
        <div className="mt-3 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={commentsQuery.isFetchingNextPage}
            onClick={() => void commentsQuery.fetchNextPage()}
          >
            {commentsQuery.isFetchingNextPage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            加载更多评论
          </Button>
        </div>
      ) : null}

      {!archived && canComment ? (
        <div className="mt-4 rounded-lg border p-3">
          {replyTargetId ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                回复
                <span className="truncate font-medium text-foreground">
                  @{replyTarget?.author.name ?? '成员'}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="取消回复"
                onClick={() => setReplyTarget(null)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          <RichTextEditor
            key={`new-comment-${editorKey}`}
            members={members}
            onChange={(json, text) => setDraft({ json, text })}
            minHeight="80px"
            disabled={createComment.isPending}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">支持 @ 成员、加粗与列表</span>
            <Button
              type="button"
              size="sm"
              disabled={!draft.text.trim() || !draft.json || createComment.isPending}
              onClick={() => {
                if (!draft.json) return;
                createComment.mutate({ body: draft.json, parentId: replyTargetId });
              }}
            >
              {createComment.isPending
                ? replyTargetId
                  ? '回复中…'
                  : '发布中…'
                : replyTargetId
                  ? '发布回复'
                  : '发表评论'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {archived ? '项目已归档，无法发表评论。' : '您没有发表评论的权限。'}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除评论"
        description={
          deleteTarget
            ? `删除「${(deleteTarget.bodyText ?? '这条评论').slice(0, 40)}」后，评论将显示为已删除，且无法恢复。`
            : ''
        }
        confirmLabel="删除评论"
        destructive
        loading={deleteComment.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteComment.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
