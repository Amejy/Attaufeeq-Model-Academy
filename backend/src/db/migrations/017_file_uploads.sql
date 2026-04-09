CREATE TABLE IF NOT EXISTS file_uploads (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  mime TEXT NOT NULL,
  extension TEXT NOT NULL,
  size BIGINT NOT NULL CHECK (size >= 0),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_visibility_created_at
  ON file_uploads (visibility, created_at DESC);
