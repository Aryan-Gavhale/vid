-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_jobId_fkey";

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "jobId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
