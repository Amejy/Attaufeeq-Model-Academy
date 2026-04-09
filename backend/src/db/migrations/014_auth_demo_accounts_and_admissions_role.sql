DO $$
DECLARE
  existing_constraint TEXT;
BEGIN
  SELECT conname
  INTO existing_constraint
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role = ANY%';

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_constraint);
  END IF;

  ALTER TABLE users
    ADD CONSTRAINT chk_users_role
    CHECK (role IN ('admin', 'teacher', 'student', 'parent', 'admissions'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
