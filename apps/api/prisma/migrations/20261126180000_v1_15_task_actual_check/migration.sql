-- 实际工时与预计工时使用相同边界：15–10080 分钟且为 15 的整数倍。
-- 边界值需与应用常量 TASK_ESTIMATE_MIN_MINUTES / TASK_ESTIMATE_MAX_MINUTES 同步维护。
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_actual_minutes_check"
  CHECK ("actual_minutes" IS NULL OR ("actual_minutes" BETWEEN 15 AND 10080 AND "actual_minutes" % 15 = 0));
