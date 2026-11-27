-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "recurrence" "TaskRecurrence" NOT NULL DEFAULT 'NONE';
