CREATE TABLE IF NOT EXISTS result_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  token_preview TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 3,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NULL,
  last_used_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS result_tokens_created_at_idx ON result_tokens (created_at DESC);
CREATE INDEX IF NOT EXISTS result_tokens_used_count_idx ON result_tokens (used_count);
CREATE INDEX IF NOT EXISTS result_tokens_expires_at_idx ON result_tokens (expires_at);

CREATE TABLE IF NOT EXISTS result_token_attempts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NULL,
  token_preview TEXT NULL,
  student_identifier TEXT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS result_token_attempts_created_at_idx ON result_token_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS result_token_attempts_success_idx ON result_token_attempts (success);
