ALTER TABLE app.provisioning_operations
  ADD COLUMN "contactId" UUID,
  ADD CONSTRAINT "provisioning_operations_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES app.contacts(id) ON DELETE RESTRICT;

CREATE INDEX provisioning_operations_contact_idx
  ON app.provisioning_operations ("contactId");
