CREATE TABLE IF NOT EXISTS academic_sessions (
  id TEXT PRIMARY KEY,
  session_name TEXT NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO academic_sessions (id, session_name, is_active)
SELECT 'ses-2025', '2025/2026', TRUE
WHERE NOT EXISTS (SELECT 1 FROM academic_sessions);

UPDATE academic_sessions
SET is_active = TRUE
WHERE id = (
  SELECT id
  FROM academic_sessions
  WHERE is_active = FALSE OR is_active IS NULL
  ORDER BY created_at DESC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM academic_sessions WHERE is_active = TRUE);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  promoted_from_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_student_session
  ON student_enrollments (student_id, session_id);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_session_id ON student_enrollments (session_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class_id ON student_enrollments (class_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student_id ON student_enrollments (student_id);

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL;

UPDATE results
SET session_id = (
  SELECT id
  FROM academic_sessions
  WHERE is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE session_id IS NULL
  AND EXISTS (SELECT 1 FROM academic_sessions WHERE is_active = TRUE);

UPDATE results
SET session_id = (
  SELECT id
  FROM academic_sessions
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE session_id IS NULL
  AND EXISTS (SELECT 1 FROM academic_sessions);

INSERT INTO student_enrollments (id, student_id, class_id, session_id, promoted_from_class)
SELECT
  'enr-' || students.id,
  students.id,
  students.class_id,
  COALESCE(
    (SELECT id FROM academic_sessions WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM academic_sessions ORDER BY created_at DESC LIMIT 1)
  ),
  NULL
FROM students
WHERE students.class_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM student_enrollments
    WHERE student_enrollments.student_id = students.id
      AND student_enrollments.session_id = COALESCE(
        (SELECT id FROM academic_sessions WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1),
        (SELECT id FROM academic_sessions ORDER BY created_at DESC LIMIT 1)
      )
  );

DROP INDEX IF EXISTS idx_results_unique_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_results_unique_scope
  ON results (student_id, class_id, subject_id, term, session_id);

CREATE INDEX IF NOT EXISTS idx_results_session_id ON results (session_id);
