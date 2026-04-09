import request from 'supertest';
import app from '../src/app.js';
import { createUser, deleteUserById } from '../src/repositories/userRepository.js';
import { deleteRefreshSessionsByUserId } from '../src/repositories/sessionRepository.js';
import { hashPassword } from '../src/utils/passwords.js';

let adminStoreLock = Promise.resolve();

export async function withAdminStoreLock(work) {
  const previous = adminStoreLock;
  let release;
  adminStoreLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export function buildAdminCredentials() {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `admin.test.${nonce}@attaufiq.local`;
  const password = `StrongPass-${nonce}-!`;
  return { email, password };
}

export async function createAdminAccount({ email, password }) {
  const passwordHash = await hashPassword(password);
  return createUser({
    fullName: 'Automation Admin',
    email,
    passwordHash,
    role: 'admin',
    mustChangePassword: false
  });
}

export async function loginAs({ email, password }) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return response;
}

export async function cleanupUser(userId) {
  if (!userId) return;
  await deleteRefreshSessionsByUserId(userId);
  await deleteUserById(userId);
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
