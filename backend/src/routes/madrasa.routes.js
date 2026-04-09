import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';

const madrasaRouter = Router();

function normalizeScore(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function normalizeRecordPayload(body = {}) {
  return {
    studentId: String(body.studentId || '').trim(),
    term: String(body.term || '').trim(),
    quranPortion: String(body.quranPortion || '').trim(),
    tajweedLevel: String(body.tajweedLevel || '').trim(),
    arabicScore: normalizeScore(body.arabicScore),
    islamicScore: normalizeScore(body.islamicScore),
    notes: String(body.notes || '').trim()
  };
}

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0];
  return active?.id || '';
}

function resolveEnrollmentClassId(studentId, sessionId) {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function buildClassLabel(classId, fallback = '') {
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return classItem ? `${classItem.name} ${classItem.arm}` : fallback;
}

function resolveTeacherStudents(teacher) {
  if (!teacher?.id) return [];
  const classIds = adminStore.teacherAssignments
    .filter((item) => item.teacherId === teacher.id)
    .map((item) => item.classId)
    .filter(Boolean);

  if (!classIds.length) return [];

  const activeSessionId = getActiveSessionId();

  return filterCountableActiveStudents(adminStore.students)
    .map((student) => {
      const resolvedClassId = resolveEnrollmentClassId(student.id, activeSessionId) || student.classId;
      const classLabel = buildClassLabel(resolvedClassId, student.level || '');
      const classItem = adminStore.classes.find((item) => item.id === resolvedClassId);
      return {
        ...student,
        classId: resolvedClassId,
        classLabel,
        institution: student.institution || classItem?.institution || ''
      };
    })
    .filter((student) => classIds.includes(student.classId))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

madrasaRouter.get('/admin/records', requireAuth, requireRole('admin'), (_req, res) => {
  const records = adminStore.madrasaRecords.map((record) => {
    const student = adminStore.students.find((item) => item.id === record.studentId);
    return {
      ...record,
      studentName: student?.fullName || record.studentId,
      institution: student?.institution || 'Madrastul ATTAUFEEQ'
    };
  });

  return res.json({ records });
});

madrasaRouter.post('/admin/records', requireAuth, requireRole('admin'), (req, res) => {
  const {
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  } = normalizeRecordPayload(req.body);

  if (!studentId || !term || !quranPortion || !tajweedLevel) {
    return res.status(400).json({
      message: 'studentId, term, quranPortion, tajweedLevel are required.'
    });
  }
  if (arabicScore === null || islamicScore === null) {
    return res.status(400).json({ message: 'Arabic and Islamic scores must be numbers between 0 and 100.' });
  }

  const studentExists = adminStore.students.some((item) => item.id === studentId);
  if (!studentExists) {
    return res.status(400).json({ message: 'Invalid studentId.' });
  }

  const record = {
    id: makeId('mdr'),
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  };

  adminStore.madrasaRecords.unshift(record);
  return res.status(201).json({ record });
});

madrasaRouter.put('/admin/records/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const recordIndex = adminStore.madrasaRecords.findIndex((item) => item.id === id);

  if (recordIndex === -1) {
    return res.status(404).json({ message: 'Madrasa record not found.' });
  }

  const {
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  } = normalizeRecordPayload(req.body);

  if (!studentId || !term || !quranPortion || !tajweedLevel) {
    return res.status(400).json({
      message: 'studentId, term, quranPortion, tajweedLevel are required.'
    });
  }
  if (arabicScore === null || islamicScore === null) {
    return res.status(400).json({ message: 'Arabic and Islamic scores must be numbers between 0 and 100.' });
  }

  const studentExists = adminStore.students.some((item) => item.id === studentId);
  if (!studentExists) {
    return res.status(400).json({ message: 'Invalid studentId.' });
  }

  adminStore.madrasaRecords[recordIndex] = {
    id,
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  };

  return res.json({ record: adminStore.madrasaRecords[recordIndex] });
});

madrasaRouter.delete('/admin/records/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const recordIndex = adminStore.madrasaRecords.findIndex((item) => item.id === id);

  if (recordIndex === -1) {
    return res.status(404).json({ message: 'Madrasa record not found.' });
  }

  adminStore.madrasaRecords.splice(recordIndex, 1);
  return res.status(204).send();
});

