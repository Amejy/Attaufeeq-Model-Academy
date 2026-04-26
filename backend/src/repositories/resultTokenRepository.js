import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query, withTransaction } from '../db/client.js';

const TOKEN_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_TOKEN_LENGTH = 10;
const MAX_USES = 1;

function normalizeTokenLength(value) {
  const length = Number(value || DEFAULT_TOKEN_LENGTH);
  if (!Number.isFinite(length)) return DEFAULT_TOKEN_LENGTH;
  return Math.min(16, Math.max(8, Math.trunc(length)));
}

function normalizeQuantity(value) {
  const qty = Number(value || 0);
  if (!Number.isFinite(qty)) return 0;
  return Math.min(5000, Math.max(1, Math.trunc(qty)));
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokenKey() {
  return crypto.createHash('sha256').update(String(env.jwtSecret)).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

function decryptToken({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function generateTokenString(length) {
  const bytes = crypto.randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % TOKEN_CHARSET.length;
    token += TOKEN_CHARSET[index];
  }
  return token;
}

function mapTokenRow(row, { includeToken = false } = {}) {
  if (!row) return null;
  const token = includeToken
    ? decryptToken({
        ciphertext: row.token_ciphertext,
        iv: row.token_iv,
        authTag: row.token_auth_tag
      })
    : null;
  return {
    id: row.id,
    token,
    tokenPreview: row.token_preview,
    tokenHash: row.token_hash,
    term: row.term || '',
    sessionId: row.session_id || '',
    usedCount: Number(row.used_count || 0),
    maxUses: Number(row.max_uses || MAX_USES),
    createdByUserId: row.created_by_user_id || '',
    assignedStudentId: row.assigned_student_id || '',
    assignedByUserId: row.assigned_by_user_id || '',
    assignedAt: row.assigned_at?.toISOString?.() || row.assigned_at || '',
    usedAt: row.used_at?.toISOString?.() || row.used_at || '',
    usedByStudentId: row.used_by_student_id || '',
    usedForTerm: row.used_for_term || '',
    usedForSessionId: row.used_for_session_id || '',
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at || '',
    lastUsedAt: row.last_used_at?.toISOString?.() || row.last_used_at || ''
  };
}

function computeStatus(token) {
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
  const now = Date.now();
  if (Number.isFinite(expiresAt) && expiresAt <= now) return 'expired';
  if (token.usedCount >= token.maxUses) return 'used';
  if (token.usedCount > 0) return 'used';
  return 'unused';
}

export async function listResultTokens({ status = '', search = '', limit = 200, offset = 0, includeToken = false } = {}) {
  const clauses = [];
  const params = [];
  const trimmedSearch = String(search || '').trim();

  if (trimmedSearch) {
    if (/^[A-Z0-9]{8,12}$/i.test(trimmedSearch)) {
      params.push(hashToken(trimmedSearch.toUpperCase()));
      clauses.push(`token_hash = $${params.length}`);
    } else {
      params.push(`%${trimmedSearch}%`);
      clauses.push(`(
        token_preview ILIKE $${params.length}
        OR COALESCE(term, '') ILIKE $${params.length}
        OR COALESCE(assigned_student_id, '') ILIKE $${params.length}
        OR COALESCE(used_by_student_id, '') ILIKE $${params.length}
      )`);
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.max(1, Math.min(500, Number(limit) || 200)));
  params.push(Math.max(0, Number(offset) || 0));

  const result = await query(
    `SELECT * FROM result_tokens ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const tokens = result.rows.map((row) => mapTokenRow(row, { includeToken }));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const filtered = normalizedStatus
    ? tokens.filter((token) => {
        const computed = computeStatus(token);
        if (normalizedStatus === 'active') return computed !== 'expired';
        if (normalizedStatus === 'used') return computed === 'used';
        if (normalizedStatus === 'partial') return computed === 'used';
        return computed === normalizedStatus;
      })
    : tokens;

  return filtered.map((token) => ({
    ...token,
    status: computeStatus(token),
    remainingUses: Math.max(0, token.maxUses - token.usedCount)
  }));
}

export async function getResultTokenStats() {
  const result = await query('SELECT used_count, max_uses, expires_at FROM result_tokens');
  const now = Date.now();

  const summary = result.rows.reduce(
    (acc, row) => {
      const usedCount = Number(row.used_count || 0);
      const maxUses = Number(row.max_uses || MAX_USES);
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      const expired = Number.isFinite(expiresAt) && expiresAt <= now;
      const used = usedCount >= maxUses;
      acc.total += 1;
      if (used) acc.used += 1;
      if (expired) acc.expired += 1;
      if (!expired && !used) acc.active += 1;
      return acc;
    },
    { total: 0, used: 0, expired: 0, active: 0 }
  );

  return summary;
}

export async function createResultTokens({ quantity, length, term, sessionId, expiresAt, createdByUserId } = {}) {
  const tokenLength = normalizeTokenLength(length);
  const target = normalizeQuantity(quantity);
  const normalizedExpiry = normalizeTimestamp(expiresAt);
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();

  if (!target) return [];

  const tokens = [];
  while (tokens.length < target) {
    const batchSize = Math.min(200, target - tokens.length);
    const batch = Array.from({ length: batchSize }, () => generateTokenString(tokenLength));

    const values = [];
    const params = [];
    batch.forEach((token, index) => {
      const { ciphertext, iv, authTag } = encryptToken(token);
      const hash = hashToken(token);
      const preview = token.slice(-4);
      const id = crypto.randomUUID();
      const baseIndex = index * 10;
      params.push(id, hash, ciphertext, iv, authTag, preview, normalizedTerm, normalizedSessionId, createdByUserId || null, normalizedExpiry);
      values.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, ${MAX_USES}, 0, $${baseIndex + 9}, NOW(), $${baseIndex + 10})`
      );
    });

    const inserted = await query(
      `INSERT INTO result_tokens
        (id, token_hash, token_ciphertext, token_iv, token_auth_tag, token_preview, term, session_id, max_uses, used_count, created_by_user_id, created_at, expires_at)
      VALUES ${values.join(', ')}
      ON CONFLICT (token_hash) DO NOTHING
      RETURNING *`,
      params
    );

    inserted.rows.forEach((row) => {
      tokens.push({
        ...mapTokenRow(row, { includeToken: true }),
        status: computeStatus(mapTokenRow(row)),
        remainingUses: MAX_USES
      });
    });
  }

  return tokens;
}

export async function recordResultTokenAttempt({
  tokenValue = '',
  studentIdentifier = '',
  success = false,
  failureReason = '',
  ipAddress = '',
  userAgent = ''
} = {}) {
  const token = String(tokenValue || '').trim().toUpperCase();
  const hash = token ? hashToken(token) : null;
  const preview = token ? token.slice(-4) : null;

  await query(
    `INSERT INTO result_token_attempts
      (id, token_hash, token_preview, student_identifier, success, failure_reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      crypto.randomUUID(),
      hash,
      preview,
      String(studentIdentifier || '').trim() || null,
      Boolean(success),
      String(failureReason || '').trim() || null,
      String(ipAddress || '').trim() || null,
      String(userAgent || '').trim() || null
    ]
  );
}

export async function consumeResultToken({ tokenValue } = {}) {
  const token = String(tokenValue || '').trim().toUpperCase();
  if (!token) {
    return { error: 'Token is required.' };
  }

  const tokenHash = hashToken(token);

  return withTransaction(async (executor) => {
    const result = await executor.query(
      'SELECT * FROM result_tokens WHERE token_hash = $1 FOR UPDATE',
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      return { error: 'Token not found.' };
    }

    const usedCount = Number(row.used_count || 0);
    const maxUses = Number(row.max_uses || MAX_USES);
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return { error: 'Token expired.' };
    }
    if (usedCount >= maxUses) {
      return { error: 'Token exhausted.' };
    }

    const nextUsed = usedCount + 1;
    const updated = await executor.query(
      'UPDATE result_tokens SET used_count = $1, last_used_at = NOW() WHERE id = $2 RETURNING *',
      [nextUsed, row.id]
    );

    const tokenRow = mapTokenRow(updated.rows[0], { includeToken: true });
    return {
      token: {
        ...tokenRow,
        status: computeStatus(tokenRow),
        remainingUses: Math.max(0, maxUses - nextUsed)
      }
    };
  });
}

export async function consumeResultTokenOnce({ tokenValue, studentId, term, sessionId } = {}) {
  const token = String(tokenValue || '').trim().toUpperCase();
  if (!token) {
    return { error: 'Token is required.' };
  }
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();
  const tokenHash = hashToken(token);

  return withTransaction(async (executor) => {
    const result = await executor.query(
      'SELECT * FROM result_tokens WHERE token_hash = $1 FOR UPDATE',
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      return { error: 'Token not found.' };
    }
    const usedCount = Number(row.used_count || 0);
    const maxUses = Number(row.max_uses || MAX_USES);
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return { error: 'Token expired.' };
    }
    if (usedCount >= maxUses) {
      return { error: 'Token already used.' };
    }
    if (!row.term) {
      return { error: 'Token term is missing.' };
    }
    if (normalizedTerm && String(row.term).trim() !== normalizedTerm) {
      return { error: 'Token does not match the selected term.' };
    }
    if (normalizedSessionId && row.session_id && String(row.session_id).trim() !== normalizedSessionId) {
      return { error: 'Token does not match the active session.' };
    }

    const updated = await executor.query(
      `UPDATE result_tokens
       SET used_count = $1,
           used_at = NOW(),
           used_by_student_id = $2,
           used_for_term = $3,
           used_for_session_id = $4,
           last_used_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [1, studentId || null, normalizedTerm || row.term, normalizedSessionId || row.session_id || null, row.id]
    );

    const tokenRow = mapTokenRow(updated.rows[0], { includeToken: true });
    return {
      token: {
        ...tokenRow,
        status: computeStatus(tokenRow),
        remainingUses: 0
      }
    };
  });
}

