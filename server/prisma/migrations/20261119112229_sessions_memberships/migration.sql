-- AlterEnum
ALTER TYPE "PackageKind" ADD VALUE 'SESSION';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "sessionCount" INTEGER;

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);
