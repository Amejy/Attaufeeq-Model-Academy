import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { createAcademicSession, findAcademicSessionById } from '../src/repositories/academicSessionRepository.js';
import { createClass, deleteClassById } from '../src/repositories/classRepository.js';
import { upsertFinalResult } from '../src/repositories/subjectResultRepository.js';
import { findStudentById, createStudent, deleteStudentById } from '../src/repositories/studentRepository.js';
import { listStudentEnrollments, upsertStudentEnrollment } from '../src/repositories/studentEnrollmentRepository.js';
import { query } from '../src/db/client.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader, withAdminStoreLock } from './testUtils.js';

test('admin can roll over third-term promotions into the next class and session', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const institution = 'ATTAUFEEQ Model Academy';
    const sourceSession = await createAcademicSession({
      id: `ses-src-${nonce}`,
      sessionName: `2025/2026 Promo ${nonce}`,
      isActive: true
    });
    const targetSessionName = `2026/2027 Promo ${nonce}`;
    const currentClassId = `cls-promo-${nonce}-1`;
    const nextClassId = `cls-promo-${nonce}-2`;
    const arm = `A${String(nonce).slice(-4)}`;
    const studentId = `stu-promo-${nonce}`;
    const studentCode = `PROMO-${nonce}`;
    const studentEmail = `student.promo.${nonce}@attaufiq.local`;
    const studentPassword = `StudentPass-${nonce}-!`;
    const batchCountBefore = (adminStore.promotionBatches || []).length;

    adminStore.classes.push(
      { id: currentClassId, name: 'JSS 1', arm, institution },
      { id: nextClassId, name: 'JSS 2', arm, institution }
    );

    await createClass({ id: currentClassId, name: 'JSS 1', arm, institution });
    await createClass({ id: nextClassId, name: 'JSS 2', arm, institution });

    const studentUser = await createAdminAccount({
      email: studentEmail,
      password: studentPassword,
      role: 'student',
      fullName: 'Promotion Student'
    });

    await createStudent({
      id: studentId,
      fullName: 'Promotion Student',
      classId: currentClassId,
      level: 'JSS 1',
      institution,
      userId: studentUser.id,
      portalEmail: studentEmail,
      studentEmail,
      accountStatus: 'active'
    });

    await upsertStudentEnrollment({
      id: `enr-promo-src-${nonce}`,
      studentId,
      classId: currentClassId,
      sessionId: sourceSession.id
    });

    await upsertFinalResult({
      studentCode,
      term: 'Third Term',
      sessionId: sourceSession.id,
      classId: currentClassId,
      subjects: [
        { subject: 'Mathematics', score: 78, grade: 'A', teacherId: 'teacher-promo-1' },
        { subject: 'English', score: 72, grade: 'A', teacherId: 'teacher-promo-2' }
      ],
      totalScore: 150,
      averageScore: 75,
      gradeSummary: 'A',
      approvedByUserId: studentUser.id
    });

    const credentials = buildAdminCredentials();
    const adminUser = await createAdminAccount(credentials);

    try {
      const login = await loginAs(credentials);
      assert.equal(login.status, 200, JSON.stringify(login.body));

      const response = await request(app)
        .post('/api/admin/academic-sessions/rollover')
        .set(authHeader(login.body.token))
        .send({
          institution,
          term: 'Third Term',
          fromSessionId: sourceSession.id,
          toSessionName: targetSessionName,
          activateNewSession: true
        });

      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.promotedCount, 1);
      assert.equal(response.body.repeatedCount, 0);
      assert.equal(response.body.graduatedCount, 0);
      assert.equal(response.body.skippedCount, 0);
      assert.equal(response.body.progressionMode, 'session-rollover');
      assert.equal(response.body.promoted?.[0]?.studentId, studentId);
      assert.equal(response.body.promoted?.[0]?.fromClassId, currentClassId);
      assert.equal(response.body.promoted?.[0]?.toClassId, nextClassId);

      const targetSession = response.body.toSession;
      assert.ok(targetSession?.id);
      assert.equal(targetSession.sessionName, targetSessionName);

      const storedTargetSession = await findAcademicSessionById(targetSession.id);
      assert.equal(storedTargetSession?.isActive, true);

      const promotedStudent = await findStudentById(studentId);
      assert.equal(promotedStudent?.classId, nextClassId);
      assert.equal(promotedStudent?.level, `JSS 2 ${arm}`);

      const targetEnrollments = await listStudentEnrollments({ studentId, sessionId: targetSession.id });
      assert.equal(targetEnrollments.length, 1);
      assert.equal(targetEnrollments[0].classId, nextClassId);
      assert.equal(targetEnrollments[0].promotedFromClass, currentClassId);

      const batchCountAfter = (adminStore.promotionBatches || []).length;
      assert.equal(batchCountAfter, batchCountBefore + 1);
    } finally {
      await query('DELETE FROM final_results WHERE student_code = $1 AND session_id = $2', [studentCode, sourceSession.id]);
      await query('DELETE FROM student_enrollments WHERE student_id = $1', [studentId]);
      await deleteStudentById(studentId);
      await deleteClassById(nextClassId);
      await deleteClassById(currentClassId);
      await query('DELETE FROM academic_sessions WHERE id = $1 OR session_name = $2', [sourceSession.id, targetSessionName]);
      await query('DELETE FROM academic_sessions WHERE id = $1', [`ses-src-${nonce}`]);

      adminStore.classes = adminStore.classes.filter((item) => item.id !== currentClassId && item.id !== nextClassId);
      adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
      adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
      const currentBatches = adminStore.promotionBatches || [];
      adminStore.promotionBatches = currentBatches.slice(Math.max(0, currentBatches.length - batchCountBefore));

      await cleanupUser(studentUser.id);
      await cleanupUser(adminUser.id);
    }
  });
});
