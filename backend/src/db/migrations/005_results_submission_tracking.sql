ALTER TABLE results
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_results_submitted_at ON results (submitted_at);
CREATE INDEX IF NOT EXISTS idx_results_submitted_by_teacher_id ON results (submitted_by_teacher_id);
