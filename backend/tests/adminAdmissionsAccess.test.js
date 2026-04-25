import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import {
  authHeader,
  buildAdminCredentials,
  cleanupUser,
  createAdminAccount,
  loginAs,
  withAdminStoreLock
} from './testUtils.js';

test('admin admissions period rejects multiple active program windows', async () => {
  await withAdminStoreLock(async () => {
    const credentials = buildAdminCredentials();
    const user = await createAdminAccount(credentials);

    try {
      const login = await loginAs(credentials);
      assert.equal(login.status, 200, JSON.stringify(login.body));

      const originalPeriod = structuredClone(adminStore.admissionPeriod);
      const response = await request(app)
        .put('/api/admin/admissions/period')
        .set(authHeader(login.body.token))
        .send({
          enabled: true,
          programs: {
            modern: { enabled: true, startDate: '2026-01-01', endDate: '2026-06-01' },
            madrasa: { enabled: true, startDate: '2026-02-01', endDate: '2026-05-01' },
            memorization: { enabled: false, startDate: '', endDate: '' }
          }
        });

      assert.equal(response.status, 400, JSON.stringify(response.body));
      assert.match(
        response.body.message || '',
        /Only one admission window can stay active at a time/i
      );
      assert.deepEqual(adminStore.admissionPeriod, originalPeriod);
    } finally {
      await cleanupUser(user.id);
    }
  });
});
