-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "payee" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "branchId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
