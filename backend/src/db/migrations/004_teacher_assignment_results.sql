ALTER TABLE results
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS entered_by_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL;

UPDATE results AS result
SET institution = classes.institution
FROM classes
WHERE result.class_id = classes.id
  AND COALESCE(result.institution, '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_assignments_unique_scope
  ON teacher_assignments (teacher_id, class_id, subject_id, term);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_id ON teacher_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON teacher_assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON teacher_assignments (subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_results_unique_scope
  ON results (student_id, class_id, subject_id, term);

CREATE INDEX IF NOT EXISTS idx_results_class_id ON results (class_id);
CREATE INDEX IF NOT EXISTS idx_results_student_id ON results (student_id);
CREATE INDEX IF NOT EXISTS idx_results_subject_id ON results (subject_id);
CREATE INDEX IF NOT EXISTS idx_results_term ON results (term);
CREATE INDEX IF NOT EXISTS idx_results_entered_by_teacher_id ON results (entered_by_teacher_id);
