import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

/** 任务/看板发生写入后，统一刷新所有依赖任务数据的页面级查询。 */
export function invalidateProjectSurfaces(queryClient: QueryClient, projectId: string): void {
  const keys = [
    queryKeys.board(projectId),
    queryKeys.activities(projectId),
    queryKeys.trash(projectId),
    queryKeys.reports(projectId),
    queryKeys.currentWeekReport(projectId),
    ['period-report', projectId],
    ['my-tasks'],
  ];
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** 任务抽屉内的评论/子任务/附件变化需要同时刷新任务详情与项目活动。 */
export function invalidateTaskSurfaces(
  queryClient: QueryClient,
  projectId: string,
  taskId: string,
): void {
  invalidateProjectSurfaces(queryClient, projectId);
  for (const queryKey of [
    queryKeys.task(taskId),
    queryKeys.comments(taskId),
    queryKeys.subtasks(taskId),
    queryKeys.attachments(taskId),
    queryKeys.taskActivities(taskId),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
