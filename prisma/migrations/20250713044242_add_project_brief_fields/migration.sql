/*
  Warnings:

  - Added the required column `description` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
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
