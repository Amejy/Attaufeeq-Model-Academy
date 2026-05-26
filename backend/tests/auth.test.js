import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { cleanupUser, buildAdminCredentials, createAdminAccount, loginAs, authHeader } from './testUtils.js';

test('auth login returns token for valid admin credentials', async () => {
  const credentials = buildAdminCredentials();
  const user = await createAdminAccount(credentials);

  const response = await loginAs(credentials);
  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user?.email, credentials.email);

  await cleanupUser(user.id);
});

test('admin password reset reveals temporary password only for manual handover flow', async () => {
  const adminCredentials = buildAdminCredentials();
  const admin = await createAdminAccount(adminCredentials);
  const targetCredentials = buildAdminCredentials();
  const targetUser = await createAdminAccount({
    ...targetCredentials,
    role: 'teacher',
    fullName: 'Reset Target Teacher'
  });

  try {
    const loginResponse = await loginAs(adminCredentials);
    assert.equal(loginResponse.status, 200);

    const response = await request(app)
      .post('/api/admin/users/reset-password')
      .set(authHeader(loginResponse.body.token))
      .send({ userId: targetUser.id });

    assert.equal(response.status, 201);
    assert.equal(response.body.credential?.passwordVisible, true);
    assert.ok(['manual-only', 'disabled', 'skipped'].includes(response.body.credential?.emailDeliveryStatus));
    assert.ok(response.body.credential?.password);
    assert.match(response.body.message, /manual handover/i);
  } finally {
    await cleanupUser(targetUser.id);
    await cleanupUser(admin.id);
  }
});

test('admin backup response is marked as private and not cacheable', async () => {
  const adminCredentials = buildAdminCredentials();
  const admin = await createAdminAccount(adminCredentials);

  try {
    const loginResponse = await loginAs(adminCredentials);
    assert.equal(loginResponse.status, 200);

    const response = await request(app)
      .get('/api/admin/system/backup')
      .set(authHeader(loginResponse.body.token));

    assert.equal(response.status, 200);
    assert.match(String(response.headers['cache-control'] || ''), /private, no-store/i);
    assert.ok(response.body.generatedAt);
    assert.ok(response.body.store);
  } finally {
    await cleanupUser(admin.id);
  }
});
