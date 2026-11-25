'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectPageHeader } from '@/features/activities/project-page-header';
import { getErrorMessage } from '@/features/tasks/task-utils';
import { api } from '@/lib/api';
import { downloadTextFile, sanitizeFileName } from '@/lib/download';
import { queryKeys } from '@/lib/query-keys';
import type { BoardColumn, BoardData, TaskCard } from '@/lib/types';
import { NoDueTaskList, SelectedDayAgenda } from './calendar-agenda';
import { MonthGrid } from './calendar-grid';
import {
  buildProjectIcs,
  dateKeyFromParts,
  formatMonthLabel,
  monthAnchorFromDateKey,
  monthMatrix,
  parseDateKey,
  shanghaiDateKey,
  shiftMonth,
  sortTasksForCalendar,
  tasksByDate,
} from './calendar-utils';
import type { MonthAnchor } from './calendar-utils';

const EMPTY_TASKS: TaskCard[] = [];
const EMPTY_COLUMNS: BoardColumn[] = [];

function hasValidDueDate(task: TaskCard): boolean {
  if (!task.dueDate) return false;
  const dateKey = shanghaiDateKey(task.dueDate);
  return dateKey !== '' && parseDateKey(dateKey) !== null;
}

export function ProjectCalendarPage({ projectId }: { projectId: string }) {
  const [todayKey, setTodayKey] = useState(() => shanghaiDateKey(new Date()));
  const [monthAnchor, setMonthAnchor] = useState<MonthAnchor>(() =>
    monthAnchorFromDateKey(todayKey),
  );
  const [selectedKey, setSelectedKey] = useState(todayKey);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = shanghaiDateKey(new Date());
      setTodayKey((current) => (current === next ? current : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const boardQuery = useQuery<BoardData, Error>({
    queryKey: queryKeys.board(projectId),
    queryFn: () => api<BoardData>(`/projects/${projectId}/board`),
    refetchInterval: 60_000,
  });

  const board = boardQuery.data;
  const project = board?.project;
  const tasks = board?.tasks ?? EMPTY_TASKS;
  const columns = board?.columns ?? EMPTY_COLUMNS;
  const projectName = project?.name ?? '项目';

  const cells = useMemo(
    () => monthMatrix(monthAnchor.year, monthAnchor.month, new Date(`${todayKey}T12:00:00+08:00`)),
    [monthAnchor, todayKey],
  );
  const groupedTasks = useMemo(() => {
    const grouped = tasksByDate(tasks);
    for (const [dateKey, bucket] of grouped) {
      grouped.set(dateKey, sortTasksForCalendar(bucket));
    }
    return grouped;
  }, [tasks]);
  const columnNames = useMemo(
    () => new Map(columns.map((column) => [column.id, column.name])),
    [columns],
  );
  const selectedTasks = useMemo(
    () => groupedTasks.get(selectedKey) ?? [],
    [groupedTasks, selectedKey],
  );
  const noDueTasks = useMemo(
    () =>
      sortTasksForCalendar(
        tasks.filter((task) => task.completedAt === null && !hasValidDueDate(task)),
      ),
    [tasks],
  );
  const dueTaskCount = useMemo(
    () => Array.from(groupedTasks.values()).reduce((total, bucket) => total + bucket.length, 0),
    [groupedTasks],
  );
  const exportableTasks = useMemo(() => tasks.filter(hasValidDueDate), [tasks]);

  const goToMonth = (next: MonthAnchor) => {
    setMonthAnchor(next);
    setSelectedKey((current) => {
      const currentAnchor = monthAnchorFromDateKey(current);
      if (currentAnchor.year === next.year && currentAnchor.month === next.month) {
        return current;
      }
      const todayAnchor = monthAnchorFromDateKey(todayKey);
      if (todayAnchor.year === next.year && todayAnchor.month === next.month) {
        return todayKey;
      }
      return dateKeyFromParts(next.year, next.month, 1);
    });
  };

  const handleToday = () => {
    setMonthAnchor(monthAnchorFromDateKey(todayKey));
    setSelectedKey(todayKey);
  };

  const handleExportIcs = () => {
    try {
      if (exportableTasks.length === 0) {
        toast.info('暂无可导出的任务，请先为任务设置截止日期。');
        return;
      }
      const content = buildProjectIcs({ projectName, tasks: exportableTasks, columns });
      downloadTextFile(
        `${sanitizeFileName(projectName)}-任务日历.ics`,
        content,
        'text/calendar;charset=utf-8',
      );
      toast.success(`已导出 ${exportableTasks.length} 个任务到 ICS 日历`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <>
      <ProjectPageHeader projectId={projectId} project={project} />

      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              项目日历
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              按截止日期查看任务，点击任务可在看板抽屉中查看详情，支持导出 ICS 日历。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportIcs}
            disabled={!board || exportableTasks.length === 0}
            title={
              exportableTasks.length === 0 ? '暂无可导出的任务，请先为任务设置截止日期' : undefined
            }
            aria-label="导出项目任务日历为 ICS 文件"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            导出 ICS
          </Button>
        </div>

        {boardQuery.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">正在加载项目日历…</span>
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-28" />
            </div>
            <Skeleton className="h-[520px] w-full rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-5">
              <Skeleton className="h-40 rounded-xl lg:col-span-3" />
              <Skeleton className="h-40 rounded-xl lg:col-span-2" />
            </div>
          </div>
        ) : boardQuery.isError && !board ? (
          <Card role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">日历加载失败</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {getErrorMessage(boardQuery.error)}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void boardQuery.refetch();
                }}
              >
                重试
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/">返回工作台</Link>
              </Button>
            </div>
          </Card>
        ) : tasks.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">项目还没有任务</p>
            <p className="text-sm text-muted-foreground">
              创建任务并设置截止日期后，就会显示在日历中。
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={`/projects/${projectId}`}>前往看板</Link>
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToMonth(shiftMonth(monthAnchor, -1))}
                  aria-label="上一个月"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <h3
                  className="min-w-[6.5rem] text-center text-base font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {formatMonthLabel(monthAnchor)}
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToMonth(shiftMonth(monthAnchor, 1))}
                  aria-label="下一个月"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-1"
                  onClick={handleToday}
                >
                  今天
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">共 {dueTaskCount} 个带截止日期的任务</p>
            </div>

            <MonthGrid
              cells={cells}
              projectId={projectId}
              monthLabel={formatMonthLabel(monthAnchor)}
              selectedKey={selectedKey}
              tasksByDay={groupedTasks}
              onSelectDay={setSelectedKey}
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <SelectedDayAgenda
                  projectId={projectId}
                  dateKey={selectedKey}
                  tasks={selectedTasks}
                  columnNames={columnNames}
                />
              </div>
              <div className="lg:col-span-2">
                <NoDueTaskList projectId={projectId} tasks={noDueTasks} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
