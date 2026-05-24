/*
  Warnings:

  - You are about to drop the column `clientId` on the `ClientLinkToken` table. All the data in the column will be lost.
  - Added the required column `email` to the `ClientLinkToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trainerId` to the `ClientLinkToken` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ClientLinkToken" DROP CONSTRAINT "ClientLinkToken_clientId_fkey";

-- DropIndex
DROP INDEX "ClientLinkToken_clientId_expiresAt_idx";

-- AlterTable
ALTER TABLE "ClientLinkToken" DROP COLUMN "clientId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "trainerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ClientLinkToken_trainerId_idx" ON "ClientLinkToken"("trainerId");

-- CreateIndex
CREATE INDEX "ClientLinkToken_email_idx" ON "ClientLinkToken"("email");

-- AddForeignKey
ALTER TABLE "ClientLinkToken" ADD CONSTRAINT "ClientLinkToken_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
