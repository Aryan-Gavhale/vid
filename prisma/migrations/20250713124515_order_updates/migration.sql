/*
  Warnings:

  - The values [IN_PROGRESS,DELIVERED,CANCELLED,ACCEPTED,DISPUTED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `description` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'CURRENT', 'COMPLETED', 'REJECTED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Gig" ADD COLUMN     "conversionRate" DOUBLE PRECISION DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addSubtitles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aspectRatio" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "expressDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numberOfVideos" INTEGER,
ADD COLUMN     "referenceUrl" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "totalDuration" INTEGER,
ADD COLUMN     "uploadedFiles" JSONB,
ADD COLUMN     "videoType" TEXT;
