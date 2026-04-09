import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUser, buildAdminCredentials, createAdminAccount, loginAs } from './testUtils.js';

test('auth login returns token for valid admin credentials', async () => {
  const credentials = buildAdminCredentials();
  const user = await createAdminAccount(credentials);

  const response = await loginAs(credentials);
  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user?.email, credentials.email);

  await cleanupUser(user.id);
});
