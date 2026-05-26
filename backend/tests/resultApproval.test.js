import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { createAcademicSession, ensureActiveAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { createClass, deleteClassById } from '../src/repositories/classRepository.js';
import { createSubjectResult, getFinalResult } from '../src/repositories/subjectResultRepository.js';
import { upsertResult } from '../src/repositories/resultRepository.js';
import { createStudent } from '../src/repositories/studentRepository.js';
import { createSubject, deleteSubjectById } from '../src/repositories/subjectRepository.js';
import { createTeacher, deleteTeacherById } from '../src/repositories/teacherRepository.js';
import { query } from '../src/db/client.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader, withAdminStoreLock } from './testUtils.js';

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

test('admin publish is blocked until every assigned subject result is submitted', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    const term = 'First Term';
    const classId = `cls-ready-${nonce}`;
    const className = `JSS 2 ${nonce}`;
    const classArm = `A${String(nonce).slice(-2)}`;
    const studentId = `stu-ready-${nonce}`;
    const studentEmail = `student.ready.${nonce}@attaufiq.local`;
    const studentPassword = `StudentPass-${nonce}-!`;
    const mathId = `sub-math-${nonce}`;
    const engId = `sub-eng-${nonce}`;
    const mathName = `Mathematics ${nonce}`;
    const engName = `English ${nonce}`;
    const teacherOne = `t-ready-1-${nonce}`;
    const teacherTwo = `t-ready-2-${nonce}`;
    const studentUser = await createAdminAccount({
      email: studentEmail,
      password: studentPassword,
      role: 'student',
      fullName: 'Readiness Student'
    });

    if (!adminStore.academicSessions.some((item) => item.id === session.id)) {
      adminStore.academicSessions.unshift(session);
    }
    adminStore.classes.push({ id: classId, name: className, arm: classArm, institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Readiness Student',
      classId,
      institution: 'ATTAUFEEQ Model Academy',
      userId: studentUser.id,
      portalEmail: studentEmail,
      accountStatus: 'active'
    });
    adminStore.subjects.push(
      { id: mathId, name: mathName, institution: 'ATTAUFEEQ Model Academy' },
      { id: engId, name: engName, institution: 'ATTAUFEEQ Model Academy' }
    );
    await createClass({ id: classId, name: className, arm: classArm, institution: 'ATTAUFEEQ Model Academy' });
    await createSubject({ id: mathId, name: mathName, institution: 'ATTAUFEEQ Model Academy' });
    await createSubject({ id: engId, name: engName, institution: 'ATTAUFEEQ Model Academy' });
    await createStudent({
      id: studentId,
      fullName: 'Readiness Student',
      classId,
      level: 'JSS 2',
      institution: 'ATTAUFEEQ Model Academy',
      userId: studentUser.id,
      portalEmail: studentEmail,
      accountStatus: 'active'
    });
    adminStore.teachers.push(
      { id: teacherOne, fullName: 'Teacher One', institution: 'ATTAUFEEQ Model Academy', email: `teacher1.${nonce}@attaufiq.local` },
      { id: teacherTwo, fullName: 'Teacher Two', institution: 'ATTAUFEEQ Model Academy', email: `teacher2.${nonce}@attaufiq.local` }
    );
    await createTeacher({ id: teacherOne, fullName: 'Teacher One', institution: 'ATTAUFEEQ Model Academy', email: `teacher1.${nonce}@attaufiq.local` });
    await createTeacher({ id: teacherTwo, fullName: 'Teacher Two', institution: 'ATTAUFEEQ Model Academy', email: `teacher2.${nonce}@attaufiq.local` });
    adminStore.teacherAssignments.push(
      { id: `asg-${nonce}-1`, teacherId: teacherOne, classId, subjectId: mathId, term, assignmentRole: 'Subject Teacher' },
      { id: `asg-${nonce}-2`, teacherId: teacherTwo, classId, subjectId: engId, term, assignmentRole: 'Subject Teacher' }
    );
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-ready-${nonce}`, studentId, classId, sessionId: session.id }
    ];

    await upsertResult({
      id: `res-${nonce}`,
      studentId,
      classId,
      sessionId: session.id,
      subjectId: mathId,
      term,
      ca: 18,
      exam: 52,
      total: 70,
      grade: 'A',
      remark: 'Excellent',
      institution: 'ATTAUFEEQ Model Academy',
      enteredByTeacherId: teacherOne,
      submittedAt: new Date().toISOString(),
      submittedByTeacherId: teacherOne
    });

    const credentials = buildAdminCredentials();
    const user = await createAdminAccount(credentials);
    const login = await loginAs(credentials);
    assert.equal(login.status, 200);

    const response = await request(app)
      .post('/api/results/admin/publish')
      .set(authHeader(login.body.token))
      .send({ term, classId, institution: 'ATTAUFEEQ Model Academy', sessionId: session.id });

    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal(response.body.readiness?.ready, false);
    assert.equal(response.body.readiness?.missingCount, 1);
    assert.equal(response.body.blockedStudents?.[0]?.subjectName, engName);

    await query('DELETE FROM results WHERE student_id = $1 AND session_id = $2', [studentId, session.id]);
    await query('DELETE FROM students WHERE id = $1', [studentId]);
    await deleteSubjectById(mathId);
    await deleteSubjectById(engId);
    await deleteClassById(classId);
    await deleteTeacherById(teacherOne);
    await deleteTeacherById(teacherTwo);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => !item.id.startsWith(`asg-${nonce}`));
    adminStore.teachers = adminStore.teachers.filter((item) => item.id !== teacherOne && item.id !== teacherTwo);
    adminStore.subjects = adminStore.subjects.filter((item) => item.id !== mathId && item.id !== engId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    await cleanupUser(studentUser.id);
    await cleanupUser(user.id);
  });
});

test('admin report card preview includes manual overrides and report settings', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const session = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    const term = 'First Term';
    const classId = `cls-report-${nonce}`;
    const studentId = `stu-report-${nonce}`;
    const previousSettings = structuredClone(adminStore.reportSettings || {});

    adminStore.classes.push({ id: classId, name: 'JSS 1', arm: 'A', institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Preview Student',
      classId,
      level: 'JSS 1',
      institution: 'ATTAUFEEQ Model Academy',
      accountStatus: 'active'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-report-${nonce}`, studentId, classId, sessionId: session.id }
    ];
    adminStore.reportSettings = {
      headName: 'Mrs. Stable Head',
      headTitle: 'Head Teacher',
      signatureImage: '/api/uploads/public/head-signature-test',
      parentAcknowledgementText: 'Parent has reviewed the official report.',
      footerNote: 'Official report preview'
    };
    adminStore.reportRemarks.unshift({
      id: `rrm-report-${nonce}`,
      studentId,
      classId,
      sessionId: session.id,
      term,
      strengths: '',
      weaknesses: '',
      classTeacherRemark: 'Steady effort.',
      headTeacherRemark: 'Approved for promotion.',
      override: {
        attendanceSummary: {
          totalSchoolDays: 80,
          daysPresent: 76,
          daysAbsent: 4,
          lateComing: 2,
          attendanceRate: 95,
          attendanceRemark: 'Manual attendance summary'
        },
        behaviorRatings: {
          discipline: 'A',
          responsibility: 'B',
          cooperation: 'A',
          respect: 'A',
          initiative: 'B'
        }
      },
      updatedAt: new Date().toISOString()
    });

    const credentials = buildAdminCredentials();
    const user = await createAdminAccount(credentials);
    const login = await loginAs(credentials);
    assert.equal(login.status, 200);

    const response = await request(app)
      .get(`/api/results/admin/report-card/${studentId}?term=${encodeURIComponent(term)}&sessionId=${encodeURIComponent(session.id)}`)
      .set(authHeader(login.body.token));

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.reportCard?.attendanceSummary?.totalSchoolDays, 80);
    assert.equal(response.body.reportCard?.attendanceSummary?.daysPresent, 76);
    assert.equal(response.body.reportCard?.behaviorRatings?.discipline, 'A');
    assert.equal(response.body.reportCard?.reportSettings?.headName, 'Mrs. Stable Head');
    assert.equal(response.body.reportCard?.reportSettings?.footerNote, 'Official report preview');

    adminStore.reportSettings = previousSettings;
    adminStore.reportRemarks = (adminStore.reportRemarks || []).filter((item) => item.id !== `rrm-report-${nonce}`);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    await cleanupUser(user.id);
  });
});

