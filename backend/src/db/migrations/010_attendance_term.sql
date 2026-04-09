ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'First Term';

CREATE INDEX IF NOT EXISTS idx_attendance_records_term ON attendance_records (term);
