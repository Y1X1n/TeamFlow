'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { downloadTextFile } from '@/lib/download';
import { queryKeys } from '@/lib/query-keys';
import type { BoardColumn, MemberSummary, TaskDetail } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import { getErrorMessage } from '@/features/tasks/task-utils';
import { boardImportTemplateCsv, buildBoardImportPlan } from './board-import';
import type { BoardImportRow } from './board-import';

interface BoardImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columns: BoardColumn[];
  members: MemberSummary[];
  defaultColumnId: string | null;
  onImported: () => void;
}

interface ImportResult {
  success: number;
  failed: number;
}

export function BoardImportDialog({
  open,
  onOpenChange,
  projectId,
  columns,
  members,
  defaultColumnId,
  onImported,
}: BoardImportDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');

  const plan = useMemo(
    () =>
      csvText.trim()
        ? buildBoardImportPlan(csvText, columns, members, defaultColumnId)
        : null,
    [csvText, columns, members, defaultColumnId],
  );

  const importRows = useMutation<ImportResult, Error, BoardImportRow[]>({
    mutationFn: async (rows) => {
      let success = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await api<TaskDetail>(`/projects/${projectId}/tasks`, {
            method: 'POST',
            body: {
              title: row.title,
              columnId: row.columnId,
              assigneeId: row.assigneeId,
              priority: row.priority,
              dueDate: row.dueDate,
              estimateMinutes: row.estimateMinutes,
              labels: row.labels,
            },
          });
          success += 1;
        } catch {
          failed += 1;
        }
      }
      return { success, failed };
    },
    onSuccess: (result) => {
      if (result.success > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
        onImported();
      }
      if (result.failed === 0) {
        toast.success(`已导入 ${result.success} 个任务`);
        onOpenChange(false);
      } else if (result.success === 0) {
        toast.error(`导入失败：${result.failed} 行未创建`);
      } else {
        toast.warning(`已导入 ${result.success} 个任务，${result.failed} 行失败`);
        onOpenChange(false);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reset = () => {
    setFileName('');
    setCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    try {
      setCsvText(await file.text());
    } catch {
      toast.error('读取文件失败');
    }
  };

  const validCount = plan?.validRows.length ?? 0;
  const invalidCount = (plan?.rows.length ?? 0) - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" aria-hidden="true" />
            导入任务
          </DialogTitle>
          <DialogDescription>
            上传 CSV 后先预览校验，确认无误再创建任务。支持导出格式直接回导。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="选择 CSV 文件"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            选择 CSV 文件
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadTextFile('task-import-template.csv', boardImportTemplateCsv(), 'text/csv;charset=utf-8')
            }
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载模板
          </Button>
          {fileName ? (
            <span className="truncate text-xs text-muted-foreground">{fileName}</span>
          ) : null}
        </div>

        {plan?.globalErrors.length ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {plan.globalErrors.join('；')}
          </div>
        ) : null}

        {plan && plan.rows.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="muted">共 {plan.rows.length} 行</Badge>
              <Badge variant="success">可导入 {validCount}</Badge>
              {invalidCount > 0 ? <Badge variant="warning">需修正 {invalidCount}</Badge> : null}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="w-12 px-2 py-2 text-left font-medium">
                      行
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      标题
                    </th>
                    <th scope="col" className="w-24 px-2 py-2 text-left font-medium">
                      看板列
                    </th>
                    <th scope="col" className="w-24 px-2 py-2 text-left font-medium">
                      负责人
                    </th>
                    <th scope="col" className="w-20 px-2 py-2 text-left font-medium">
                      优先级
                    </th>
                    <th scope="col" className="w-32 px-2 py-2 text-left font-medium">
                      截止
                    </th>
                    <th scope="col" className="w-20 px-2 py-2 text-left font-medium">
                      工时
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      校验
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 50).map((row) => (
                    <tr
                      key={row.line}
                      className={row.errors.length > 0 ? 'border-b bg-destructive/5' : 'border-b'}
                    >
                      <td className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                        {row.line}
                      </td>
                      <td className="max-w-[240px] truncate px-2 py-1.5">{row.title || '—'}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.columnName || '—'}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.assigneeName || '未指派'}
                      </td>
                      <td className="px-2 py-1.5">{TASK_PRIORITY_LABELS[row.priority]}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                        {row.dueDate ? formatDateTime(row.dueDate) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                        {row.estimateMinutes ? `${row.estimateMinutes / 60}h` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {row.errors.length > 0 ? (
                          <span className="text-destructive">{row.errors.join('；')}</span>
                        ) : (
                          <span className="text-emerald-600">可导入</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.rows.length > 50 ? (
              <p className="text-xs text-muted-foreground">仅预览前 50 行，导入时会处理全部有效行。</p>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => plan && importRows.mutate(plan.validRows)}
            disabled={validCount === 0 || importRows.isPending}
          >
            {importRows.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            导入 {validCount} 行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
