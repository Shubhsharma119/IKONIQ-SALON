-- CreateEnum
CREATE TYPE "PackageKind" AS ENUM ('COMBO', 'MEMBERSHIP');

-- CreateTable
CREATE TABLE "Package" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PackageKind" NOT NULL DEFAULT 'COMBO',
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageService" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "PackageService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageService_packageId_serviceId_key" ON "PackageService"("packageId", "serviceId");

-- AddForeignKey
ALTER TABLE "PackageService" ADD CONSTRAINT "PackageService_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageService" ADD CONSTRAINT "PackageService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
