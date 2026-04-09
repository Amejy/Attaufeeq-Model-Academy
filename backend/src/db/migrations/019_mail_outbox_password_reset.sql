DO $$
BEGIN
  ALTER TABLE mail_outbox
    DROP CONSTRAINT IF EXISTS mail_outbox_kind_check;

  ALTER TABLE mail_outbox
    ADD CONSTRAINT mail_outbox_kind_check
    CHECK (kind IN ('provisioning-credential', 'password-reset-code'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
