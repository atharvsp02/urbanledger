ALTER TABLE app.businesses
  ADD COLUMN "addressLine1" VARCHAR(240),
  ADD COLUMN "addressLine2" VARCHAR(240),
  ADD COLUMN city VARCHAR(100),
  ADD COLUMN state VARCHAR(100),
  ADD COLUMN "postalCode" VARCHAR(16),
  ADD COLUMN country VARCHAR(100) NOT NULL DEFAULT 'India',
  ADD COLUMN "purchaseOrderPrefix" VARCHAR(12) NOT NULL DEFAULT 'PO',
  ADD COLUMN "salesOrderPrefix" VARCHAR(12) NOT NULL DEFAULT 'SO',
  ADD COLUMN "purchaseReceiptPrefix" VARCHAR(12) NOT NULL DEFAULT 'PR',
  ADD COLUMN "salesDeliveryPrefix" VARCHAR(12) NOT NULL DEFAULT 'DEL',
  ADD COLUMN "customerInvoicePrefix" VARCHAR(12) NOT NULL DEFAULT 'INV',
  ADD COLUMN "vendorBillPrefix" VARCHAR(12) NOT NULL DEFAULT 'BILL',
  ADD COLUMN "customerPaymentPrefix" VARCHAR(12) NOT NULL DEFAULT 'RCPT',
  ADD COLUMN "vendorPaymentPrefix" VARCHAR(12) NOT NULL DEFAULT 'PAY',
  ADD COLUMN "journalEntryPrefix" VARCHAR(12) NOT NULL DEFAULT 'JE',
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT businesses_revision_positive CHECK (revision > 0),
  ADD CONSTRAINT businesses_fiscal_start_valid CHECK (
    "fiscalYearStartMonth" BETWEEN 1 AND 12
    AND "fiscalYearStartDay" BETWEEN 1 AND 31
  ),
  ADD CONSTRAINT businesses_prefixes_valid CHECK (
    "purchaseOrderPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "salesOrderPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "purchaseReceiptPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "salesDeliveryPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "customerInvoicePrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "vendorBillPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "customerPaymentPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "vendorPaymentPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
    AND "journalEntryPrefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$'
  );