export async function getTokenState({ tokenValue } = {}) {
  const token = String(tokenValue || '').trim().toUpperCase();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await query('SELECT * FROM result_tokens WHERE token_hash = $1', [tokenHash]);
  const row = result.rows[0];
  if (!row) return null;

  const tokenRow = mapTokenRow(row, { includeToken: false });
  return {
    ...tokenRow,
    status: computeStatus(tokenRow),
    remainingUses: Math.max(0, tokenRow.maxUses - tokenRow.usedCount)
  };
}

export async function assignResultToken({ tokenId = '', tokenValue = '', studentId = '', assignedByUserId = '' } = {}) {
  const id = String(tokenId || '').trim();
  const token = String(tokenValue || '').trim().toUpperCase();
  const student = String(studentId || '').trim();
  if (!student) {
    return { error: 'Student is required.' };
  }

  let row = null;
  if (id) {
    const result = await query('SELECT * FROM result_tokens WHERE id = $1', [id]);
    row = result.rows[0] || null;
  } else if (token) {
    const result = await query('SELECT * FROM result_tokens WHERE token_hash = $1', [hashToken(token)]);
    row = result.rows[0] || null;
  }

  if (!row) return { error: 'Token not found.' };

  const usedCount = Number(row.used_count || 0);
  const maxUses = Number(row.max_uses || MAX_USES);
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;

  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return { error: 'Token expired.' };
  }
  if (usedCount >= maxUses) {
    return { error: 'Token exhausted.' };
  }

  const updated = await query(
    `UPDATE result_tokens
     SET assigned_student_id = $1, assigned_by_user_id = $2, assigned_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [student, assignedByUserId || null, row.id]
  );

  const tokenRow = mapTokenRow(updated.rows[0], { includeToken: true });
  return {
    token: {
      ...tokenRow,
      status: computeStatus(tokenRow),
      remainingUses: Math.max(0, tokenRow.maxUses - tokenRow.usedCount)
    }
  };
}

export async function getResultTokenAccess({ studentId = '', term = '', sessionId = '' } = {}) {
  const student = String(studentId || '').trim();
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();
  if (!student || !normalizedTerm) return null;

  if (normalizedSessionId) {
    const scoped = await query(
      'SELECT * FROM result_token_access WHERE student_id = $1 AND LOWER(term) = LOWER($2) AND session_id = $3',
      [student, normalizedTerm, normalizedSessionId]
    );
    if (scoped.rows[0]) return scoped.rows[0];
  }

  const fallback = await query(
    'SELECT * FROM result_token_access WHERE student_id = $1 AND LOWER(term) = LOWER($2) ORDER BY activated_at DESC LIMIT 1',
    [student, normalizedTerm]
  );
  if (fallback.rows[0]) return fallback.rows[0];

  const tokenMatch = await query(
    `SELECT id, used_by_student_id, used_for_term, used_for_session_id, term, session_id, used_count, max_uses
     FROM result_tokens
     WHERE used_by_student_id = $1
       AND COALESCE(used_count, 0) >= 1
       AND LOWER(COALESCE(used_for_term, term, '')) = LOWER($2)
       AND ($3 = '' OR COALESCE(used_for_session_id, session_id, '') = $3)
     ORDER BY used_at DESC NULLS LAST
     LIMIT 1`,
    [student, normalizedTerm, normalizedSessionId]
  );
  if (tokenMatch.rows[0]) {
    return tokenMatch.rows[0];
  }

  return null;
}

export async function findUsedTokenForStudentTerm({ studentId = '', term = '', sessionId = '' } = {}) {
  const student = String(studentId || '').trim();
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();
  if (!student || !normalizedTerm) return null;

  const result = await query(
    `SELECT id, used_by_student_id, used_for_term, used_for_session_id, term, session_id, used_at
     FROM result_tokens
     WHERE used_by_student_id = $1
       AND COALESCE(used_count, 0) >= 1
       AND LOWER(COALESCE(used_for_term, term, '')) = LOWER($2)
       AND ($3 = '' OR COALESCE(used_for_session_id, session_id, '') = $3)
     ORDER BY used_at DESC NULLS LAST
     LIMIT 1`,
    [student, normalizedTerm, normalizedSessionId]
  );

  return result.rows[0] || null;
}

export async function createResultTokenAccess({
  tokenId = '',
  studentId = '',
  term = '',
  sessionId = '',
  ipAddress = '',
  userAgent = ''
} = {}) {
  const student = String(studentId || '').trim();
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();
  if (!tokenId || !student || !normalizedTerm || !normalizedSessionId) {
    return { error: 'Access record requires token, student, term, and session.' };
  }

  const result = await query(
    `INSERT INTO result_token_access
      (id, token_id, student_id, term, session_id, activated_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (student_id, term, session_id) DO NOTHING
     RETURNING *`,
    [
      crypto.randomUUID(),
      String(tokenId),
      student,
      normalizedTerm,
      normalizedSessionId,
      String(ipAddress || '').trim() || null,
      String(userAgent || '').trim() || null
    ]
  );

  return { access: result.rows[0] || null };
}
