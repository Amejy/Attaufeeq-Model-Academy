ALTER TABLE results
  ADD COLUMN IF NOT EXISTS teacher_cleared_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_results_teacher_cleared_at ON results (teacher_cleared_at);
