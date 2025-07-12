/*
  Warnings:

  - You are about to drop the column `completed` on the `Milestone` table. All the data in the column will be lost.
  - You are about to drop the column `deadline` on the `Milestone` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Milestone` table. All the data in the column will be lost.
  - You are about to drop the column `discountAmount` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `discountCode` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `invoice_id` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `taxAmount` on the `Order` table. All the data in the column will be lost.
  - Added the required column `dueDate` to the `Milestone` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_id` to the `Milestone` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Milestone` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_jobId_fkey";

-- DropIndex
DROP INDEX "Order_invoice_id_key";

-- AlterTable
ALTER TABLE "FreelancerProfile" ADD COLUMN     "lastModifiedBy" INTEGER,
ADD COLUMN     "maxConcurrentOrders" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "performanceScore" DOUBLE PRECISION DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Gig" ADD COLUMN     "averageOrderValue" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN     "geoRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastModifiedBy" INTEGER,
ADD COLUMN     "visibilityScore" DOUBLE PRECISION DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "orderId" INTEGER;

-- AlterTable
ALTER TABLE "Milestone" DROP COLUMN "completed",
DROP COLUMN "deadline",
DROP COLUMN "name",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliverables" JSONB,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "lastModifiedBy" INTEGER,
ADD COLUMN     "order_id" INTEGER NOT NULL,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "jobId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "discountAmount",
DROP COLUMN "discountCode",
DROP COLUMN "invoice_id",
DROP COLUMN "paymentStatus",
DROP COLUMN "taxAmount",
ADD COLUMN     "clientNotes" TEXT,
ADD COLUMN     "lastModifiedBy" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "orderPriority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orderSource" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "slaCompliance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "urgencyLevel" TEXT;

-- CreateIndex
CREATE INDEX "FreelancerProfile_performanceScore_idx" ON "FreelancerProfile"("performanceScore");

-- CreateIndex
CREATE INDEX "Gig_freelancer_id_status_idx" ON "Gig"("freelancer_id", "status");

-- CreateIndex
CREATE INDEX "Gig_category_idx" ON "Gig"("category");

-- CreateIndex
CREATE INDEX "Gig_visibilityScore_idx" ON "Gig"("visibilityScore");

-- CreateIndex
CREATE INDEX "Milestone_order_id_status_idx" ON "Milestone"("order_id", "status");

-- CreateIndex
CREATE INDEX "Notification_user_id_createdAt_idx" ON "Notification"("user_id", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Order_gig_id_status_idx" ON "Order"("gig_id", "status");

-- CreateIndex
CREATE INDEX "Order_client_id_status_idx" ON "Order"("client_id", "status");

-- CreateIndex
CREATE INDEX "Order_freelancer_id_status_idx" ON "Order"("freelancer_id", "status");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_orderPriority_idx" ON "Order"("orderPriority");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
