-- 加速按列读取 position / 计数，避免大项目看板与拖动全表扫描。
CREATE INDEX "tasks_column_position_idx" ON "tasks"("column_id", "deleted_at", "position");
