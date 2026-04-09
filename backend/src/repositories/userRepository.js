import crypto from 'node:crypto';
import { query } from '../db/client.js';

function getExecutor(executor) {
  if (executor?.query) return executor;
  return { query };
}

function mapDbUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at
  };
}

export async function findUserByEmail(email, options = {}) {
  if (!email) return null;
  const normalizedEmail = String(email).trim().toLowerCase();

  const executor = getExecutor(options.executor);
  const result = await executor.query('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [normalizedEmail]);
  return mapDbUser(result.rows[0]);
}

export async function findUserById(id, options = {}) {
  if (!id) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return mapDbUser(result.rows[0]);
}

export async function listUsersByRole(role) {
  if (!role) return [];

  const result = await query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', [role]);
  return result.rows.map(mapDbUser);
}

export async function findFirstUserByRole(role, options = {}) {
  if (!role) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    'SELECT * FROM users WHERE role = $1 ORDER BY created_at ASC LIMIT 1',
    [role]
  );
  return mapDbUser(result.rows[0]);
}

export async function countUsers(options = {}) {
  const executor = getExecutor(options.executor);
  const result = await executor.query('SELECT COUNT(*)::int AS count FROM users');
  return Number(result.rows[0]?.count || 0);
}

export async function listUsersByEmails(emails = [], options = {}) {
  const normalizedEmails = [...new Set(emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
  if (!normalizedEmails.length) return [];

  const executor = getExecutor(options.executor);
  const result = await executor.query('SELECT * FROM users WHERE lower(email) = ANY($1::text[])', [normalizedEmails]);
  return result.rows.map(mapDbUser);
}

export async function findUsersByIds(ids = [], options = {}) {
  const normalizedIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalizedIds.length) return [];

  const executor = getExecutor(options.executor);
  const result = await executor.query('SELECT * FROM users WHERE id = ANY($1::text[])', [normalizedIds]);
  return result.rows.map(mapDbUser);
}

export async function createUser({ fullName, email, passwordHash, role, mustChangePassword = false }, options = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const id = `u-${role}-${crypto.randomUUID()}`;

  const executor = getExecutor(options.executor);
  await executor.query(
    'INSERT INTO users (id, full_name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, fullName, normalizedEmail, passwordHash, role, Boolean(mustChangePassword)]
  );
  return {
    id,
    fullName,
    email: normalizedEmail,
    passwordHash,
    role,
    mustChangePassword: Boolean(mustChangePassword),
    createdAt: new Date().toISOString()
  };
}

export async function updateUserPassword(id, { passwordHash, mustChangePassword = false }, options = {}) {
  if (!id || !passwordHash) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE users
     SET password_hash = $2,
         must_change_password = $3
     WHERE id = $1
     RETURNING *`,
    [id, passwordHash, Boolean(mustChangePassword)]
  );
  return mapDbUser(result.rows[0]);
}

export async function updateUserProfile(id, { fullName, email }, options = {}) {
  if (!id) return null;
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE users
     SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email)
     WHERE id = $1
     RETURNING *`,
    [id, fullName || null, normalizedEmail || null]
  );
  return mapDbUser(result.rows[0]);
}

export async function updateUserAvatar(id, avatarUrl, options = {}) {
  if (!id) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE users
     SET avatar_url = $2
     WHERE id = $1
     RETURNING *`,
    [id, avatarUrl || null]
  );
  return mapDbUser(result.rows[0]);
}

export async function deleteUserById(id, options = {}) {
  if (!id) return false;

  const executor = getExecutor(options.executor);
  const result = await executor.query('DELETE FROM users WHERE id = $1', [id]);
  return result.rowCount > 0;
}
