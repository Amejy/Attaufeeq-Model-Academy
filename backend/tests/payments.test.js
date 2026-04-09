import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { ensureActiveAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader, withAdminStoreLock } from './testUtils.js';

test('admin can create fee plan and record payment', async () => {
  await withAdminStoreLock(async () => {
    const classId = `cls-fee-${Date.now()}`;
    const studentId = `stu-fee-${Date.now()}`;
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    if (!adminStore.academicSessions.some((item) => item.id === session.id)) {
      adminStore.academicSessions.unshift(session);
    }
    adminStore.classes.push({ id: classId, name: 'JSS 2', arm: 'B', institution: 'Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Fee Student',
      classId,
      institution: 'Model Academy',
      accountStatus: 'active'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-${Date.now()}`, studentId, classId, sessionId: session.id }
    ];

    const credentials = buildAdminCredentials();
    const user = await createAdminAccount(credentials);
    const login = await loginAs(credentials);
    assert.equal(login.status, 200);
    const token = login.body.token;

    const planResponse = await request(app)
      .post('/api/fees/admin/plans')
      .set(authHeader(token))
      .send({ classId, term: 'First Term', amount: 25000, sessionId: session.id });
    assert.equal(planResponse.status, 201, JSON.stringify(planResponse.body));

    const paymentResponse = await request(app)
      .post('/api/fees/admin/payments')
      .set(authHeader(token))
      .send({ studentId, term: 'First Term', amountPaid: 25000, method: 'Bank Transfer', sessionId: session.id });
    assert.equal(paymentResponse.status, 201, JSON.stringify(paymentResponse.body));

    adminStore.payments = adminStore.payments.filter((item) => item.studentId !== studentId);
    adminStore.feePlans = adminStore.feePlans.filter((item) => item.classId !== classId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    await cleanupUser(user.id);
  });
});
