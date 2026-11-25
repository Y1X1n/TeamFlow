-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'MEMBER_SKILLS_CHANGED';

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
