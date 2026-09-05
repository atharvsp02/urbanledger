ALTER TABLE app.businesses
  ADD CONSTRAINT businesses_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT businesses_fiscal_month CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12),
  ADD CONSTRAINT businesses_fiscal_day CHECK ("fiscalYearStartDay" BETWEEN 1 AND 31);

ALTER TABLE app.application_users
  ADD CONSTRAINT application_users_login_length CHECK (char_length("loginId") BETWEEN 6 AND 12),
  ADD CONSTRAINT application_users_normalized_login CHECK ("normalizedLoginId" = lower(btrim("loginId"))),
  ADD CONSTRAINT application_users_normalized_email CHECK ("normalizedEmail" = lower(btrim("normalizedEmail"))),
  ADD CONSTRAINT application_users_disabled_state CHECK (
    (status = 'DISABLED' AND "disabledAt" IS NOT NULL)
    OR (status <> 'DISABLED' AND "disabledAt" IS NULL)
  );

ALTER TABLE app.staff_grants
  ADD CONSTRAINT staff_grants_staff_role CHECK (role IN ('ADMIN', 'ACCOUNTANT')),
  ADD CONSTRAINT staff_grants_valid_window CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom");

ALTER TABLE app.portal_access
  ADD CONSTRAINT portal_access_revocation_state CHECK (
    (status = 'REVOKED' AND "revokedAt" IS NOT NULL)
    OR (status = 'ACTIVE' AND "revokedAt" IS NULL)
  );

CREATE UNIQUE INDEX provisioning_active_login_unique
ON app.provisioning_operations ("normalizedLoginId")
WHERE state <> 'FAILED';

CREATE UNIQUE INDEX provisioning_active_email_unique
ON app.provisioning_operations ("normalizedEmail")
WHERE state <> 'FAILED';

ALTER TABLE app.contacts
  ADD CONSTRAINT contacts_revision_positive CHECK (revision > 0);

ALTER TABLE app.products
  ADD CONSTRAINT products_nonnegative_prices CHECK ("salesPrice" >= 0 AND "purchaseCost" >= 0),
  ADD CONSTRAINT products_revision_positive CHECK (revision > 0);

ALTER TABLE app.ledger_accounts
  ADD CONSTRAINT ledger_accounts_revision_positive CHECK (revision > 0),
  ADD CONSTRAINT ledger_accounts_subtype_compatible CHECK (
    (subtype IN ('CASH', 'BANK', 'RECEIVABLE', 'INPUT_TAX') AND type = 'ASSET')
    OR (subtype IN ('PAYABLE', 'OUTPUT_TAX') AND type = 'LIABILITY')
    OR subtype = 'GENERAL'
  );

ALTER TABLE app.journals
  ADD CONSTRAINT journals_revision_positive CHECK (revision > 0);

ALTER TABLE app.taxes
  ADD CONSTRAINT taxes_rate_range CHECK (rate >= 0 AND rate <= 100),
  ADD CONSTRAINT taxes_revision_positive CHECK (revision > 0);

ALTER TABLE app.analytic_accounts
  ADD CONSTRAINT analytic_accounts_revision_positive CHECK (revision > 0);

ALTER TABLE app.budgets
  ADD CONSTRAINT budgets_date_order CHECK ("endsOn" >= "startsOn"),
  ADD CONSTRAINT budgets_revision_positive CHECK (revision > 0);

ALTER TABLE app.budget_lines
  ADD CONSTRAINT budget_lines_nonnegative_amount CHECK ("plannedAmount" >= 0);

ALTER TABLE app.file_assets
  ADD CONSTRAINT file_assets_dimensions_positive CHECK (
    "byteSize" > 0 AND width > 0 AND height > 0
  );

ALTER TABLE app.journal_entries
  ADD CONSTRAINT journal_entries_posted_state CHECK (
    (state = 'POSTED' AND "postedAt" IS NOT NULL)
    OR (state = 'DRAFT' AND "postedAt" IS NULL)
  ),
  ADD CONSTRAINT journal_entries_reversal_source CHECK (
    (source = 'REVERSAL' AND "reversalOfEntryId" IS NOT NULL)
    OR (source <> 'REVERSAL' AND "reversalOfEntryId" IS NULL)
  );

ALTER TABLE app.journal_items
  ADD CONSTRAINT journal_items_single_side CHECK (
    (debit > 0 AND credit = 0)
    OR (credit > 0 AND debit = 0)
  );

ALTER TABLE app.document_sequences
  ADD CONSTRAINT document_sequences_next_positive CHECK ("nextNumber" > 0);

CREATE FUNCTION app.assert_journal_entry_balanced(entry_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
DECLARE
  entry_state app."EntryState";
  item_count integer;
  total_debit numeric(20, 2);
  total_credit numeric(20, 2);
BEGIN
  SELECT state INTO entry_state
  FROM app.journal_entries
  WHERE id = entry_uuid;

  IF entry_state <> 'POSTED' OR entry_state IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  INTO item_count, total_debit, total_credit
  FROM app.journal_items
  WHERE "entryId" = entry_uuid;

  IF item_count < 2 OR total_debit <= 0 OR total_debit <> total_credit THEN
    RAISE EXCEPTION 'posted journal entry must contain at least two balanced non-zero items';
  END IF;
END;
$function$;

CREATE FUNCTION app.check_entry_balance_from_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_journal_entry_balanced(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE FUNCTION app.check_entry_balance_from_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_journal_entry_balanced(COALESCE(NEW."entryId", OLD."entryId"));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE CONSTRAINT TRIGGER journal_entries_balanced
AFTER INSERT OR UPDATE OF state ON app.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_entry_balance_from_entry();

CREATE CONSTRAINT TRIGGER journal_items_balanced
AFTER INSERT OR UPDATE OR DELETE ON app.journal_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_entry_balance_from_item();

CREATE FUNCTION app.protect_posted_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF OLD.state = 'POSTED' THEN
    RAISE EXCEPTION 'posted journal entries are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE FUNCTION app.protect_posted_journal_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.journal_entries
    WHERE id = OLD."entryId" AND state = 'POSTED'
  ) THEN
    RAISE EXCEPTION 'posted journal items are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER protect_posted_journal_entries
BEFORE UPDATE OR DELETE ON app.journal_entries
FOR EACH ROW EXECUTE FUNCTION app.protect_posted_journal_entry();

CREATE TRIGGER protect_posted_journal_items
BEFORE UPDATE OR DELETE ON app.journal_items
FOR EACH ROW EXECUTE FUNCTION app.protect_posted_journal_item();

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'urbanledger_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA app TO urbanledger_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO urbanledger_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO urbanledger_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON app.audit_events FROM urbanledger_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO urbanledger_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO urbanledger_app';
  END IF;
END
$grants$;
