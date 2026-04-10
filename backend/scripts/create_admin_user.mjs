import { config } from 'dotenv';
import { findUserByEmail, createUser, updateUserPassword } from '../src/repositories/userRepository.js';
import { hashPassword } from '../src/utils/passwords.js';

config();

const adminEmail = String(process.env.ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const adminFullName = String(process.env.ADMIN_FULL_NAME || process.env.BOOTSTRAP_ADMIN_FULL_NAME || 'System Administrator').trim()
  || 'System Administrator';

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

if (!adminEmail) {
  throw new Error('ADMIN_EMAIL (or BOOTSTRAP_ADMIN_EMAIL) is required.');
}

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD (or BOOTSTRAP_ADMIN_PASSWORD) is required.');
}

if (!isStrongPassword(adminPassword)) {
  throw new Error('ADMIN_PASSWORD must be at least 14 characters and include upper, lower, number, and symbol.');
}

const existing = await findUserByEmail(adminEmail);
const passwordHash = await hashPassword(adminPassword);

if (existing) {
  await updateUserPassword(existing.id, { passwordHash, mustChangePassword: true });
  console.log(`Admin password updated for ${existing.email}.`);
} else {
  await createUser({
    fullName: adminFullName,
    email: adminEmail,
    passwordHash,
    role: 'admin',
    mustChangePassword: true
  });
  console.log(`Admin user created for ${adminEmail}.`);
}
