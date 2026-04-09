import { Router } from 'express';
import { adminStore } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { countFullyAdmittedStudents, filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { buildUserScope, findChildForParent, findChildrenForParent, findClassLead, findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';

const dashboardRouter = Router();
const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0] || null;
  return active?.id || '';
}

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

function resolveLatestTerm(values = []) {
  return values.reduce((latest, value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return latest;
    if (!latest) return normalized;
    return TERM_ORDER.indexOf(normalized) > TERM_ORDER.indexOf(latest) ? normalized : latest;
  }, '');
}

function isActiveUpcomingItem(item) {
  const teacherId = String(item?.teacherId || '').trim();
  const classId = String(item?.classId || '').trim();
  if (!teacherId || !classId) return false;

  const teacherExists = adminStore.teachers.some((teacher) => teacher.id === teacherId);
  if (!teacherExists) return false;

  return adminStore.teacherAssignments.some(
    (assignment) => assignment.teacherId === teacherId && assignment.classId === classId
  );
}

dashboardRouter.get('/me', requireAuth, (req, res) => {
  const scope = buildUserScope(req.user);
  return res.json({
    user: {
      ...req.user,
      scope
    },
    scope,
    profile: scope.profile || null,
    message: 'Authenticated user profile.'
  });
});

dashboardRouter.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  const activeStudents = filterCountableActiveStudents(adminStore.students);
  const modernEnrolled = filterCountableActiveStudents(activeStudents, 'ATTAUFEEQ Model Academy').length;
  const madrasaEnrolled = filterCountableActiveStudents(activeStudents, 'Madrastul ATTAUFEEQ').length;
  const memorizationEnrolled = filterCountableActiveStudents(activeStudents, 'Quran Memorization Academy').length;
  const modernAdmitted = countFullyAdmittedStudents(adminStore.students, 'ATTAUFEEQ Model Academy');
  const madrasaAdmitted = countFullyAdmittedStudents(adminStore.students, 'Madrastul ATTAUFEEQ');
  const memorizationAdmitted = countFullyAdmittedStudents(adminStore.students, 'Quran Memorization Academy');

  return res.json({
    dashboard: 'admin',
    metrics: {
      modernEnrolled,
      madrasaEnrolled,
      memorizationEnrolled,
      modernAdmitted,
      madrasaAdmitted,
      memorizationAdmitted,
      totalStudents: activeStudents.length
    }
  });
});

dashboardRouter.get('/admissions', requireAuth, requireRole('admissions'), (_req, res) => {
  return res.json({
    dashboard: 'admissions',
    metrics: {
      modernPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'ATTAUFEEQ Model Academy'
      ).length,
      madrasaPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'Madrastul ATTAUFEEQ'
      ).length,
      memorizationPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'Quran Memorization Academy'
      ).length,
      modernAdmitted: countFullyAdmittedStudents(adminStore.students, 'ATTAUFEEQ Model Academy'),
      madrasaAdmitted: countFullyAdmittedStudents(adminStore.students, 'Madrastul ATTAUFEEQ'),
      memorizationAdmitted: countFullyAdmittedStudents(adminStore.students, 'Quran Memorization Academy'),
      totalApprovedAdmissions: countFullyAdmittedStudents(adminStore.students)
    }
  });
});

