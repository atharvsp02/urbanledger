-- CreateEnum
CREATE TYPE "FinancialDocumentKind" AS ENUM ('VENDOR_BILL', 'CUSTOMER_INVOICE');

-- CreateEnum
CREATE TYPE "FinancialDocumentState" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "SequenceKind" ADD VALUE 'PURCHASE_RECEIPT';

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "receiptDate" DATE NOT NULL,
    "sourceOrderNumberSnapshot" VARCHAR(40) NOT NULL,
    "sourceOrderDateSnapshot" DATE NOT NULL,
    "contactNameSnapshot" VARCHAR(160) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptId" UUID NOT NULL,
    "sourceOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" VARCHAR(160) NOT NULL,
    "productKindSnapshot" "ProductKind" NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "purchaseReceiptLineId" UUID NOT NULL,
    "movementDate" DATE NOT NULL,
    "quantityDelta" DECIMAL(16,4) NOT NULL,
    "productNameSnapshot" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "kind" "FinancialDocumentKind" NOT NULL,
    "contactId" UUID NOT NULL,
    "sourceOrderId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "documentDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "externalReference" VARCHAR(160),
    "contactNameSnapshot" VARCHAR(160) NOT NULL,
    "sourceOrderNumberSnapshot" VARCHAR(40) NOT NULL,
    "state" "FinancialDocumentState" NOT NULL DEFAULT 'DRAFT',
    "netTotal" DECIMAL(20,2) NOT NULL,
    "taxTotal" DECIMAL(20,2) NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "journalEntryId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_document_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "sourceOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "unitPriceSnapshot" DECIMAL(20,4) NOT NULL,
    "lineNetTotal" DECIMAL(20,2) NOT NULL,
    "taxId" UUID,
    "taxNameSnapshot" VARCHAR(120),
    "taxRateSnapshot" DECIMAL(7,4),
    "taxRevisionSnapshot" INTEGER,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,2) NOT NULL,
    "analyticAccountId" UUID,
    "position" INTEGER NOT NULL,

    CONSTRAINT "financial_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_orderId_key" ON "purchase_receipts"("orderId");

-- CreateIndex
CREATE INDEX "purchase_receipts_businessId_receiptDate_idx" ON "purchase_receipts"("businessId", "receiptDate");

-- CreateIndex
CREATE INDEX "purchase_receipts_contactId_idx" ON "purchase_receipts"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_businessId_number_key" ON "purchase_receipts"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_lines_sourceOrderLineId_key" ON "purchase_receipt_lines"("sourceOrderLineId");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_productId_idx" ON "purchase_receipt_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_lines_receiptId_position_key" ON "purchase_receipt_lines"("receiptId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_purchaseReceiptLineId_key" ON "inventory_movements"("purchaseReceiptLineId");

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_productId_movementDate_idx" ON "inventory_movements"("businessId", "productId", "movementDate");

-- CreateIndex
CREATE UNIQUE INDEX "financial_documents_journalEntryId_key" ON "financial_documents"("journalEntryId");

-- CreateIndex
CREATE INDEX "financial_documents_businessId_kind_state_documentDate_idx" ON "financial_documents"("businessId", "kind", "state", "documentDate");

-- CreateIndex
CREATE INDEX "financial_documents_contactId_idx" ON "financial_documents"("contactId");

