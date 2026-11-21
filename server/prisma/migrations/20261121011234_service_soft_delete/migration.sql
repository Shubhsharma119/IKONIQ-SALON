-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
