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

test('admin admissions period allows multiple active program windows', async () => {
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

      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.admissionPeriod?.programs?.modern?.enabled, true);
      assert.equal(response.body.admissionPeriod?.programs?.madrasa?.enabled, true);
      assert.equal(response.body.admissionPeriod?.programs?.memorization?.enabled, false);
      assert.notDeepEqual(adminStore.admissionPeriod, originalPeriod);
    } finally {
      await cleanupUser(user.id);
    }
  });
});
