import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';

const timetableRouter = Router();
const DAY_OPTIONS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidTimeValue(value) {
  const normalized = normalizeText(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized);
}

function withLabels(entry) {
  const classItem = adminStore.classes.find((item) => item.id === entry.classId);
  const subject = adminStore.subjects.find((item) => item.id === entry.subjectId);
  const teacher = adminStore.teachers.find((item) => item.id === entry.teacherId);
  return {
    ...entry,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : entry.classId,
    subjectName: subject?.name || entry.subjectId,
    teacherName: teacher?.fullName || entry.teacherId
  };
}

function sortTimetable(rows) {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return [...rows].sort((a, b) => {
    const d = dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek);
    if (d !== 0) return d;
    return String(a.startTime).localeCompare(String(b.startTime));
  });
}

function hasTeacherAssignment({ teacherId, classId, subjectId, term }) {
  return adminStore.teacherAssignments.some((assignment) => (
    assignment.teacherId === teacherId &&
    assignment.classId === classId &&
    assignment.subjectId === subjectId &&
    assignment.term === term
  ));
}

function timesOverlap(startA, endA, startB, endB) {
  return String(startA).localeCompare(String(endB)) < 0 &&
    String(endA).localeCompare(String(startB)) > 0;
}

function getTimetableConflict({
  entryId,
  classId,
  teacherId,
  dayOfWeek,
  startTime,
  endTime,
  term,
  institution
}) {
  const overlappingEntry = adminStore.timetableEntries.find((entry) => {
    if (entry.id === entryId) return false;
    if (entry.dayOfWeek !== dayOfWeek || entry.term !== term || entry.institution !== institution) return false;
    if (!timesOverlap(startTime, endTime, entry.startTime, entry.endTime)) return false;
    return entry.classId === classId || entry.teacherId === teacherId;
  });

  if (!overlappingEntry) return null;
  if (overlappingEntry.classId === classId) {
    return 'This class already has a timetable entry during the selected time.';
  }
  if (overlappingEntry.teacherId === teacherId) {
    return 'This teacher already has a timetable entry during the selected time.';
  }
  return 'This timetable entry conflicts with an existing schedule.';
}

timetableRouter.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  return res.json({ entries: sortTimetable(adminStore.timetableEntries).map(withLabels) });
});

timetableRouter.post('/admin', requireAuth, requireRole('admin'), (req, res) => {
  const {
    classId,
    subjectId,
    teacherId,
    dayOfWeek,
    startTime,
    endTime,
    term,
    institution,
    room
  } = req.body || {};
  const normalizedClassId = normalizeText(classId);
  const normalizedSubjectId = normalizeText(subjectId);
  const normalizedTeacherId = normalizeText(teacherId);
  const normalizedDayOfWeek = normalizeText(dayOfWeek);
  const normalizedStartTime = normalizeText(startTime);
  const normalizedEndTime = normalizeText(endTime);
  const normalizedTerm = normalizeText(term);
  const normalizedInstitution = normalizeText(institution);
  const normalizedRoom = normalizeText(room);

  if (!normalizedClassId || !normalizedSubjectId || !normalizedTeacherId || !normalizedDayOfWeek || !normalizedStartTime || !normalizedEndTime || !normalizedTerm || !normalizedInstitution) {
    return res.status(400).json({
      message: 'classId, subjectId, teacherId, dayOfWeek, startTime, endTime, term, institution are required.'
    });
  }
  if (!DAY_OPTIONS.has(normalizedDayOfWeek)) {
    return res.status(400).json({ message: 'dayOfWeek must be a valid weekday.' });
  }
  if (!isValidTimeValue(normalizedStartTime) || !isValidTimeValue(normalizedEndTime)) {
    return res.status(400).json({ message: 'startTime and endTime must use HH:MM 24-hour format.' });
  }

  const classExists = adminStore.classes.some((item) => item.id === normalizedClassId);
  const subjectExists = adminStore.subjects.some((item) => item.id === normalizedSubjectId);
  const teacherExists = adminStore.teachers.some((item) => item.id === normalizedTeacherId);

  if (!classExists || !subjectExists || !teacherExists) {
    return res.status(400).json({ message: 'Referenced class, subject, or teacher does not exist.' });
  }

  const classItem = adminStore.classes.find((item) => item.id === normalizedClassId);
  const subjectItem = adminStore.subjects.find((item) => item.id === normalizedSubjectId);
  const teacherItem = adminStore.teachers.find((item) => item.id === normalizedTeacherId);

  if (
    !classItem ||
    !subjectItem ||
    !teacherItem ||
    subjectItem.institution !== classItem.institution ||
    teacherItem.institution !== classItem.institution ||
    normalizedInstitution !== classItem.institution
  ) {
    return res.status(400).json({ message: 'Teacher, class, subject, and institution must match.' });
  }

  if (!hasTeacherAssignment({ teacherId: normalizedTeacherId, classId: normalizedClassId, subjectId: normalizedSubjectId, term: normalizedTerm })) {
    return res.status(403).json({
      message: 'Timetable entries must use a teacher assignment for the same class, subject, and term.'
    });
  }

  if (normalizedEndTime.localeCompare(normalizedStartTime) <= 0) {
    return res.status(400).json({ message: 'endTime must be later than startTime.' });
  }

  const conflictMessage = getTimetableConflict({
    classId: normalizedClassId,
    teacherId: normalizedTeacherId,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    term: normalizedTerm,
    institution: normalizedInstitution
  });
  if (conflictMessage) {
    return res.status(409).json({ message: conflictMessage });
  }

  const entry = {
    id: makeId('ttb'),
    classId: normalizedClassId,
    subjectId: normalizedSubjectId,
    teacherId: normalizedTeacherId,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    term: normalizedTerm,
    institution: normalizedInstitution,
    room: normalizedRoom
  };

  adminStore.timetableEntries.unshift(entry);
  return res.status(201).json({ entry: withLabels(entry) });
});

