DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_students_user_id_required'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT chk_students_user_id_required
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_students_portal_email_required'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT chk_students_portal_email_required
      CHECK (NULLIF(BTRIM(portal_email), '') IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_students_account_status'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT chk_students_account_status
      CHECK (account_status IN ('pending', 'provisioned', 'active', 'inactive', 'graduated')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'idx_students_user_id_unique'
  ) THEN
    IF EXISTS (
      SELECT user_id
      FROM students
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping idx_students_user_id_unique because duplicate student.user_id values already exist.';
    ELSE
      CREATE UNIQUE INDEX idx_students_user_id_unique
        ON students (user_id)
        WHERE user_id IS NOT NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_account_status
  ON students (account_status);
