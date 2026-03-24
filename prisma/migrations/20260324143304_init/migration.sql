-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "maxLS" DOUBLE PRECISION,
    "maxSS" DOUBLE PRECISION,
    "minLS" DOUBLE PRECISION,
    "minSS" DOUBLE PRECISION,
    "marginTop" DOUBLE PRECISION,
    "marginBottom" DOUBLE PRECISION,
    "marginLeft" DOUBLE PRECISION,
    "marginRight" DOUBLE PRECISION,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostpressMachine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "setupCost" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "minCharge" DOUBLE PRECISION,
    "hourlyRate" DOUBLE PRECISION,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostpressMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "subtype" TEXT,
    "supplier" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "costPerUnit" DOUBLE PRECISION,
    "sellPerUnit" DOUBLE PRECISION,
    "stock" DOUBLE PRECISION,
    "minStock" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'φύλλο',
    "specs" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "paperMarkup" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "printMarkup" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "guillotineMarkup" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "lamMarkup" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "bindingMarkup" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "minChargePrint" DOUBLE PRECISION,
    "minChargeGuillotine" DOUBLE PRECISION,
    "minChargeLam" DOUBLE PRECISION,
    "minChargeBinding" DOUBLE PRECISION,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "afm" TEXT,
    "doy" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "customerId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobStageId" TEXT,
    "jobStageUpdatedAt" TIMESTAMP(3),
    "threadId" TEXT,
    "linkedEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalToken" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejectedItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partialApproval" BOOLEAN NOT NULL DEFAULT false,
    "customerNotes" TEXT,
    "elorusInvoiceId" TEXT,
    "elorusContactId" TEXT,
    "companyProfile" JSONB,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machine_orgId_cat_idx" ON "Machine"("orgId", "cat");

-- CreateIndex
CREATE INDEX "Machine_orgId_deletedAt_idx" ON "Machine"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "PostpressMachine_orgId_subtype_idx" ON "PostpressMachine"("orgId", "subtype");

-- CreateIndex
CREATE INDEX "PostpressMachine_orgId_deletedAt_idx" ON "PostpressMachine"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "Material_orgId_cat_idx" ON "Material"("orgId", "cat");

-- CreateIndex
CREATE INDEX "Material_orgId_supplier_idx" ON "Material"("orgId", "supplier");

-- CreateIndex
CREATE INDEX "Material_orgId_deletedAt_idx" ON "Material"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "Profile_orgId_idx" ON "Profile"("orgId");

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE INDEX "Customer_orgId_deletedAt_idx" ON "Customer"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "Quote_orgId_status_idx" ON "Quote"("orgId", "status");

-- CreateIndex
CREATE INDEX "Quote_orgId_deletedAt_idx" ON "Quote"("orgId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_orgId_number_key" ON "Quote"("orgId", "number");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostpressMachine" ADD CONSTRAINT "PostpressMachine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
