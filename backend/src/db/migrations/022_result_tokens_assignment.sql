ALTER TABLE result_tokens
  ADD COLUMN IF NOT EXISTS assigned_student_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS result_tokens_assigned_student_idx ON result_tokens (assigned_student_id);
