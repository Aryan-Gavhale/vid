/*
  Warnings:

  - The values [AUDIO,DOCUMENT] on the enum `MediaType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[invoice_id]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[trackingId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentGatewayId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gig_id` to the `Review` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "MediaType_new" AS ENUM ('IMAGE', 'VIDEO', 'THUMBNAIL');
ALTER TABLE "GigSampleMedia" ALTER COLUMN "mediaType" TYPE "MediaType_new" USING ("mediaType"::text::"MediaType_new");
ALTER TYPE "MediaType" RENAME TO "MediaType_old";
ALTER TYPE "MediaType_new" RENAME TO "MediaType";
DROP TYPE "MediaType_old";
COMMIT;

-- AlterTable
ALTER TABLE "FreelancerProfile" ADD COLUMN     "activeOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationRate" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "orderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responseRate" DOUBLE PRECISION DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Gig" ADD COLUMN     "clickThroughRate" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN     "completionRate" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN     "impressions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPromoted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastOrderedAt" TIMESTAMP(3),
ADD COLUMN     "orderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responseTime" DOUBLE PRECISION,
ADD COLUMN     "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "deliveryMethod" TEXT,
ADD COLUMN     "deliveryStatus" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "discountAmount" DOUBLE PRECISION,
ADD COLUMN     "discountCode" TEXT,
ADD COLUMN     "invoice_id" TEXT,
ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "sourceIp" TEXT,
ADD COLUMN     "taxAmount" DOUBLE PRECISION,
ADD COLUMN     "trackingId" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "gig_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fraudStatus" TEXT,
ADD COLUMN     "gatewayFee" DOUBLE PRECISION,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "paymentGatewayId" TEXT,
ADD COLUMN     "paymentIntentId" TEXT,
ADD COLUMN     "refundReason" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "freelancer_id" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_order_id_key" ON "Invoice"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoice_id_key" ON "Order"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingId_key" ON "Order"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_paymentGatewayId_key" ON "Transaction"("paymentGatewayId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "Gig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
