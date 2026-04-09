CREATE TABLE IF NOT EXISTS bulk_student_uploads (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT,
  created_by_role TEXT,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  approved_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  report_rows JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bulk_student_uploads_created_at
  ON bulk_student_uploads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_student_uploads_user
  ON bulk_student_uploads (created_by_user_id);
