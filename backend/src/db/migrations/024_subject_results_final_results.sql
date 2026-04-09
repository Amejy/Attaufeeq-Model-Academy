CREATE TABLE IF NOT EXISTS subject_results (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  score NUMERIC NOT NULL,
  grade TEXT NOT NULL,
  class_id TEXT NOT NULL,
  term TEXT NOT NULL,
  session_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_subject_results_student_term
  ON subject_results (student_code, term, session_id);
CREATE INDEX IF NOT EXISTS idx_subject_results_status
  ON subject_results (status);

CREATE TABLE IF NOT EXISTS final_results (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL,
  term TEXT NOT NULL,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_score NUMERIC NOT NULL DEFAULT 0,
  average_score NUMERIC NOT NULL DEFAULT 0,
  grade_summary TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by_user_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_final_results_unique
  ON final_results (student_code, term, session_id);