timetableRouter.put('/admin/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.timetableEntries.findIndex((item) => item.id === id);
  if (index === -1) return res.status(404).json({ message: 'Timetable entry not found.' });

  const current = adminStore.timetableEntries[index];
  const next = {
    ...current,
    classId: req.body?.classId !== undefined ? normalizeText(req.body.classId) : current.classId,
    subjectId: req.body?.subjectId !== undefined ? normalizeText(req.body.subjectId) : current.subjectId,
    teacherId: req.body?.teacherId !== undefined ? normalizeText(req.body.teacherId) : current.teacherId,
    dayOfWeek: req.body?.dayOfWeek !== undefined ? normalizeText(req.body.dayOfWeek) : current.dayOfWeek,
    startTime: req.body?.startTime !== undefined ? normalizeText(req.body.startTime) : current.startTime,
    endTime: req.body?.endTime !== undefined ? normalizeText(req.body.endTime) : current.endTime,
    term: req.body?.term !== undefined ? normalizeText(req.body.term) : current.term,
    institution: req.body?.institution !== undefined ? normalizeText(req.body.institution) : current.institution,
    room: req.body?.room !== undefined ? normalizeText(req.body.room) : current.room
  };
  if (!DAY_OPTIONS.has(next.dayOfWeek)) {
    return res.status(400).json({ message: 'dayOfWeek must be a valid weekday.' });
  }
  if (!isValidTimeValue(next.startTime) || !isValidTimeValue(next.endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must use HH:MM 24-hour format.' });
  }

  const classItem = adminStore.classes.find((item) => item.id === next.classId);
  const subjectItem = adminStore.subjects.find((item) => item.id === next.subjectId);
  const teacherItem = adminStore.teachers.find((item) => item.id === next.teacherId);

  if (
    !classItem ||
    !subjectItem ||
    !teacherItem ||
    subjectItem.institution !== classItem.institution ||
    teacherItem.institution !== classItem.institution ||
    next.institution !== classItem.institution
  ) {
    return res.status(400).json({ message: 'Teacher, class, subject, and institution must match.' });
  }

  if (!hasTeacherAssignment({
    teacherId: next.teacherId,
    classId: next.classId,
    subjectId: next.subjectId,
    term: next.term
  })) {
    return res.status(403).json({
      message: 'Timetable entries must use a teacher assignment for the same class, subject, and term.'
    });
  }

  if (String(next.endTime).localeCompare(String(next.startTime)) <= 0) {
    return res.status(400).json({ message: 'endTime must be later than startTime.' });
  }

  const conflictMessage = getTimetableConflict({
    entryId: current.id,
    classId: next.classId,
    teacherId: next.teacherId,
    dayOfWeek: next.dayOfWeek,
    startTime: next.startTime,
    endTime: next.endTime,
    term: next.term,
    institution: next.institution
  });
  if (conflictMessage) {
    return res.status(409).json({ message: conflictMessage });
  }

  adminStore.timetableEntries[index] = next;
  return res.json({ entry: withLabels(next) });
});

timetableRouter.delete('/admin/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.timetableEntries.findIndex((item) => item.id === id);
  if (index === -1) return res.status(404).json({ message: 'Timetable entry not found.' });
  adminStore.timetableEntries.splice(index, 1);
  return res.status(204).send();
});

timetableRouter.get('/teacher', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) return res.json({ entries: [] });

  const rows = adminStore.timetableEntries
    .filter((item) => item.teacherId === teacher.id)
    .map(withLabels);

  return res.json({ entries: sortTimetable(rows) });
});

timetableRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  if (!student) return res.json({ entries: [] });

  const rows = adminStore.timetableEntries
    .filter((item) => item.classId === student.classId)
    .map(withLabels);

  return res.json({ entries: sortTimetable(rows), student });
});

timetableRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  if (!child) return res.json({ entries: [], child: null, children });

  const rows = adminStore.timetableEntries
    .filter((item) => item.classId === child.classId)
    .map(withLabels);

  return res.json({ entries: sortTimetable(rows), child, children });
});

export default timetableRouter;
