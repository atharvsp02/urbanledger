CREATE TYPE app."PaymentDirection" AS ENUM ('CUSTOMER_INCOMING', 'VENDOR_OUTGOING');
CREATE TYPE app."PaymentSourceMode" AS ENUM ('STAFF', 'PORTAL_SIMULATION');
CREATE TYPE app."PaymentStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE app."PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE app.financial_documents
  ADD COLUMN "reversalEntryId" UUID,
  ADD COLUMN "reversedAt" TIMESTAMPTZ(6),
  ADD COLUMN "reversalReason" VARCHAR(240),
  ADD CONSTRAINT "financial_documents_reversalEntryId_key" UNIQUE ("reversalEntryId"),
  ADD CONSTRAINT "financial_documents_reversalEntryId_fkey"
    FOREIGN KEY ("reversalEntryId") REFERENCES app.journal_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT financial_documents_reversal_consistent CHECK (
    ("reversalEntryId" IS NULL AND "reversedAt" IS NULL AND "reversalReason" IS NULL)
    OR ("reversalEntryId" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL)
  );

CREATE TABLE app.payment_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  direction app."PaymentDirection" NOT NULL,
  "sourceMode" app."PaymentSourceMode" NOT NULL DEFAULT 'PORTAL_SIMULATION',
  status app."PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(20,2) NOT NULL,
  "paymentDate" DATE NOT NULL,
  "failureCode" VARCHAR(64),
  "expectedDocumentRevision" INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT payment_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_attempts_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_attempts_revision_positive CHECK (revision > 0),
  CONSTRAINT payment_attempts_document_revision_positive CHECK ("expectedDocumentRevision" > 0),
  CONSTRAINT payment_attempts_portal_incoming CHECK (
    direction = 'CUSTOMER_INCOMING' AND "sourceMode" = 'PORTAL_SIMULATION'
  ),
  CONSTRAINT payment_attempts_failure_consistent CHECK (
    (status = 'FAILED' AND "failureCode" IS NOT NULL)
    OR (status <> 'FAILED' AND "failureCode" IS NULL)
  ),
  CONSTRAINT "payment_attempts_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES app.businesses(id) ON DELETE RESTRICT,
  CONSTRAINT "payment_attempts_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES app.financial_documents(id) ON DELETE RESTRICT,
  CONSTRAINT "payment_attempts_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES app.contacts(id) ON DELETE RESTRICT,
  CONSTRAINT "payment_attempts_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES app.application_users(id) ON DELETE RESTRICT
);

