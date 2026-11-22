-- CreateEnum
CREATE TYPE "ProductUsage" AS ENUM ('SALE', 'SALON_USE', 'BOTH');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('IN', 'OUT', 'ADJUST', 'SALE', 'DAMAGED', 'USED');

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "usage" "ProductUsage" NOT NULL DEFAULT 'SALE',
    "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stockQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "lowStockLevel" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "balanceAfter" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