-- CreateIndex
CREATE INDEX "financial_documents_sourceOrderId_idx" ON "financial_documents"("sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_documents_businessId_kind_number_key" ON "financial_documents"("businessId", "kind", "number");

-- CreateIndex
CREATE UNIQUE INDEX "financial_documents_active_source_order_key" ON "financial_documents"("sourceOrderId", "kind") WHERE "state" <> 'CANCELLED';

-- CreateIndex
CREATE INDEX "financial_document_lines_productId_idx" ON "financial_document_lines"("productId");

-- CreateIndex
CREATE INDEX "financial_document_lines_taxId_idx" ON "financial_document_lines"("taxId");

-- CreateIndex
CREATE INDEX "financial_document_lines_analyticAccountId_idx" ON "financial_document_lines"("analyticAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_document_lines_documentId_position_key" ON "financial_document_lines"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "financial_document_lines_documentId_sourceOrderLineId_key" ON "financial_document_lines"("documentId", "sourceOrderLineId");

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_sourceOrderLineId_fkey" FOREIGN KEY ("sourceOrderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchaseReceiptLineId_fkey" FOREIGN KEY ("purchaseReceiptLineId") REFERENCES "purchase_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_document_lines" ADD CONSTRAINT "financial_document_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "financial_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_document_lines" ADD CONSTRAINT "financial_document_lines_sourceOrderLineId_fkey" FOREIGN KEY ("sourceOrderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_document_lines" ADD CONSTRAINT "financial_document_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_document_lines" ADD CONSTRAINT "financial_document_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_document_lines" ADD CONSTRAINT "financial_document_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE app.purchase_receipt_lines
  ADD CONSTRAINT purchase_receipt_lines_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT purchase_receipt_lines_position_nonnegative CHECK (position >= 0);

ALTER TABLE app.inventory_movements
  ADD CONSTRAINT inventory_movements_quantity_positive CHECK ("quantityDelta" > 0);

ALTER TABLE app.financial_documents
  ADD CONSTRAINT financial_documents_date_order CHECK ("dueDate" >= "documentDate"),
  ADD CONSTRAINT financial_documents_totals_nonnegative CHECK (
    "netTotal" >= 0 AND "taxTotal" >= 0 AND total >= 0
  ),
  ADD CONSTRAINT financial_documents_total_consistent CHECK (total = "netTotal" + "taxTotal"),
  ADD CONSTRAINT financial_documents_revision_positive CHECK (revision > 0),
  ADD CONSTRAINT financial_documents_entry_state CHECK (
    (state = 'POSTED' AND "journalEntryId" IS NOT NULL)
    OR (state IN ('DRAFT', 'CANCELLED') AND "journalEntryId" IS NULL)
  );

ALTER TABLE app.financial_document_lines
  ADD CONSTRAINT financial_document_lines_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT financial_document_lines_amounts_nonnegative CHECK (
    "unitPriceSnapshot" >= 0 AND "lineNetTotal" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0
  ),
  ADD CONSTRAINT financial_document_lines_total_consistent CHECK (
    "lineTotal" = "lineNetTotal" + "taxAmount"
  ),
  ADD CONSTRAINT financial_document_lines_position_nonnegative CHECK (position >= 0),
  ADD CONSTRAINT financial_document_lines_tax_snapshot_consistent CHECK (
    ("taxId" IS NULL
      AND "taxNameSnapshot" IS NULL
      AND "taxRateSnapshot" IS NULL
      AND "taxRevisionSnapshot" IS NULL
      AND "taxAmount" = 0)
    OR ("taxId" IS NOT NULL
      AND "taxNameSnapshot" IS NOT NULL
      AND "taxRateSnapshot" IS NOT NULL
      AND "taxRevisionSnapshot" > 0
      AND "taxRateSnapshot" BETWEEN 0 AND 100)
  );

CREATE FUNCTION app.protect_purchase_receipt_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'purchase receipt history is immutable';
END;
$function$;

CREATE TRIGGER protect_purchase_receipts
BEFORE UPDATE OR DELETE ON app.purchase_receipts
FOR EACH ROW EXECUTE FUNCTION app.protect_purchase_receipt_history();

CREATE TRIGGER protect_purchase_receipt_lines
BEFORE UPDATE OR DELETE ON app.purchase_receipt_lines
FOR EACH ROW EXECUTE FUNCTION app.protect_purchase_receipt_history();

CREATE TRIGGER protect_inventory_movements
BEFORE UPDATE OR DELETE ON app.inventory_movements
FOR EACH ROW EXECUTE FUNCTION app.protect_purchase_receipt_history();

CREATE FUNCTION app.protect_financial_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'financial documents cannot be deleted';
  END IF;

  IF OLD.state <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled financial documents are immutable';
  END IF;

  IF NEW."businessId" IS DISTINCT FROM OLD."businessId"
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
    OR NEW."sourceOrderId" IS DISTINCT FROM OLD."sourceOrderId"
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW."contactNameSnapshot" IS DISTINCT FROM OLD."contactNameSnapshot"
    OR NEW."sourceOrderNumberSnapshot" IS DISTINCT FROM OLD."sourceOrderNumberSnapshot"
    OR NEW."netTotal" IS DISTINCT FROM OLD."netTotal"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'financial document commercial fields are immutable';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER protect_financial_documents
BEFORE UPDATE OR DELETE ON app.financial_documents
FOR EACH ROW EXECUTE FUNCTION app.protect_financial_document();

CREATE FUNCTION app.protect_financial_document_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
DECLARE
  document_state app."FinancialDocumentState";
BEGIN
  SELECT state INTO document_state
  FROM app.financial_documents
  WHERE id = COALESCE(NEW."documentId", OLD."documentId");

  IF TG_OP = 'DELETE' OR document_state <> 'DRAFT' THEN
    RAISE EXCEPTION 'financial document lines cannot be deleted or changed after posting';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."documentId" IS DISTINCT FROM OLD."documentId"
    OR NEW."sourceOrderLineId" IS DISTINCT FROM OLD."sourceOrderLineId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
    OR NEW."productNameSnapshot" IS DISTINCT FROM OLD."productNameSnapshot"
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW."unitPriceSnapshot" IS DISTINCT FROM OLD."unitPriceSnapshot"
    OR NEW."lineNetTotal" IS DISTINCT FROM OLD."lineNetTotal"
    OR NEW.position IS DISTINCT FROM OLD.position
  ) THEN
    RAISE EXCEPTION 'financial document line commercial fields are immutable';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER protect_financial_document_lines
BEFORE INSERT OR UPDATE OR DELETE ON app.financial_document_lines
FOR EACH ROW EXECUTE FUNCTION app.protect_financial_document_line();
