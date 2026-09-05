-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'CONTACT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PortalAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProvisioningKind" AS ENUM ('PUBLIC_ACCOUNTANT', 'ADMIN', 'CONTACT');

-- CreateEnum
CREATE TYPE "ProvisioningState" AS ENUM ('PENDING', 'AUTH_CREATED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('CUSTOMER', 'VENDOR', 'BOTH');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('GOODS', 'SERVICE', 'COMBO');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EXPENSE', 'INCOME', 'CAPITAL');

-- CreateEnum
CREATE TYPE "AccountSubtype" AS ENUM ('GENERAL', 'CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'INPUT_TAX', 'OUTPUT_TAX');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('SALES', 'PURCHASE', 'BANK', 'CASH', 'GENERAL', 'OPENING');

-- CreateEnum
CREATE TYPE "TaxScope" AS ENUM ('SALES', 'PURCHASE', 'BOTH');

-- CreateEnum
CREATE TYPE "AnalyticType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "EntryState" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('OPENING', 'MANUAL', 'CUSTOMER_INVOICE', 'VENDOR_BILL', 'CUSTOMER_PAYMENT', 'VENDOR_PAYMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SequenceKind" AS ENUM ('CUSTOMER_INVOICE', 'VENDOR_BILL', 'CUSTOMER_PAYMENT', 'VENDOR_PAYMENT', 'JOURNAL_ENTRY');

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "fiscalYearStartDay" INTEGER NOT NULL DEFAULT 1,
    "accountingLockDate" DATE,
    "readyAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerUserId" UUID NOT NULL,
    "loginId" VARCHAR(12) NOT NULL,
    "normalizedLoginId" VARCHAR(12) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PROVISIONING',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "role" "AccessRole" NOT NULL,
    "validFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "status" "PortalAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedById" UUID,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID,
    "actorUserId" UUID,
    "operationKey" UUID NOT NULL,
    "kind" "ProvisioningKind" NOT NULL,
    "normalizedLoginId" VARCHAR(12) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "providerUserId" UUID,
    "state" "ProvisioningState" NOT NULL DEFAULT 'PENDING',
    "safeFailureCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provisioning_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "mobile" VARCHAR(32),
    "street" VARCHAR(240),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(16),
    "imageAssetId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(64),
    "kind" "ProductKind" NOT NULL,
    "salesPrice" DECIMAL(20,4) NOT NULL,
    "purchaseCost" DECIMAL(20,4) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "AccountType" NOT NULL,
    "subtype" "AccountSubtype" NOT NULL DEFAULT 'GENERAL',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "JournalType" NOT NULL,
    "defaultIncomeAccountId" UUID,
    "defaultExpenseAccountId" UUID,
    "defaultControlAccountId" UUID,
    "defaultLiquidityAccountId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "scope" "TaxScope" NOT NULL,
    "inputAccountId" UUID,
    "outputAccountId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytic_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AnalyticType" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analytic_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "responsibleUserId" UUID NOT NULL,
    "responsibleNameSnapshot" VARCHAR(160) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "analyticAccountId" UUID NOT NULL,
    "plannedAmount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "verifiedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "postingDate" DATE NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "state" "EntryState" NOT NULL DEFAULT 'DRAFT',
    "source" "EntrySource" NOT NULL,
    "sourceReference" UUID,
    "reversalOfEntryId" UUID,
    "createdById" UUID NOT NULL,
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "contactId" UUID,
    "analyticAccountId" UUID,
    "description" VARCHAR(240),
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "kind" "SequenceKind" NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "prefix" VARCHAR(24) NOT NULL,
    "nextNumber" BIGINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "actorUserId" UUID,
    "operationKey" UUID NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "resourceId" UUID,
    "result" JSONB,
    "committedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "details" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "application_users_providerUserId_key" ON "application_users"("providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "application_users_normalizedLoginId_key" ON "application_users"("normalizedLoginId");

-- CreateIndex
CREATE UNIQUE INDEX "application_users_normalizedEmail_key" ON "application_users"("normalizedEmail");

-- CreateIndex
CREATE INDEX "application_users_status_idx" ON "application_users"("status");

-- CreateIndex
CREATE INDEX "staff_grants_businessId_role_revokedAt_idx" ON "staff_grants"("businessId", "role", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_grants_userId_businessId_role_key" ON "staff_grants"("userId", "businessId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_userId_key" ON "portal_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_contactId_key" ON "portal_access"("contactId");

-- CreateIndex
CREATE INDEX "portal_access_businessId_status_idx" ON "portal_access"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_operations_operationKey_key" ON "provisioning_operations"("operationKey");

-- CreateIndex
CREATE INDEX "provisioning_operations_normalizedLoginId_idx" ON "provisioning_operations"("normalizedLoginId");

-- CreateIndex
CREATE INDEX "provisioning_operations_normalizedEmail_idx" ON "provisioning_operations"("normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_imageAssetId_key" ON "contacts"("imageAssetId");

-- CreateIndex
CREATE INDEX "contacts_businessId_kind_archivedAt_idx" ON "contacts"("businessId", "kind", "archivedAt");

-- CreateIndex
CREATE INDEX "contacts_businessId_name_idx" ON "contacts"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_businessId_name_key" ON "product_categories"("businessId", "name");

-- CreateIndex
CREATE INDEX "products_businessId_kind_archivedAt_idx" ON "products"("businessId", "kind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_businessId_sku_key" ON "products"("businessId", "sku");

-- CreateIndex
CREATE INDEX "ledger_accounts_businessId_type_archivedAt_idx" ON "ledger_accounts"("businessId", "type", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_businessId_code_key" ON "ledger_accounts"("businessId", "code");

-- CreateIndex
CREATE INDEX "journals_businessId_type_archivedAt_idx" ON "journals"("businessId", "type", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "journals_businessId_code_key" ON "journals"("businessId", "code");

-- CreateIndex
CREATE INDEX "taxes_businessId_archivedAt_idx" ON "taxes"("businessId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "taxes_businessId_name_key" ON "taxes"("businessId", "name");

-- CreateIndex
CREATE INDEX "analytic_accounts_businessId_type_archivedAt_idx" ON "analytic_accounts"("businessId", "type", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "analytic_accounts_businessId_name_key" ON "analytic_accounts"("businessId", "name");

-- CreateIndex
CREATE INDEX "budgets_businessId_startsOn_endsOn_idx" ON "budgets"("businessId", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_businessId_name_startsOn_endsOn_key" ON "budgets"("businessId", "name", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budgetId_analyticAccountId_key" ON "budget_lines"("budgetId", "analyticAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_storageKey_key" ON "file_assets"("storageKey");

-- CreateIndex
CREATE INDEX "file_assets_businessId_idx" ON "file_assets"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversalOfEntryId_key" ON "journal_entries"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "journal_entries_businessId_postingDate_state_idx" ON "journal_entries"("businessId", "postingDate", "state");

-- CreateIndex
CREATE INDEX "journal_entries_journalId_postingDate_idx" ON "journal_entries"("journalId", "postingDate");

-- CreateIndex
CREATE INDEX "journal_items_entryId_idx" ON "journal_items"("entryId");

-- CreateIndex
CREATE INDEX "journal_items_accountId_entryId_idx" ON "journal_items"("accountId", "entryId");

-- CreateIndex
CREATE INDEX "journal_items_contactId_idx" ON "journal_items"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_businessId_kind_period_key" ON "document_sequences"("businessId", "kind", "period");

-- CreateIndex
CREATE INDEX "command_operations_businessId_operation_createdAt_idx" ON "command_operations"("businessId", "operation", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "command_operations_businessId_operationKey_key" ON "command_operations"("businessId", "operationKey");

-- CreateIndex
CREATE INDEX "audit_events_businessId_occurredAt_idx" ON "audit_events"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_targetType_targetId_idx" ON "audit_events"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "staff_grants" ADD CONSTRAINT "staff_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_grants" ADD CONSTRAINT "staff_grants_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_grants" ADD CONSTRAINT "staff_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "application_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "application_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_operations" ADD CONSTRAINT "provisioning_operations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_operations" ADD CONSTRAINT "provisioning_operations_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "application_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultIncomeAccountId_fkey" FOREIGN KEY ("defaultIncomeAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultExpenseAccountId_fkey" FOREIGN KEY ("defaultExpenseAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultControlAccountId_fkey" FOREIGN KEY ("defaultControlAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultLiquidityAccountId_fkey" FOREIGN KEY ("defaultLiquidityAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_inputAccountId_fkey" FOREIGN KEY ("inputAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_outputAccountId_fkey" FOREIGN KEY ("outputAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytic_accounts" ADD CONSTRAINT "analytic_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_operations" ADD CONSTRAINT "command_operations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_operations" ADD CONSTRAINT "command_operations_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "application_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "application_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
