import crypto from 'crypto';
import { query } from '../db/client.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function createRefreshSession({ id, userId, token, expiresAt }) {
  const tokenHash = hashToken(token);

  const result = await query(
    `INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, userId, tokenHash, expiresAt]
  );

  return result.rows[0];
}

export async function findRefreshSessionByToken(token) {
  const tokenHash = hashToken(token);

  const result = await query('SELECT * FROM refresh_sessions WHERE token_hash = $1 LIMIT 1', [tokenHash]);
  return result.rows[0] || null;
}

export async function deleteRefreshSessionByToken(token) {
  const tokenHash = hashToken(token);

  await query('DELETE FROM refresh_sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteRefreshSessionsByUserId(userId) {
  if (!userId) return;
  await query('DELETE FROM refresh_sessions WHERE user_id = $1', [userId]);
}

export async function deleteExpiredRefreshSessions() {
  await query('DELETE FROM refresh_sessions WHERE expires_at <= NOW()');
}
