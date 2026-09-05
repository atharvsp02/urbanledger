/*
  Warnings:

  - A unique constraint covering the columns `[salesDeliveryLineId]` on the table `inventory_movements` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "SequenceKind" ADD VALUE IF NOT EXISTS 'SALES_DELIVERY';

-- AlterTable
ALTER TABLE "financial_document_lines" ADD COLUMN IF NOT EXISTS "taxAccountIdSnapshot" UUID;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "salesDeliveryLineId" UUID,
ALTER COLUMN "purchaseReceiptLineId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "analyticAccountId" UUID,
ADD COLUMN IF NOT EXISTS "grossTotal" DECIMAL(20,2),
ADD COLUMN IF NOT EXISTS "productKindSnapshot" "ProductKind",
ADD COLUMN IF NOT EXISTS "taxAccountIdSnapshot" UUID,
ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxId" UUID,
ADD COLUMN IF NOT EXISTS "taxNameSnapshot" VARCHAR(120),
ADD COLUMN IF NOT EXISTS "taxRateSnapshot" DECIMAL(7,4),
ADD COLUMN IF NOT EXISTS "taxRevisionSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "netTotal" DECIMAL(20,2),
ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(20,2) NOT NULL DEFAULT 0;

ALTER TABLE app.order_lines DISABLE TRIGGER protect_frozen_order_lines;

UPDATE app.order_lines AS line
SET "productKindSnapshot" = product.kind,
    "grossTotal" = line."lineTotal"
FROM app.products AS product
WHERE product.id = line."productId";

ALTER TABLE app.order_lines ENABLE TRIGGER protect_frozen_order_lines;

ALTER TABLE app.orders DISABLE TRIGGER protect_frozen_orders;

UPDATE app.orders
SET "netTotal" = total;

ALTER TABLE app.orders ENABLE TRIGGER protect_frozen_orders;

ALTER TABLE app.financial_document_lines DISABLE TRIGGER protect_financial_document_lines;

UPDATE app.financial_document_lines AS line
SET "taxAccountIdSnapshot" = CASE
  WHEN document.kind = 'VENDOR_BILL' THEN tax."inputAccountId"
  WHEN document.kind = 'CUSTOMER_INVOICE' THEN tax."outputAccountId"
END
FROM app.financial_documents AS document, app.taxes AS tax
WHERE line."documentId" = document.id
  AND line."taxId" = tax.id;

ALTER TABLE app.financial_document_lines ENABLE TRIGGER protect_financial_document_lines;

ALTER TABLE app.order_lines
  ALTER COLUMN "productKindSnapshot" SET NOT NULL,
  ALTER COLUMN "grossTotal" SET NOT NULL;

ALTER TABLE app.orders
  ALTER COLUMN "netTotal" SET NOT NULL;

ALTER TABLE app.inventory_movements
  DROP CONSTRAINT inventory_movements_quantity_positive,
  ADD CONSTRAINT inventory_movements_source_direction CHECK (
    ("purchaseReceiptLineId" IS NOT NULL AND "salesDeliveryLineId" IS NULL AND "quantityDelta" > 0)
    OR ("purchaseReceiptLineId" IS NULL AND "salesDeliveryLineId" IS NOT NULL AND "quantityDelta" < 0)
  );

ALTER TABLE app.orders
  ADD CONSTRAINT orders_shared_totals_nonnegative CHECK (
    "netTotal" >= 0 AND "taxTotal" >= 0
  ),
  ADD CONSTRAINT orders_shared_total_consistent CHECK (total = "netTotal" + "taxTotal");

ALTER TABLE app.order_lines
  ADD CONSTRAINT order_lines_shared_amounts_nonnegative CHECK (
    "lineTotal" >= 0 AND "taxAmount" >= 0 AND "grossTotal" >= 0
  ),
  ADD CONSTRAINT order_lines_shared_total_consistent CHECK (
    "grossTotal" = "lineTotal" + "taxAmount"
  ),
  ADD CONSTRAINT order_lines_tax_snapshot_consistent CHECK (
    ("taxId" IS NULL
      AND "taxNameSnapshot" IS NULL
      AND "taxRateSnapshot" IS NULL
      AND "taxRevisionSnapshot" IS NULL
      AND "taxAccountIdSnapshot" IS NULL
      AND "taxAmount" = 0)
    OR ("taxId" IS NOT NULL
      AND "taxNameSnapshot" IS NOT NULL
      AND "taxRateSnapshot" IS NOT NULL
      AND "taxRevisionSnapshot" > 0
      AND "taxAccountIdSnapshot" IS NOT NULL
      AND "taxRateSnapshot" BETWEEN 0 AND 100)
  );

ALTER TABLE app.financial_document_lines
  DROP CONSTRAINT financial_document_lines_tax_snapshot_consistent,
  ADD CONSTRAINT financial_document_lines_tax_snapshot_consistent CHECK (
    ("taxId" IS NULL
      AND "taxNameSnapshot" IS NULL
      AND "taxRateSnapshot" IS NULL
      AND "taxRevisionSnapshot" IS NULL
      AND "taxAccountIdSnapshot" IS NULL
      AND "taxAmount" = 0)
    OR ("taxId" IS NOT NULL
      AND "taxNameSnapshot" IS NOT NULL
      AND "taxRateSnapshot" IS NOT NULL
      AND "taxRevisionSnapshot" > 0
      AND "taxAccountIdSnapshot" IS NOT NULL
      AND "taxRateSnapshot" BETWEEN 0 AND 100)
  );

-- CreateTable
CREATE TABLE "sales_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "sourceOrderNumberSnapshot" VARCHAR(40) NOT NULL,
    "sourceOrderDateSnapshot" DATE NOT NULL,
    "contactNameSnapshot" VARCHAR(160) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_delivery_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deliveryId" UUID NOT NULL,
    "sourceOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" VARCHAR(160) NOT NULL,
    "productKindSnapshot" "ProductKind" NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "sales_delivery_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_deliveries_orderId_key" ON "sales_deliveries"("orderId");

-- CreateIndex
CREATE INDEX "sales_deliveries_businessId_deliveryDate_idx" ON "sales_deliveries"("businessId", "deliveryDate");

-- CreateIndex
CREATE INDEX "sales_deliveries_contactId_idx" ON "sales_deliveries"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_deliveries_businessId_number_key" ON "sales_deliveries"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_delivery_lines_sourceOrderLineId_key" ON "sales_delivery_lines"("sourceOrderLineId");

-- CreateIndex
CREATE INDEX "sales_delivery_lines_productId_idx" ON "sales_delivery_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_delivery_lines_deliveryId_position_key" ON "sales_delivery_lines"("deliveryId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_salesDeliveryLineId_key" ON "inventory_movements"("salesDeliveryLineId");

-- CreateIndex
CREATE INDEX "order_lines_taxId_idx" ON "order_lines"("taxId");

-- CreateIndex
CREATE INDEX "order_lines_analyticAccountId_idx" ON "order_lines"("analyticAccountId");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "sales_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_sourceOrderLineId_fkey" FOREIGN KEY ("sourceOrderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_salesDeliveryLineId_fkey" FOREIGN KEY ("salesDeliveryLineId") REFERENCES "sales_delivery_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE app.sales_delivery_lines
  ADD CONSTRAINT sales_delivery_lines_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT sales_delivery_lines_position_nonnegative CHECK (position >= 0);

CREATE FUNCTION app.protect_sales_delivery_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'sales delivery history is immutable';
END;
$function$;

CREATE TRIGGER protect_sales_deliveries
BEFORE UPDATE OR DELETE ON app.sales_deliveries
FOR EACH ROW EXECUTE FUNCTION app.protect_sales_delivery_history();

CREATE TRIGGER protect_sales_delivery_lines
BEFORE UPDATE OR DELETE ON app.sales_delivery_lines
FOR EACH ROW EXECUTE FUNCTION app.protect_sales_delivery_history();

CREATE OR REPLACE FUNCTION app.protect_frozen_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orders cannot be deleted';
  END IF;

  IF OLD.state = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled orders are immutable';
  END IF;

  IF OLD.state = 'CONFIRMED' THEN
    IF NEW."businessId" IS DISTINCT FROM OLD."businessId"
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
      OR NEW.number IS DISTINCT FROM OLD.number
      OR NEW."orderDate" IS DISTINCT FROM OLD."orderDate"
      OR NEW."netTotal" IS DISTINCT FROM OLD."netTotal"
      OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW.state NOT IN ('CONFIRMED', 'CANCELLED') THEN
      RAISE EXCEPTION 'confirmed order commercial fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
