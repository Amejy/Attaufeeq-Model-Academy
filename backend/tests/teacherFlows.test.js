import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { createAcademicSession } from '../src/repositories/academicSessionRepository.js';
import { createClass, deleteClassById } from '../src/repositories/classRepository.js';
import { createStudent, deleteStudentById } from '../src/repositories/studentRepository.js';
import { createSubject, deleteSubjectById } from '../src/repositories/subjectRepository.js';
import { createTeacher, deleteTeacherById } from '../src/repositories/teacherRepository.js';
import { createTeacherAssignment, deleteTeacherAssignmentById } from '../src/repositories/teacherAssignmentRepository.js';
import { upsertStudentEnrollment } from '../src/repositories/studentEnrollmentRepository.js';
import { listResults } from '../src/repositories/resultRepository.js';
import { query } from '../src/db/client.js';
import { buildAdminCredentials, createAdminAccount, loginAs, cleanupUser, authHeader, withAdminStoreLock } from './testUtils.js';

test('teacher can submit saved result rows and admin overview sees them as ready for review', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now();
    const institution = 'ATTAUFEEQ Model Academy';
    const term = 'First Term';
    const session = await createAcademicSession({
      id: `ses-teacher-submit-${nonce}`,
      sessionName: `Teacher Submit ${nonce}`,
      isActive: true
    });
    const classId = `cls-teacher-submit-${nonce}`;
    const subjectId = `sub-teacher-submit-${nonce}`;
    const teacherId = `t-teacher-submit-${nonce}`;
    const studentId = `stu-teacher-submit-${nonce}`;
    const assignmentId = `asg-teacher-submit-${nonce}`;
    const arm = `A${String(nonce).slice(-4)}`;
    const teacherEmail = `teacher.submit.${nonce}@attaufiq.local`;
    const studentEmail = `student.submit.${nonce}@attaufiq.local`;
    const teacherUser = await createAdminAccount({
      email: teacherEmail,
      password: `TeacherPass-${nonce}-!`,
      role: 'teacher',
      fullName: 'Result Submit Teacher'
    });
    const studentUser = await createAdminAccount({
      email: studentEmail,
      password: `StudentPass-${nonce}-!`,
      role: 'student',
      fullName: 'Result Submit Student'
    });
    const adminCredentials = buildAdminCredentials();
    const adminUser = await createAdminAccount(adminCredentials);

    adminStore.classes.push({ id: classId, name: 'JSS 1', arm, institution });
    adminStore.subjects.push({ id: subjectId, name: `Mathematics ${nonce}`, institution });
    adminStore.teachers.push({
      id: teacherId,
      fullName: 'Result Submit Teacher',
      email: teacherEmail,
      portalEmail: teacherEmail,
      institution,
      userId: teacherUser.id
    });
    adminStore.teacherAssignments.push({
      id: assignmentId,
      teacherId,
      classId,
      subjectId,
      term,
      assignmentRole: 'Subject Teacher'
    });
    adminStore.students.push({
      id: studentId,
      fullName: 'Result Submit Student',
      classId,
      level: 'JSS 1',
      institution,
      userId: studentUser.id,
      portalEmail: studentEmail,
      studentEmail,
      accountStatus: 'active'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-teacher-submit-${nonce}`, studentId, classId, sessionId: session.id }
    ];

    await createClass({ id: classId, name: 'JSS 1', arm, institution });
    await createSubject({ id: subjectId, name: `Mathematics ${nonce}`, institution });
    await createTeacher({
      id: teacherId,
      fullName: 'Result Submit Teacher',
      email: teacherEmail,
      portalEmail: teacherEmail,
      institution,
      userId: teacherUser.id
    });
    await createTeacherAssignment({
      id: assignmentId,
      teacherId,
      classId,
      subjectId,
      term,
      assignmentRole: 'Subject Teacher'
    });
    await createStudent({
      id: studentId,
      fullName: 'Result Submit Student',
      classId,
      level: 'JSS 1',
      institution,
      userId: studentUser.id,
      portalEmail: studentEmail,
      studentEmail,
      accountStatus: 'active'
    });
    await upsertStudentEnrollment({
      id: `enr-teacher-submit-${nonce}`,
      studentId,
      classId,
      sessionId: session.id
    });

    try {
      const teacherLogin = await loginAs({ email: teacherEmail, password: `TeacherPass-${nonce}-!` });
      assert.equal(teacherLogin.status, 200, JSON.stringify(teacherLogin.body));

      const saveResponse = await request(app)
        .post('/api/results/teacher/scores')
        .set(authHeader(teacherLogin.body.token))
        .send({
          classId,
          subjectId,
          term,
          sessionId: session.id,
          rows: [
            {
              studentId,
              test1: 18,
              test2: 17,
              exam: 52,
              caNote: '',
              examNote: ''
            }
          ]
        });

      assert.equal(saveResponse.status, 200, JSON.stringify(saveResponse.body));
      assert.equal(saveResponse.body.savedCount, 1);

      const submitResponse = await request(app)
        .post('/api/results/teacher/submit')
        .set(authHeader(teacherLogin.body.token))
        .send({ classId, subjectId, term, sessionId: session.id });

      assert.equal(submitResponse.status, 200, JSON.stringify(submitResponse.body));
      assert.equal(submitResponse.body.submittedCount, 1);
      assert.ok(submitResponse.body.submittedAt);

      const storedRows = await listResults({ classId, subjectId, term, sessionId: session.id, institution });
      assert.equal(storedRows.length, 1);
      assert.equal(storedRows[0].submittedByTeacherId, teacherId);
      assert.ok(storedRows[0].submittedAt);

      const teacherRecords = await request(app)
        .get(`/api/results/teacher/records?sessionId=${encodeURIComponent(session.id)}`)
        .set(authHeader(teacherLogin.body.token));
      assert.equal(teacherRecords.status, 200, JSON.stringify(teacherRecords.body));
      assert.equal(teacherRecords.body.results.length, 1);
      assert.equal(teacherRecords.body.results[0].submittedByTeacherId, teacherId);

      const adminLogin = await loginAs(adminCredentials);
      assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));
      const adminOverview = await request(app)
        .get(`/api/results/admin/overview?term=${encodeURIComponent(term)}&institution=${encodeURIComponent(institution)}&classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(session.id)}`)
        .set(authHeader(adminLogin.body.token));

      assert.equal(adminOverview.status, 200, JSON.stringify(adminOverview.body));
      assert.equal(adminOverview.body.results.length, 1);
      assert.equal(adminOverview.body.results[0].studentId, studentId);
      assert.equal(adminOverview.body.results[0].teacherName, 'Result Submit Teacher');
      assert.ok(adminOverview.body.results[0].submittedAt);
      assert.equal(adminOverview.body.readiness?.ready, true);
      assert.equal(adminOverview.body.readiness?.missingCount, 0);
    } finally {
      await query('DELETE FROM results WHERE student_id = $1 AND session_id = $2', [studentId, session.id]);
      await query('DELETE FROM student_enrollments WHERE student_id = $1 AND session_id = $2', [studentId, session.id]);
      await deleteStudentById(studentId);
      await deleteTeacherAssignmentById(assignmentId);
      await deleteTeacherById(teacherId);
      await deleteSubjectById(subjectId);
      await deleteClassById(classId);
      await query('DELETE FROM academic_sessions WHERE id = $1', [session.id]);

      adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
      adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => !(item.studentId === studentId && item.sessionId === session.id));
      adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => item.id !== assignmentId);
      adminStore.teachers = adminStore.teachers.filter((item) => item.id !== teacherId);
      adminStore.subjects = adminStore.subjects.filter((item) => item.id !== subjectId);
      adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
      adminStore.results = adminStore.results.filter((item) => !(item.studentId === studentId && item.sessionId === session.id));

      await cleanupUser(studentUser.id);
      await cleanupUser(teacherUser.id);
      await cleanupUser(adminUser.id);
    }
  });
});

test('lead teacher promotion decisions and class remarks are visible to admin review flows', async () => {
  await withAdminStoreLock(async () => {
    const nonce = Date.now() + 1;
    const institution = 'ATTAUFEEQ Model Academy';
    const term = 'Third Term';
    const session = await createAcademicSession({
      id: `ses-teacher-review-${nonce}`,
      sessionName: `Teacher Review ${nonce}`,
      isActive: true
    });
    const classId = `cls-teacher-review-${nonce}`;
    const nextClassId = `cls-teacher-review-next-${nonce}`;
    const subjectId = `sub-teacher-review-${nonce}`;
    const teacherId = `t-teacher-review-${nonce}`;
    const studentId = `stu-teacher-review-${nonce}`;
    const leadAssignmentId = `asg-teacher-review-${nonce}`;
    const arm = `A${String(nonce).slice(-4)}`;
    const teacherEmail = `teacher.review.${nonce}@attaufiq.local`;
    const studentEmail = `student.review.${nonce}@attaufiq.local`;
    const teacherUser = await createAdminAccount({
      email: teacherEmail,
      password: `TeacherPass-${nonce}-!`,
      role: 'teacher',
      fullName: 'Lead Review Teacher'
    });
    const studentUser = await createAdminAccount({
      email: studentEmail,
      password: `StudentPass-${nonce}-!`,
      role: 'student',
      fullName: 'Review Student'
    });
    const adminCredentials = buildAdminCredentials();
    const adminUser = await createAdminAccount(adminCredentials);

    adminStore.classes.push(
      { id: classId, name: 'JSS 1', arm, institution },
      { id: nextClassId, name: 'JSS 2', arm, institution }
    );
    adminStore.subjects.push({ id: subjectId, name: `English ${nonce}`, institution });
    adminStore.teachers.push({
      id: teacherId,
      fullName: 'Lead Review Teacher',
      email: teacherEmail,
      portalEmail: teacherEmail,
      institution,
      userId: teacherUser.id
    });
    adminStore.teacherAssignments.push({
      id: leadAssignmentId,
      teacherId,
      classId,
      subjectId,
      term,
      assignmentRole: 'Lead Teacher'
    });
    adminStore.students.push({
      id: studentId,
      fullName: 'Review Student',
      classId,
      level: 'JSS 1',
      institution,
      userId: studentUser.id,
      portalEmail: studentEmail,
      studentEmail,
      accountStatus: 'active'
    });
    adminStore.studentEnrollments = [
      ...(adminStore.studentEnrollments || []),
      { id: `enr-teacher-review-${nonce}`, studentId, classId, sessionId: session.id }
    ];

    await createClass({ id: classId, name: 'JSS 1', arm, institution });
    await createClass({ id: nextClassId, name: 'JSS 2', arm, institution });
    await createSubject({ id: subjectId, name: `English ${nonce}`, institution });
    await createTeacher({
      id: teacherId,
      fullName: 'Lead Review Teacher',
      email: teacherEmail,
      portalEmail: teacherEmail,
      institution,
      userId: teacherUser.id
    });
    await createTeacherAssignment({
      id: leadAssignmentId,
      teacherId,
      classId,
      subjectId,
      term,
      assignmentRole: 'Lead Teacher'
    });
    await createStudent({
      id: studentId,
      fullName: 'Review Student',
      classId,
      level: 'JSS 1',
      institution,
      userId: studentUser.id,
      portalEmail: studentEmail,
      studentEmail,
      accountStatus: 'active'
    });
    await upsertStudentEnrollment({
      id: `enr-teacher-review-${nonce}`,
      studentId,
      classId,
      sessionId: session.id
    });

    try {
      const teacherLogin = await loginAs({ email: teacherEmail, password: `TeacherPass-${nonce}-!` });
      assert.equal(teacherLogin.status, 200, JSON.stringify(teacherLogin.body));

      const remarksSave = await request(app)
        .post('/api/results/teacher/remarks')
        .set(authHeader(teacherLogin.body.token))
        .send({
          classId,
          term,
          sessionId: session.id,
          rows: [
            {
              studentId,
              strengths: 'Mathematics, Reading',
              weaknesses: 'Punctuality',
              classTeacherRemark: 'Repeat recommended due to weak consistency and incomplete mastery.'
            }
          ]
        });

      assert.equal(remarksSave.status, 200, JSON.stringify(remarksSave.body));
      assert.equal(remarksSave.body.savedCount, 1);

      const recommendationSave = await request(app)
        .post('/api/results/teacher/promotion-recommendations')
        .set(authHeader(teacherLogin.body.token))
        .send({
          classId,
          term,
          sessionId: session.id,
          decisions: [
            { studentId, action: 'repeat' }
          ]
        });

      assert.equal(recommendationSave.status, 201, JSON.stringify(recommendationSave.body));
      assert.equal(recommendationSave.body.recommendation?.decisions?.[0]?.action, 'repeat');

      const teacherRecommendation = await request(app)
        .get(`/api/results/teacher/promotion-recommendations?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}&sessionId=${encodeURIComponent(session.id)}`)
        .set(authHeader(teacherLogin.body.token));

      assert.equal(teacherRecommendation.status, 200, JSON.stringify(teacherRecommendation.body));
      assert.equal(teacherRecommendation.body.recommendation?.teacherId, teacherId);
      assert.equal(teacherRecommendation.body.recommendation?.decisions?.[0]?.studentId, studentId);
      assert.equal(teacherRecommendation.body.recommendation?.decisions?.[0]?.action, 'repeat');

      const adminLogin = await loginAs(adminCredentials);
      assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

      const adminRemarks = await request(app)
        .get(`/api/results/admin/remarks?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}&sessionId=${encodeURIComponent(session.id)}`)
        .set(authHeader(adminLogin.body.token));

      assert.equal(adminRemarks.status, 200, JSON.stringify(adminRemarks.body));
      assert.equal(adminRemarks.body.remarks.length, 1);
      assert.equal(adminRemarks.body.remarks[0].studentId, studentId);
      assert.equal(adminRemarks.body.remarks[0].classTeacherRemark, 'Repeat recommended due to weak consistency and incomplete mastery.');
      assert.equal(adminRemarks.body.remarks[0].strengths, 'Mathematics, Reading');
      assert.equal(adminRemarks.body.remarks[0].weaknesses, 'Punctuality');

      const adminPreview = await request(app)
        .get(`/api/admin/promotions/preview?sessionId=${encodeURIComponent(session.id)}&institution=${encodeURIComponent(institution)}&term=${encodeURIComponent(term)}&classId=${encodeURIComponent(classId)}`)
        .set(authHeader(adminLogin.body.token));

      assert.equal(adminPreview.status, 200, JSON.stringify(adminPreview.body));
      assert.equal(adminPreview.body.eligible.length, 1);
      assert.equal(adminPreview.body.eligible[0].studentId, studentId);
      assert.equal(adminPreview.body.eligible[0].recommendation?.action, 'repeat');
      assert.equal(adminPreview.body.eligible[0].recommendation?.teacherName, 'Lead Review Teacher');
    } finally {
      await query('DELETE FROM student_enrollments WHERE student_id = $1 AND session_id = $2', [studentId, session.id]);
      await deleteStudentById(studentId);
      await deleteTeacherAssignmentById(leadAssignmentId);
      await deleteTeacherById(teacherId);
      await deleteSubjectById(subjectId);
      await deleteClassById(nextClassId);
      await deleteClassById(classId);
      await query('DELETE FROM academic_sessions WHERE id = $1', [session.id]);

      adminStore.students = adminStore.students.filter((item) => item.id !== studentId);
      adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => !(item.studentId === studentId && item.sessionId === session.id));
      adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => item.id !== leadAssignmentId);
      adminStore.teachers = adminStore.teachers.filter((item) => item.id !== teacherId);
      adminStore.subjects = adminStore.subjects.filter((item) => item.id !== subjectId);
      adminStore.classes = adminStore.classes.filter((item) => item.id !== classId && item.id !== nextClassId);
      adminStore.reportRemarks = (adminStore.reportRemarks || []).filter((item) => !(item.studentId === studentId && item.classId === classId && item.sessionId === session.id && item.term === term));
      adminStore.promotionRecommendations = (adminStore.promotionRecommendations || []).filter((item) => !(item.classId === classId && item.sessionId === session.id && item.term === term));

      await cleanupUser(studentUser.id);
      await cleanupUser(teacherUser.id);
      await cleanupUser(adminUser.id);
    }
  });
});
