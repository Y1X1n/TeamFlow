-- 重复任务幂等标记：记录该任务最近一次生成下一实例的时间，避免并发/重复完成时重复生成。
ALTER TABLE "tasks" ADD COLUMN     "recurrence_generated_at" TIMESTAMPTZ(3);