CREATE TABLE app.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "journalId" UUID NOT NULL,
  "paymentAttemptId" UUID,
  direction app."PaymentDirection" NOT NULL,
  "sourceMode" app."PaymentSourceMode" NOT NULL,
  status app."PaymentStatus" NOT NULL DEFAULT 'POSTED',
  number VARCHAR(40) NOT NULL,
  "paymentDate" DATE NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  "contactNameSnapshot" VARCHAR(160) NOT NULL,
  "externalReference" VARCHAR(160),
  "journalEntryId" UUID NOT NULL,
  "reversalEntryId" UUID,
  "reversalDate" DATE,
  "reversalReason" VARCHAR(240),
  revision INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "reversedById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT "payments_paymentAttemptId_key" UNIQUE ("paymentAttemptId"),
  CONSTRAINT "payments_journalEntryId_key" UNIQUE ("journalEntryId"),
  CONSTRAINT "payments_reversalEntryId_key" UNIQUE ("reversalEntryId"),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_revision_positive CHECK (revision > 0),
  CONSTRAINT payments_reversal_consistent CHECK (
    (status = 'POSTED' AND "reversalEntryId" IS NULL AND "reversalDate" IS NULL
      AND "reversalReason" IS NULL AND "reversedById" IS NULL)
    OR (status = 'REVERSED' AND "reversalEntryId" IS NOT NULL AND "reversalDate" IS NOT NULL
      AND "reversalReason" IS NOT NULL AND "reversedById" IS NOT NULL)
  ),
  CONSTRAINT "payments_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES app.businesses(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES app.contacts(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_journalId_fkey"
    FOREIGN KEY ("journalId") REFERENCES app.journals(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_paymentAttemptId_fkey"
    FOREIGN KEY ("paymentAttemptId") REFERENCES app.payment_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES app.journal_entries(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_reversalEntryId_fkey"
    FOREIGN KEY ("reversalEntryId") REFERENCES app.journal_entries(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES app.application_users(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_reversedById_fkey"
    FOREIGN KEY ("reversedById") REFERENCES app.application_users(id) ON DELETE RESTRICT
);

CREATE TABLE app.payment_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_allocations_payment_document_key UNIQUE ("paymentId", "documentId"),
  CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0),
  CONSTRAINT "payment_allocations_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES app.payments(id) ON DELETE RESTRICT,
  CONSTRAINT "payment_allocations_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES app.financial_documents(id) ON DELETE RESTRICT
);

CREATE TABLE app.allocation_reversals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "allocationId" UUID NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT allocation_reversals_pkey PRIMARY KEY (id),
  CONSTRAINT "allocation_reversals_allocationId_key" UNIQUE ("allocationId"),
  CONSTRAINT allocation_reversals_amount_positive CHECK (amount > 0),
  CONSTRAINT "allocation_reversals_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES app.payment_allocations(id) ON DELETE RESTRICT,
  CONSTRAINT "allocation_reversals_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES app.application_users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payments_business_direction_number_key
  ON app.payments ("businessId", direction, number);
CREATE INDEX payment_attempts_business_status_created_idx
  ON app.payment_attempts ("businessId", status, "createdAt");
CREATE INDEX payment_attempts_document_created_idx
  ON app.payment_attempts ("documentId", "createdAt");
CREATE INDEX payments_business_direction_date_idx
  ON app.payments ("businessId", direction, "paymentDate");
CREATE INDEX payments_contact_date_idx ON app.payments ("contactId", "paymentDate");
CREATE INDEX payment_allocations_document_effective_idx
  ON app.payment_allocations ("documentId", "effectiveDate");
CREATE INDEX allocation_reversals_effective_idx
  ON app.allocation_reversals ("effectiveDate");

CREATE OR REPLACE FUNCTION app.protect_financial_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'financial documents cannot be deleted';
  END IF;

  IF OLD.state = 'POSTED'
    AND NEW.state = 'POSTED'
    AND OLD."reversalEntryId" IS NULL
    AND NEW."reversalEntryId" IS NOT NULL
    AND NEW."reversedAt" IS NOT NULL
    AND NEW."reversalReason" IS NOT NULL
    AND NEW.revision = OLD.revision + 1
    AND NEW."businessId" IS NOT DISTINCT FROM OLD."businessId"
    AND NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW."contactId" IS NOT DISTINCT FROM OLD."contactId"
    AND NEW."sourceOrderId" IS NOT DISTINCT FROM OLD."sourceOrderId"
    AND NEW.number IS NOT DISTINCT FROM OLD.number
    AND NEW."documentDate" IS NOT DISTINCT FROM OLD."documentDate"
    AND NEW."dueDate" IS NOT DISTINCT FROM OLD."dueDate"
    AND NEW."externalReference" IS NOT DISTINCT FROM OLD."externalReference"
    AND NEW."contactNameSnapshot" IS NOT DISTINCT FROM OLD."contactNameSnapshot"
    AND NEW."sourceOrderNumberSnapshot" IS NOT DISTINCT FROM OLD."sourceOrderNumberSnapshot"
    AND NEW."netTotal" IS NOT DISTINCT FROM OLD."netTotal"
    AND NEW."taxTotal" IS NOT DISTINCT FROM OLD."taxTotal"
    AND NEW.total IS NOT DISTINCT FROM OLD.total
    AND NEW."journalEntryId" IS NOT DISTINCT FROM OLD."journalEntryId"
    AND NEW."createdById" IS NOT DISTINCT FROM OLD."createdById"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
  THEN
    RETURN NEW;
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

CREATE FUNCTION app.protect_payment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment history cannot be deleted';
  END IF;

  IF TG_TABLE_NAME = 'payments' AND OLD.status = 'POSTED' AND NEW.status = 'REVERSED'
    AND NEW."businessId" IS NOT DISTINCT FROM OLD."businessId"
    AND NEW."contactId" IS NOT DISTINCT FROM OLD."contactId"
    AND NEW."journalId" IS NOT DISTINCT FROM OLD."journalId"
    AND NEW."paymentAttemptId" IS NOT DISTINCT FROM OLD."paymentAttemptId"
    AND NEW.direction IS NOT DISTINCT FROM OLD.direction
    AND NEW."sourceMode" IS NOT DISTINCT FROM OLD."sourceMode"
    AND NEW.number IS NOT DISTINCT FROM OLD.number
    AND NEW."paymentDate" IS NOT DISTINCT FROM OLD."paymentDate"
    AND NEW.amount IS NOT DISTINCT FROM OLD.amount
    AND NEW."contactNameSnapshot" IS NOT DISTINCT FROM OLD."contactNameSnapshot"
    AND NEW."externalReference" IS NOT DISTINCT FROM OLD."externalReference"
    AND NEW."journalEntryId" IS NOT DISTINCT FROM OLD."journalEntryId"
    AND NEW."createdById" IS NOT DISTINCT FROM OLD."createdById"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
    AND NEW.revision = OLD.revision + 1
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payment history is immutable';
END;
$function$;

CREATE TRIGGER protect_payments
BEFORE UPDATE OR DELETE ON app.payments
FOR EACH ROW EXECUTE FUNCTION app.protect_payment_history();

CREATE FUNCTION app.protect_immutable_payment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'payment history is immutable';
END;
$function$;

CREATE TRIGGER protect_payment_allocations
BEFORE UPDATE OR DELETE ON app.payment_allocations
FOR EACH ROW EXECUTE FUNCTION app.protect_immutable_payment_history();

CREATE TRIGGER protect_allocation_reversals
BEFORE UPDATE OR DELETE ON app.allocation_reversals
FOR EACH ROW EXECUTE FUNCTION app.protect_immutable_payment_history();