dashboardRouter.get('/teacher', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const assignments = teacher
    ? adminStore.teacherAssignments.filter((item) => item.teacherId === teacher.id)
    : [];
  const institution = teacher?.institution || '';

  const classNames = [...new Set(assignments
    .map((assignment) => adminStore.classes.find((item) => item.id === assignment.classId))
    .filter(Boolean)
    .map((classItem) => `${classItem.name} ${classItem.arm}`))];

  const subjectNames = [...new Set(assignments
    .map((assignment) => adminStore.subjects.find((item) => item.id === assignment.subjectId))
    .filter(Boolean)
    .map((subject) => subject.name))];

  const classLoads = [...new Set(assignments.map((assignment) => assignment.classId))]
    .map((classId) => {
      const classItem = adminStore.classes.find((item) => item.id === classId);
      const studentCount = filterCountableActiveStudents(adminStore.students).filter((student) => student.classId === classId).length;
      const lead = findClassLead(classId);

      return {
        classId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : classId,
        studentCount,
        isLead: lead?.id === teacher?.id
      };
    })
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel));

  return res.json({
    dashboard: 'teacher',
    institution,
    assignedClasses: classNames,
    assignedSubjects: subjectNames,
    classLoads,
    totalStudents: classLoads.reduce((sum, item) => sum + item.studentCount, 0),
    pendingTasks:
      institution === 'ATTAUFEEQ Model Academy'
        ? ['Upload CA scores', 'Take attendance']
        : ['Track attendance', 'Review timetable']
  });
});

dashboardRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  const institution = student?.institution || '';
  const classLead = findClassLead(student?.classId || '');
  const allAttendance = student
    ? adminStore.attendanceRecords.filter((record) => record.studentId === student.id)
    : [];
  const attendanceTerm = resolveLatestTerm(allAttendance.map((record) => record.term));
  const attendance = attendanceTerm
    ? allAttendance.filter((record) => String(record.term || '').trim() === attendanceTerm)
    : allAttendance;
  const present = attendance.filter((record) => record.present).length;
  const attendanceRate = attendance.length ? `${Number(((present / attendance.length) * 100).toFixed(1))}%` : 'N/A';
  const upcomingItems = (adminStore.upcomingItems || [])
    .filter((item) => item.classId && item.classId === student?.classId)
    .filter((item) => isActiveUpcomingItem(item))
    .sort((a, b) => {
      const aDate = a.dueDate || a.createdAt;
      const bDate = b.dueDate || b.createdAt;
      return new Date(aDate) - new Date(bDate);
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      details: item.details || '',
      dueDate: item.dueDate || '',
      teacherName: item.teacherName || ''
    }));
  return res.json({
    dashboard: 'student',
    student,
    institution,
    classLead,
    attendance: attendanceRate,
    attendanceTerm: attendanceTerm || 'All Terms',
    upcomingItems
  });
});

dashboardRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  const classLead = findClassLead(child?.classId || '');
  const termQuery = String(req.query.term || '').trim();
  const sessionId = getActiveSessionId();

  const plans = child
    ? adminStore.feePlans.filter((plan) => plan.classId === child.classId && matchesSession(plan.sessionId, sessionId))
    : [];
  const payments = child
    ? adminStore.payments.filter((payment) => payment.studentId === child.id && matchesSession(payment.sessionId, sessionId))
    : [];
  const allAttendance = child
    ? adminStore.attendanceRecords.filter((record) => record.studentId === child.id)
    : [];
  const activeTerm = termQuery || resolveLatestTerm([
    ...plans.map((plan) => plan.term),
    ...payments.map((payment) => payment.term),
    ...allAttendance.map((record) => record.term)
  ]);
  const scopedPlans = activeTerm ? plans.filter((plan) => String(plan.term || '').trim() === activeTerm) : plans;
  const scopedPayments = activeTerm ? payments.filter((payment) => String(payment.term || '').trim() === activeTerm) : payments;
  const planTotal = scopedPlans.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidTotal = scopedPayments.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
  const attendanceTerm = activeTerm || '';

  const attendance = attendanceTerm
    ? allAttendance.filter((record) => String(record.term || '').trim() === attendanceTerm)
    : allAttendance;

  const present = attendance.filter((record) => record.present).length;
  const attendanceRate = attendance.length ? `${Number(((present / attendance.length) * 100).toFixed(1))}%` : 'N/A';

  return res.json({
    dashboard: 'parent',
    child,
    children,
    classLead,
    attendance: attendanceRate,
    attendanceTerm: attendanceTerm || 'All Terms',
    paymentStatus: child ? (planTotal - paidTotal > 0 ? 'Outstanding Balance' : 'Paid Up') : 'No linked child',
    linkedChildrenCount: children.length
  });
});

export default dashboardRouter;
