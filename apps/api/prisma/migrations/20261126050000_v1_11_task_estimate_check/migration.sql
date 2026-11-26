-- 工时估算只允许 15–10080 分钟且为 15 的整数倍；应用层已校验，数据库约束作为最后防线。
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimate_minutes_check"
  CHECK ("estimate_minutes" IS NULL OR ("estimate_minutes" BETWEEN 15 AND 10080 AND "estimate_minutes" % 15 = 0));
