-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "purchaseNo" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "billNo" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "branchId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" SERIAL NOT NULL,
    "purchaseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseId" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNo_key" ON "Purchase"("purchaseNo");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_billDate_idx" ON "Purchase"("supplierId", "billDate");

-- CreateIndex
CREATE INDEX "Purchase_billDate_idx" ON "Purchase"("billDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_createdAt_idx" ON "SupplierPayment"("supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
