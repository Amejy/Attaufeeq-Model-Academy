import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { ensureActiveAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { createResultTokens, getTokenState } from '../src/repositories/resultTokenRepository.js';
import { query } from '../src/db/client.js';
import { buildStudentCode } from '../src/utils/studentCode.js';
import { withAdminStoreLock } from './testUtils.js';

test('result token validates and consumes once for a student', async () => {
  await withAdminStoreLock(async () => {
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    if (!adminStore.academicSessions.some((item) => item.id === session.id)) {
      adminStore.academicSessions.unshift(session);
    }
    const term = 'First Term';

    const classId = `cls-token-${Date.now()}`;
    const subjectId = `sub-token-${Date.now()}`;
    const studentId = `stu-token-${Date.now()}`;

    adminStore.classes.push({ id: classId, name: 'JSS 1', arm: 'A', institution: 'Model Academy' });
    adminStore.subjects.push({ id: subjectId, name: 'Mathematics', institution: 'Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Token Student',
      classId,
      institution: 'Model Academy',
      accountStatus: 'active',
      userId: '',
      portalEmail: 'token.student@attaufiq.local'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-token-${Date.now()}`, studentId, classId, sessionId: session.id }
    ];
    adminStore.resultsAccess = [classId];
    adminStore.results.push({
      id: `res-${Date.now()}`,
      studentId,
      classId,
      subjectId,
      term,
      sessionId: session.id,
      institution: 'Model Academy',
      ca: 20,
      exam: 60,
      total: 80,
      grade: 'A',
      published: true
    });

    const tokens = await createResultTokens({ quantity: 1, term, sessionId: session.id, createdByUserId: null });
    assert.equal(tokens.length, 1);
    const tokenValue = tokens[0].token;
    assert.ok(tokenValue);
    const studentCode = buildStudentCode({ id: studentId, institution: 'Model Academy' });

    const response = await request(app)
      .post('/api/result-tokens/check')
      .send({ token: tokenValue, studentIdentifier: studentCode, term, sessionId: session.id });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.holdStatus, 'ready');

    const tokenState = await getTokenState({ tokenValue });
    assert.equal(tokenState?.status, 'used');

    async function safeDelete(tableName, whereSql, params) {
      const existsResult = await query('SELECT to_regclass($1) as table_name', [tableName]);
      if (!existsResult.rows[0]?.table_name) return;
      await query(`DELETE FROM ${tableName} ${whereSql}`, params);
    }

    await safeDelete('public.result_token_access', 'WHERE token_id = $1', [tokenState.id]);
    await safeDelete('public.result_token_assignments', 'WHERE token_id = $1', [tokenState.id]);
    await safeDelete('public.result_token_attempts', 'WHERE token_hash = $1', [tokenState.tokenHash]);
    await safeDelete('public.result_tokens', 'WHERE id = $1', [tokenState.id]);

    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    adminStore.subjects = adminStore.subjects.filter((item) => item.id !== subjectId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.results = adminStore.results.filter((item) => item.studentId !== studentId);
    adminStore.resultsAccess = adminStore.resultsAccess.filter((id) => id !== classId);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
  });
});
