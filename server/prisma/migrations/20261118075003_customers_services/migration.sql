-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "gender" TEXT,
    "dob" TIMESTAMP(3),
    "notes" TEXT,
    "branchId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_name_key" ON "ServiceCategory"("name");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
