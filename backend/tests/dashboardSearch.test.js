import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader, withAdminStoreLock } from './testUtils.js';

test('admin dashboard search enforces backend filters and pagination', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const classId = `cls-search-${nonce}`;
    const studentOneId = `stu-search-one-${nonce}`;
    const studentTwoId = `stu-search-two-${nonce}`;

    adminStore.classes.push({ id: classId, name: 'SS 1', arm: 'Blue', institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push(
      {
        id: studentOneId,
        fullName: 'Search Receipt One',
        classId,
        institution: 'ATTAUFEEQ Model Academy',
        accountStatus: 'active',
        portalEmail: `search.one.${nonce}@attaufiq.local`,
        userId: ''
      },
      {
        id: studentTwoId,
        fullName: 'Search Receipt Two',
        classId,
        institution: 'ATTAUFEEQ Model Academy',
        accountStatus: 'active',
        portalEmail: `search.two.${nonce}@attaufiq.local`,
        userId: ''
      }
    );
    adminStore.paymentRequests = [
      {
        id: `payreq-one-${nonce}`,
        studentId: studentOneId,
        term: 'First Term',
        sessionId: 'sess-search',
        amountPaid: 15000,
        method: 'Bank transfer',
        status: 'pending',
        createdAt: new Date('2026-01-02T10:00:00.000Z').toISOString()
      },
      {
        id: `payreq-two-${nonce}`,
        studentId: studentTwoId,
        term: 'First Term',
        sessionId: 'sess-search',
        amountPaid: 18000,
        method: 'Bank transfer',
        status: 'approved',
        createdAt: new Date('2026-01-03T10:00:00.000Z').toISOString()
      },
      ...(adminStore.paymentRequests || [])
    ];

    const credentials = buildAdminCredentials();
    const adminUser = await createAdminAccount(credentials);
    const login = await loginAs(credentials);
    assert.equal(login.status, 200);

    const response = await request(app)
      .get(`/api/dashboard/search?entity=receipts&status=pending&page=1&pageSize=1&q=${encodeURIComponent('Search Receipt')}`)
      .set(authHeader(login.body.token));

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.items?.length, 1);
    assert.equal(response.body.items?.[0]?.entity, 'receipts');
    assert.equal(response.body.items?.[0]?.status, 'pending');
    assert.equal(response.body.pagination?.total, 1);
    assert.equal(response.body.pagination?.pageSize, 5);

    adminStore.paymentRequests = (adminStore.paymentRequests || []).filter(
      (item) => item.id !== `payreq-one-${nonce}` && item.id !== `payreq-two-${nonce}`
    );
    adminStore.students = adminStore.students.filter((item) => item.id !== studentOneId && item.id !== studentTwoId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    await cleanupUser(adminUser.id);
  });
});
