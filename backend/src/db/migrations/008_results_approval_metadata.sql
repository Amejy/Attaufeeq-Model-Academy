ALTER TABLE results
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_results_approved_at ON results (approved_at);
