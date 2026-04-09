ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS progression_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_classes_progression_order
  ON classes (progression_order);
