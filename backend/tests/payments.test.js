import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { ensureActiveAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { query } from '../src/db/client.js';
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

test('parent can submit receipt request and admissions can confirm it into a payment', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const classId = `cls-payreq-${nonce}`;
    const studentId = `stu-payreq-${nonce}`;
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    if (!adminStore.academicSessions.some((item) => item.id === session.id)) {
      adminStore.academicSessions.unshift(session);
    }

    const parentEmail = `parent.${nonce}@attaufiq.local`;
    const parentPassword = `ParentPass-${nonce}-!`;
    const parentUser = await createAdminAccount({
      email: parentEmail,
      password: parentPassword,
      role: 'parent',
      fullName: 'Receipt Parent'
    });

    adminStore.classes.push({ id: classId, name: 'JSS 1', arm: 'A', institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Receipt Student',
      classId,
      institution: 'ATTAUFEEQ Model Academy',
      accountStatus: 'active',
      guardianName: 'Receipt Parent',
      guardianEmail: parentEmail,
      parentPortalEmail: parentEmail
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-payreq-${nonce}`, studentId, classId, sessionId: session.id }
    ];

    const parentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: parentEmail, password: parentPassword });
    assert.equal(parentLogin.status, 200);

    const parentRequest = await request(app)
      .post('/api/fees/parent/payment-requests')
      .set(authHeader(parentLogin.body.token))
      .send({
        childId: studentId,
        term: 'First Term',
        sessionId: session.id,
        amountPaid: 18000,
        method: 'Bank transfer',
        receiptName: 'receipt.png',
        receiptDataUrl: 'data:image/png;base64,ZmFrZS1yZWNlaXB0'
      });
    assert.equal(parentRequest.status, 201, JSON.stringify(parentRequest.body));
    assert.equal(parentRequest.body.paymentRequest?.status, 'pending');

    const credentials = buildAdminCredentials();
    const admissionsUser = await createAdminAccount({
      ...credentials,
      role: 'admissions',
      fullName: 'Admissions Reviewer'
    });
    const admissionsLogin = await loginAs(credentials);
    assert.equal(admissionsLogin.status, 200);

    const reviewResponse = await request(app)
      .put(`/api/fees/admin/payment-requests/${parentRequest.body.paymentRequest.id}`)
      .set(authHeader(admissionsLogin.body.token))
      .send({ status: 'approved' });
    assert.equal(reviewResponse.status, 200, JSON.stringify(reviewResponse.body));
    assert.equal(reviewResponse.body.paymentRequest?.status, 'approved');
    assert.equal(reviewResponse.body.payment?.studentId, studentId);

    adminStore.paymentRequests = (adminStore.paymentRequests || []).filter((item) => item.studentId !== studentId);
    adminStore.payments = adminStore.payments.filter((item) => item.studentId !== studentId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    await cleanupUser(parentUser.id);
    await cleanupUser(admissionsUser.id);
  });
});

test('approved receipt can release a result token to parent and student fee dashboards', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const classId = `cls-release-${nonce}`;
    const studentId = `stu-release-${nonce}`;
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    if (!adminStore.academicSessions.some((item) => item.id === session.id)) {
      adminStore.academicSessions.unshift(session);
    }

    const parentEmail = `parent.release.${nonce}@attaufiq.local`;
    const parentPassword = `ParentRelease-${nonce}-!`;
    const studentEmail = `student.release.${nonce}@attaufiq.local`;
    const studentPassword = `StudentRelease-${nonce}-!`;

    const parentUser = await createAdminAccount({
      email: parentEmail,
      password: parentPassword,
      role: 'parent',
      fullName: 'Release Parent'
    });
    const studentUser = await createAdminAccount({
      email: studentEmail,
      password: studentPassword,
      role: 'student',
      fullName: 'Release Student User'
    });

    adminStore.classes.push({ id: classId, name: 'JSS 3', arm: 'A', institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Release Student',
      classId,
      institution: 'ATTAUFEEQ Model Academy',
      accountStatus: 'active',
      guardianName: 'Release Parent',
      guardianEmail: parentEmail,
      parentPortalEmail: parentEmail,
      portalEmail: studentEmail,
      userId: studentUser.id
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-release-${nonce}`, studentId, classId, sessionId: session.id }
    ];

    const parentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: parentEmail, password: parentPassword });
    assert.equal(parentLogin.status, 200);

    const studentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: studentEmail, password: studentPassword });
    assert.equal(studentLogin.status, 200);

    const receiptResponse = await request(app)
      .post('/api/fees/parent/payment-requests')
      .set(authHeader(parentLogin.body.token))
      .send({
        childId: studentId,
        term: 'First Term',
        sessionId: session.id,
        amountPaid: 25000,
        method: 'Bank transfer',
        receiptName: 'release-proof.png',
        receiptDataUrl: 'data:image/png;base64,cmVsZWFzZS10b2tlbg=='
      });
    assert.equal(receiptResponse.status, 201, JSON.stringify(receiptResponse.body));

    const admissionsCredentials = buildAdminCredentials();
    const admissionsUser = await createAdminAccount({
      ...admissionsCredentials,
      role: 'admissions',
      fullName: 'Token Release Desk'
    });
    const admissionsLogin = await loginAs(admissionsCredentials);
    assert.equal(admissionsLogin.status, 200);

    const reviewResponse = await request(app)
      .put(`/api/fees/admin/payment-requests/${receiptResponse.body.paymentRequest.id}`)
      .set(authHeader(admissionsLogin.body.token))
      .send({ status: 'approved' });
    assert.equal(reviewResponse.status, 200, JSON.stringify(reviewResponse.body));

    const releaseResponse = await request(app)
      .post(`/api/fees/admin/payment-requests/${receiptResponse.body.paymentRequest.id}/release-token`)
      .set(authHeader(admissionsLogin.body.token))
      .send({});
    assert.equal(releaseResponse.status, 200, JSON.stringify(releaseResponse.body));
    assert.ok(releaseResponse.body.releasedToken?.token);

    const parentFees = await request(app)
      .get(`/api/fees/parent?term=First%20Term&sessionId=${encodeURIComponent(session.id)}&childId=${encodeURIComponent(studentId)}`)
      .set(authHeader(parentLogin.body.token));
    assert.equal(parentFees.status, 200, JSON.stringify(parentFees.body));
    assert.equal(parentFees.body.releasedToken?.token, releaseResponse.body.releasedToken.token);

    const studentFees = await request(app)
      .get(`/api/fees/student?term=First%20Term&sessionId=${encodeURIComponent(session.id)}`)
      .set(authHeader(studentLogin.body.token));
    assert.equal(studentFees.status, 200, JSON.stringify(studentFees.body));
    assert.equal(studentFees.body.releasedToken?.token, releaseResponse.body.releasedToken.token);

    async function safeDelete(tableName, whereSql, params) {
      const existsResult = await query('SELECT to_regclass($1) as table_name', [tableName]);
      if (!existsResult.rows[0]?.table_name) return;
      await query(`DELETE FROM ${tableName} ${whereSql}`, params);
    }

    if (releaseResponse.body.releasedToken?.id) {
      await safeDelete('public.result_token_access', 'WHERE token_id = $1', [releaseResponse.body.releasedToken.id]);
      await safeDelete('public.result_token_assignments', 'WHERE token_id = $1', [releaseResponse.body.releasedToken.id]);
      await safeDelete('public.result_tokens', 'WHERE id = $1', [releaseResponse.body.releasedToken.id]);
    }

    adminStore.paymentRequests = (adminStore.paymentRequests || []).filter((item) => item.studentId !== studentId);
    adminStore.payments = adminStore.payments.filter((item) => item.studentId !== studentId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    await cleanupUser(parentUser.id);
    await cleanupUser(studentUser.id);
    await cleanupUser(admissionsUser.id);
  });
});
