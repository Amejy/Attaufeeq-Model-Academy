import { config } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../src/utils/passwords.js';

config();

const adminEmail = String(process.env.ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const dbSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

function isStrongPassword(password) {
  const value = String(password || '');
  return (
    value.length >= 14 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to reset the admin password.');
}

if (!adminEmail) {
  throw new Error('ADMIN_EMAIL (or BOOTSTRAP_ADMIN_EMAIL) is required.');
}

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD (or BOOTSTRAP_ADMIN_PASSWORD) is required.');
}

if (!isStrongPassword(adminPassword)) {
  throw new Error('ADMIN_PASSWORD must be at least 14 characters and include upper, lower, number, and symbol.');
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: dbSsl ? { rejectUnauthorized: false } : undefined
});

await client.connect();

const userResult = await client.query(
  'SELECT id, email, role FROM users WHERE lower(email) = $1 LIMIT 1',
  [adminEmail]
);

if (userResult.rowCount === 0) {
  await client.end();
  throw new Error(`No user found for email: ${adminEmail}`);
}

const user = userResult.rows[0];
const passwordHash = await hashPassword(adminPassword);

await client.query(
  'UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2',
  [passwordHash, user.id]
);

await client.end();

console.log(`Password reset for ${user.email} (role: ${user.role}).`);