madrasaRouter.get('/teacher/students', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const students = resolveTeacherStudents(teacher);
  return res.json({ students });
});

madrasaRouter.get('/teacher/records', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const students = resolveTeacherStudents(teacher);
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const records = adminStore.madrasaRecords
    .filter((record) => studentMap.has(record.studentId))
    .map((record) => ({
      ...record,
      studentName: studentMap.get(record.studentId)?.fullName || record.studentId,
      classLabel: studentMap.get(record.studentId)?.classLabel || ''
    }));
  return res.json({ records });
});

madrasaRouter.post('/teacher/records', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const students = resolveTeacherStudents(teacher);
  const allowedIds = new Set(students.map((student) => student.id));
  const {
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  } = normalizeRecordPayload(req.body);

  if (!studentId || !term || !quranPortion || !tajweedLevel) {
    return res.status(400).json({
      message: 'studentId, term, quranPortion, tajweedLevel are required.'
    });
  }
  if (arabicScore === null || islamicScore === null) {
    return res.status(400).json({ message: 'Arabic and Islamic scores must be numbers between 0 and 100.' });
  }

  if (!allowedIds.has(studentId)) {
    return res.status(403).json({ message: 'Student is outside of your assigned scope.' });
  }

  const record = {
    id: makeId('mdr'),
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  };

  adminStore.madrasaRecords.unshift(record);
  return res.status(201).json({ record });
});

madrasaRouter.put('/teacher/records/:id', requireAuth, requireRole('teacher'), (req, res) => {
  const { id } = req.params;
  const recordIndex = adminStore.madrasaRecords.findIndex((item) => item.id === id);

  if (recordIndex === -1) {
    return res.status(404).json({ message: 'Madrasa record not found.' });
  }

  const teacher = findTeacherByUser(req.user);
  const students = resolveTeacherStudents(teacher);
  const allowedIds = new Set(students.map((student) => student.id));
  const {
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  } = normalizeRecordPayload(req.body);

  if (!studentId || !term || !quranPortion || !tajweedLevel) {
    return res.status(400).json({
      message: 'studentId, term, quranPortion, tajweedLevel are required.'
    });
  }
  if (arabicScore === null || islamicScore === null) {
    return res.status(400).json({ message: 'Arabic and Islamic scores must be numbers between 0 and 100.' });
  }

  if (!allowedIds.has(studentId)) {
    return res.status(403).json({ message: 'Student is outside of your assigned scope.' });
  }

  adminStore.madrasaRecords[recordIndex] = {
    id,
    studentId,
    term,
    quranPortion,
    tajweedLevel,
    arabicScore,
    islamicScore,
    notes
  };

  return res.json({ record: adminStore.madrasaRecords[recordIndex] });
});

madrasaRouter.delete('/teacher/records/:id', requireAuth, requireRole('teacher'), (req, res) => {
  const { id } = req.params;
  const recordIndex = adminStore.madrasaRecords.findIndex((item) => item.id === id);

  if (recordIndex === -1) {
    return res.status(404).json({ message: 'Madrasa record not found.' });
  }

  const teacher = findTeacherByUser(req.user);
  const students = resolveTeacherStudents(teacher);
  const allowedIds = new Set(students.map((student) => student.id));
  if (!allowedIds.has(adminStore.madrasaRecords[recordIndex].studentId)) {
    return res.status(403).json({ message: 'Student is outside of your assigned scope.' });
  }

  adminStore.madrasaRecords.splice(recordIndex, 1);
  return res.status(204).send();
});

madrasaRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  if (!student) return res.json({ student: null, records: [] });

  const records = adminStore.madrasaRecords.filter((item) => item.studentId === student.id);
  return res.json({ student, records });
});

madrasaRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  if (!child) return res.json({ child: null, children, records: [] });

  const records = adminStore.madrasaRecords.filter((item) => item.studentId === child.id);
  return res.json({ child, children, records });
});

export default madrasaRouter;
