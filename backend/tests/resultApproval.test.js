import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { ensureActiveAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { createSubjectResult, getFinalResult } from '../src/repositories/subjectResultRepository.js';
import { query } from '../src/db/client.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader } from './testUtils.js';

test('admin can approve grouped subject results into a final result', async () => {
  const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
  const term = 'First Term';
  const studentCode = `STU-${Date.now()}`;
  const classId = `cls-final-${Date.now()}`;

  await createSubjectResult({
    studentCode,
    subject: 'Mathematics',
    score: 78,
    grade: 'A',
    classId,
    term,
    sessionId: session.id,
    teacherId: 'teacher-1'
  });
  await createSubjectResult({
    studentCode,
    subject: 'English',
    score: 65,
    grade: 'B',
    classId,
    term,
    sessionId: session.id,
    teacherId: 'teacher-2'
  });

  const credentials = buildAdminCredentials();
  const user = await createAdminAccount(credentials);
  const login = await loginAs(credentials);
  assert.equal(login.status, 200);
  const token = login.body.token;

  const response = await request(app)
    .post('/api/results/admin/approve-subject-results')
    .set(authHeader(token))
    .send({ studentCode, term, sessionId: session.id });

  assert.equal(response.status, 200);
  assert.equal(response.body.finalResult?.studentCode, studentCode);

  const finalResult = await getFinalResult({ studentCode, term, sessionId: session.id });
  assert.ok(finalResult);

  await query('DELETE FROM subject_results WHERE student_code = $1 AND term = $2 AND session_id = $3', [studentCode, term, session.id]);
  await query('DELETE FROM final_results WHERE student_code = $1 AND term = $2 AND session_id = $3', [studentCode, term, session.id]);
  await cleanupUser(user.id);
});
