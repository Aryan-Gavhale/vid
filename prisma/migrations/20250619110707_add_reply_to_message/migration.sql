-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "replyTo" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyTo_fkey" FOREIGN KEY ("replyTo") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
