ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_email TEXT;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS student_email TEXT,
  ADD COLUMN IF NOT EXISTS guardian_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guardian_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_email TEXT,
  ADD COLUMN IF NOT EXISTS parent_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_portal_email TEXT,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_name_arm_institution
  ON classes (lower(name), lower(arm), lower(institution));

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_name_institution
  ON subjects (lower(name), lower(institution));

CREATE INDEX IF NOT EXISTS idx_students_class_id ON students (class_id);
CREATE INDEX IF NOT EXISTS idx_students_institution ON students (institution);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students (user_id);
CREATE INDEX IF NOT EXISTS idx_students_parent_user_id ON students (parent_user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers (user_id);
