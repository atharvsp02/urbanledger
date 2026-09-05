-- CreateEnum
CREATE TYPE app."OrderKind" AS ENUM ('PURCHASE', 'SALES');

-- CreateEnum
CREATE TYPE app."OrderState" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE app."SequenceKind" ADD VALUE 'PURCHASE_ORDER';
ALTER TYPE app."SequenceKind" ADD VALUE 'SALES_ORDER';

-- CreateTable
CREATE TABLE app."orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "kind" app."OrderKind" NOT NULL,
    "contactId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "orderDate" DATE NOT NULL,
    "state" app."OrderState" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(20,2) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE app."order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "unitPriceSnapshot" DECIMAL(20,4) NOT NULL,
    "lineTotal" DECIMAL(20,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_businessId_kind_state_orderDate_idx" ON app."orders"("businessId", "kind", "state", "orderDate");

-- CreateIndex
CREATE INDEX "orders_contactId_idx" ON app."orders"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_businessId_kind_number_key" ON app."orders"("businessId", "kind", "number");

-- CreateIndex
CREATE INDEX "order_lines_productId_idx" ON app."order_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "order_lines_orderId_position_key" ON app."order_lines"("orderId", "position");

-- AddForeignKey
ALTER TABLE app."orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES app."businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE app."orders" ADD CONSTRAINT "orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES app."contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE app."orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES app."application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE app."order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES app."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE app."order_lines" ADD CONSTRAINT "order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES app."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE app.orders
  ADD CONSTRAINT orders_total_nonnegative CHECK (total >= 0),
  ADD CONSTRAINT orders_revision_positive CHECK (revision > 0);

ALTER TABLE app.order_lines
  ADD CONSTRAINT order_lines_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT order_lines_unit_price_nonnegative CHECK ("unitPriceSnapshot" >= 0),
  ADD CONSTRAINT order_lines_total_nonnegative CHECK ("lineTotal" >= 0),
  ADD CONSTRAINT order_lines_position_nonnegative CHECK (position >= 0);

CREATE FUNCTION app.protect_frozen_order()
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

CREATE FUNCTION app.protect_frozen_order_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
DECLARE
  order_state app."OrderState";
  target_order_id uuid;
BEGIN
	IF TG_OP = 'INSERT' THEN
		target_order_id := NEW."orderId";
	ELSE
		target_order_id := OLD."orderId";
	END IF;

  SELECT state INTO order_state
  FROM app.orders
  WHERE id = target_order_id;

  IF order_state <> 'DRAFT' THEN
    RAISE EXCEPTION 'confirmed or cancelled order lines are immutable';
  END IF;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;

	RETURN NEW;
END;
$function$;

CREATE TRIGGER protect_frozen_orders
BEFORE UPDATE OR DELETE ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.protect_frozen_order();

CREATE TRIGGER protect_frozen_order_lines
BEFORE INSERT OR UPDATE OR DELETE ON app.order_lines
FOR EACH ROW EXECUTE FUNCTION app.protect_frozen_order_line();
