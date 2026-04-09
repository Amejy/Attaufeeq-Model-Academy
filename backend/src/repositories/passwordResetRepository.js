import { query } from '../db/client.js';

export async function upsertPasswordResetRequest({ email, userId, codeHash, expiresAt, requestIp = '' }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = await query(
    `INSERT INTO password_reset_requests (email, user_id, code_hash, request_ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
     SET user_id = EXCLUDED.user_id,
         code_hash = EXCLUDED.code_hash,
         request_ip = EXCLUDED.request_ip,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()
     RETURNING *`,
    [normalizedEmail, userId, codeHash, requestIp, expiresAt]
  );

  return result.rows[0] || null;
}

export async function findPasswordResetRequest(email, codeHash) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = await query(
    `SELECT *
     FROM password_reset_requests
     WHERE email = $1
       AND code_hash = $2
       AND expires_at > NOW()
     LIMIT 1`,
    [normalizedEmail, codeHash]
  );

  return result.rows[0] || null;
}

export async function deletePasswordResetRequest(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  await query('DELETE FROM password_reset_requests WHERE email = $1', [normalizedEmail]);
}

export async function deleteExpiredPasswordResetRequests() {
  await query('DELETE FROM password_reset_requests WHERE expires_at <= NOW()');
}
