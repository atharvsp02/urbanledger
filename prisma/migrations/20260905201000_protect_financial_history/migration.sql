CREATE UNIQUE INDEX "journal_entries_business_source_reference_key"
ON app.journal_entries ("businessId", source, "sourceReference")
WHERE "sourceReference" IS NOT NULL;

CREATE FUNCTION app.protect_product_kind_with_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $function$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind AND (
    EXISTS (SELECT 1 FROM app.order_lines WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM app.inventory_movements WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM app.financial_document_lines WHERE "productId" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'product kind cannot change after transaction history exists';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER protect_product_kind_with_history
BEFORE UPDATE OF kind ON app.products
FOR EACH ROW EXECUTE FUNCTION app.protect_product_kind_with_history();
