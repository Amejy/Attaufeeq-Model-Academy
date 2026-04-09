import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';

const attendanceRouter = Router();

function normalizeDate(value) {
  return String(value || '').slice(0, 10);
}

function normalizeTerm(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function isLeadTeacherAssignment(assignment) {
  const role = normalizeRole(assignment?.assignmentRole);
  if (!role) return false;
  return role === 'lead teacher' || role === 'class teacher' || role === 'form teacher' || role.includes('lead');
}

function isValidDateOnly(value) {
  const normalized = normalizeDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized;
}

function withLabels(record) {
  const student = adminStore.students.find((item) => item.id === record.studentId);
  const teacher = adminStore.teachers.find((item) => item.id === record.teacherId);
  const classItem = adminStore.classes.find((item) => item.id === record.classId);
  const subject = adminStore.subjects.find((item) => item.id === record.subjectId);
  const subjectLabel = subject?.name || (record.subjectId === 'class-attendance' ? 'Class Attendance' : record.subjectId);

  return {
    ...record,
    term: record.term || '',
    institution: classItem?.institution || student?.institution || teacher?.institution || '',
    studentName: student?.fullName || record.studentId,
    teacherName: teacher?.fullName || record.teacherId,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : record.classId,
    subjectName: subjectLabel
  };
}

function getCountableStudentsForClass(classIds = []) {
  const allowedClassIds = new Set((classIds || []).filter(Boolean));
  if (!allowedClassIds.size) return [];
  return filterCountableActiveStudents(adminStore.students).filter((item) => allowedClassIds.has(item.classId));
}

attendanceRouter.get('/teacher/options', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) return res.json({ classes: [], subjects: [], students: [] });

  const assignments = adminStore.teacherAssignments.filter((item) => item.teacherId === teacher.id);
  const leadClassIds = new Set(
    assignments
      .filter((item) => isLeadTeacherAssignment(item))
      .map((item) => item.classId)
  );

  const classIds = [...leadClassIds];
  const classes = adminStore.classes.filter((item) => classIds.includes(item.id));
  const students = getCountableStudentsForClass(classIds);

  return res.json({ classes, subjects: [], students, assignments, teacher });
});

attendanceRouter.post('/teacher/mark', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  const { date, classId, rows } = req.body || {};
  const subjectId = String(req.body?.subjectId || '').trim() || 'class-attendance';
  const term = normalizeTerm(req.body?.term);

  if (!date || !classId || !term || !Array.isArray(rows)) {
    return res.status(400).json({ message: 'date, classId, term, rows are required.' });
  }
  if (!isValidDateOnly(date)) {
    return res.status(400).json({ message: 'date must be a valid YYYY-MM-DD value.' });
  }

  const classAssignments = adminStore.teacherAssignments.filter(
    (item) =>
      item.teacherId === teacher.id &&
      item.classId === classId &&
      normalizeTerm(item.term) === term
  );
  const isLeadTeacher = classAssignments.some((item) => isLeadTeacherAssignment(item));

  if (!isLeadTeacher) {
    return res.status(403).json({ message: 'Only the lead teacher can take attendance for this class.' });
  }

  const allowedStudentIds = new Set(getCountableStudentsForClass([classId]).map((student) => student.id));
  if (!allowedStudentIds.size) {
    return res.status(400).json({ message: 'No enrolled students found for this class.' });
  }
  const submittedStudentIds = rows.map((row) => row?.studentId).filter(Boolean);
  if (!submittedStudentIds.length) {
    return res.status(400).json({ message: 'Attendance rows are required for enrolled students.' });
  }
  for (const row of rows) {
    if (row?.studentId && !allowedStudentIds.has(row.studentId)) {
      return res.status(403).json({ message: 'One or more students are outside your class scope.' });
    }
  }

  const normalizedDate = normalizeDate(date);
  const saved = [];

  rows.forEach((row) => {
    if (!row.studentId) return;

    const recordIndex = adminStore.attendanceRecords.findIndex(
      (item) =>
        normalizeDate(item.date) === normalizedDate &&
        item.classId === classId &&
        item.subjectId === subjectId &&
        normalizeTerm(item.term) === term &&
        item.studentId === row.studentId
    );

    const record = {
      id: recordIndex >= 0 ? adminStore.attendanceRecords[recordIndex].id : makeId('att'),
      date: normalizedDate,
      classId,
      subjectId,
      teacherId: teacher.id,
      studentId: row.studentId,
      term,
      present: Boolean(row.present),
      remark: row.remark || ''
    };

    if (recordIndex >= 0) {
      adminStore.attendanceRecords[recordIndex] = record;
    } else {
      adminStore.attendanceRecords.unshift(record);
    }

    saved.push(record);
  });

  return res.json({ savedCount: saved.length, records: saved.map(withLabels) });
});

attendanceRouter.get('/teacher/records', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) return res.json({ records: [] });
  const term = normalizeTerm(req.query.term);

  const records = adminStore.attendanceRecords
    .filter((item) => item.teacherId === teacher.id)
    .filter((item) => (term ? normalizeTerm(item.term) === term : true))
    .map(withLabels)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.json({ records });
});

attendanceRouter.get('/admin/records', requireAuth, requireRole('admin'), (req, res) => {
  const institution = req.query.institution ? String(req.query.institution) : '';
  const date = req.query.date ? normalizeDate(req.query.date) : '';
  const classId = req.query.classId ? String(req.query.classId) : '';
  const term = normalizeTerm(req.query.term);

  const records = adminStore.attendanceRecords
    .filter((item) => (date ? normalizeDate(item.date) === date : true))
    .filter((item) => (classId ? item.classId === classId : true))
    .filter((item) => (term ? normalizeTerm(item.term) === term : true))
    .map(withLabels)
    .filter((item) => (institution ? item.institution === institution : true))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = records.length;
  const present = records.filter((item) => item.present).length;

  return res.json({
    records,
    summary: {
      total,
      present,
      absent: total - present,
      attendanceRate: total ? Number(((present / total) * 100).toFixed(2)) : 0
    }
  });
});

attendanceRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  if (!student) return res.json({ student: null, records: [], summary: null });
  const term = normalizeTerm(req.query.term);

  const records = adminStore.attendanceRecords
    .filter((item) => item.studentId === student.id)
    .filter((item) => (term ? normalizeTerm(item.term) === term : true))
    .map(withLabels)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = records.length;
  const present = records.filter((item) => item.present).length;

  return res.json({
    student,
    records,
    summary: {
      total,
      present,
      absent: total - present,
      attendanceRate: total ? Number(((present / total) * 100).toFixed(2)) : 0
    }
  });
});

attendanceRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  if (!child) return res.json({ child: null, children, records: [], summary: null });
  const term = normalizeTerm(req.query.term);

  const records = adminStore.attendanceRecords
    .filter((item) => item.studentId === child.id)
    .filter((item) => (term ? normalizeTerm(item.term) === term : true))
    .map(withLabels)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = records.length;
  const present = records.filter((item) => item.present).length;

  return res.json({
    child,
    children,
    records,
    summary: {
      total,
      present,
      absent: total - present,
      attendanceRate: total ? Number(((present / total) * 100).toFixed(2)) : 0
    }
  });
});

export default attendanceRouter;
