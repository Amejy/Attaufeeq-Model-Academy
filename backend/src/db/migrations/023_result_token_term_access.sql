ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;
ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS used_by_student_id TEXT;
ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS used_for_term TEXT;
ALTER TABLE result_tokens ADD COLUMN IF NOT EXISTS used_for_session_id TEXT;

ALTER TABLE result_tokens ALTER COLUMN max_uses SET DEFAULT 1;

UPDATE result_tokens SET max_uses = 1 WHERE max_uses IS NULL OR max_uses <> 1;
UPDATE result_tokens SET used_count = LEAST(used_count, 1) WHERE used_count IS NOT NULL;

CREATE TABLE IF NOT EXISTS result_token_access (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  term TEXT NOT NULL,
  session_id TEXT NOT NULL,
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  activated_ip TEXT,
  user_agent TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_result_token_access_unique
  ON result_token_access (student_id, term, session_id);
CREATE INDEX IF NOT EXISTS idx_result_token_access_token
  ON result_token_access (token_id);