test('report card attendance summary stays scoped to the requested academic session', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const currentSession = await ensureActiveAcademicSession({ sessionName: '2025/2026' });
    const nextSession = await createAcademicSession({
      id: `ses-att-${nonce}`,
      sessionName: '2026/2027',
      isActive: false
    });
    const term = 'First Term';
    const classId = `cls-att-${nonce}`;
    const studentId = `stu-att-${nonce}`;

    adminStore.classes.push({ id: classId, name: 'JSS 2', arm: 'B', institution: 'ATTAUFEEQ Model Academy' });
    adminStore.students.push({
      id: studentId,
      fullName: 'Scoped Attendance Student',
      classId,
      level: 'JSS 2',
      institution: 'ATTAUFEEQ Model Academy',
      accountStatus: 'active'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-att-${nonce}-1`, studentId, classId, sessionId: currentSession.id },
      { id: `enr-att-${nonce}-2`, studentId, classId, sessionId: nextSession.id }
    ];
    adminStore.attendanceRecords = [
      {
        id: `att-${nonce}-old-1`,
        studentId,
        classId,
        teacherId: 'teacher-old',
        subjectId: 'class-attendance',
        sessionId: currentSession.id,
        term,
        date: '2025-09-10',
        status: 'present',
        present: true,
        late: false,
        behavior: { discipline: 'A', responsibility: 'A', cooperation: 'A', respect: 'A', initiative: 'A' },
        remark: 'present'
      },
      {
        id: `att-${nonce}-old-2`,
        studentId,
        classId,
        teacherId: 'teacher-old',
        subjectId: 'class-attendance',
        sessionId: currentSession.id,
        term,
        date: '2025-09-11',
        status: 'absent',
        present: false,
        late: false,
        behavior: { discipline: 'C', responsibility: 'C', cooperation: 'C', respect: 'C', initiative: 'C' },
        remark: 'absent'
      },
      {
        id: `att-${nonce}-new-1`,
        studentId,
        classId,
        teacherId: 'teacher-new',
        subjectId: 'class-attendance',
        sessionId: nextSession.id,
        term,
        date: '2026-09-10',
        status: 'present',
        present: true,
        late: false,
        behavior: { discipline: 'A', responsibility: 'A', cooperation: 'A', respect: 'A', initiative: 'A' },
        remark: 'present'
      },
      {
        id: `att-${nonce}-new-2`,
        studentId,
        classId,
        teacherId: 'teacher-new',
        subjectId: 'class-attendance',
        sessionId: nextSession.id,
        term,
        date: '2026-09-11',
        status: 'present',
        present: true,
        late: false,
        behavior: { discipline: 'A', responsibility: 'A', cooperation: 'A', respect: 'A', initiative: 'A' },
        remark: 'excellent'
      }
    ];

    const credentials = buildAdminCredentials();
    const user = await createAdminAccount(credentials);
    const login = await loginAs(credentials);
    assert.equal(login.status, 200);

    const response = await request(app)
      .get(`/api/results/admin/report-card/${studentId}?term=${encodeURIComponent(term)}&sessionId=${encodeURIComponent(nextSession.id)}`)
      .set(authHeader(login.body.token));

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.reportCard?.attendanceSummary?.totalSchoolDays, 2);
    assert.equal(response.body.reportCard?.attendanceSummary?.daysPresent, 2);
    assert.equal(response.body.reportCard?.attendanceSummary?.daysAbsent, 0);
    assert.equal(response.body.reportCard?.attendance, '100%');
    assert.equal(response.body.reportCard?.behaviorRatings?.discipline, 'A');

    adminStore.attendanceRecords = (adminStore.attendanceRecords || []).filter((item) => item.studentId !== studentId);
    adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
    adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    await cleanupUser(user.id);
  });
});
