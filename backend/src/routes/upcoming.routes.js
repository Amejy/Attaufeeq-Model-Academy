import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';

const upcomingRouter = Router();

function classLabel(classItem) {
  return classItem ? `${classItem.name} ${classItem.arm}` : '';
}

function normalizeDueDate(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function mapUpcomingItem(item) {
  const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
  return {
    ...item,
    classLabel: item.classLabel || classLabel(classItem) || item.classId || '',
    institution: item.institution || classItem?.institution || ''
  };
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

function sortUpcomingItems(items = []) {
  return [...items].sort((a, b) => {
    const left = a.dueDate || a.createdAt || '';
    const right = b.dueDate || b.createdAt || '';
    return new Date(left) - new Date(right);
  });
}

function resolveTeacherClasses(teacherId) {
  const classIds = adminStore.teacherAssignments
    .filter((assignment) => assignment.teacherId === teacherId)
    .map((assignment) => assignment.classId)
    .filter(Boolean);
  const uniqueIds = [...new Set(classIds)];
  return uniqueIds
    .map((id) => adminStore.classes.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => ({
      id: item.id,
      label: classLabel(item),
      institution: item.institution || ''
    }));
}

function isDuplicateUpcomingItem(items, candidate) {
  return (items || []).some((item) =>
    item.teacherId === candidate.teacherId &&
    item.classId === candidate.classId &&
    String(item.title || '').trim().toLowerCase() === candidate.title.toLowerCase() &&
    String(item.details || '').trim() === candidate.details &&
    String(item.dueDate || '') === String(candidate.dueDate || '')
  );
}

upcomingRouter.get('/teacher', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.json({ items: [], classes: [] });
  }

  const classes = resolveTeacherClasses(teacher.id);
  const classIdSet = new Set(classes.map((item) => item.id));
  const items = (adminStore.upcomingItems || [])
    .filter((item) => classIdSet.has(item.classId))
    .filter((item) => isActiveUpcomingItem(item))
    .map(mapUpcomingItem)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ items, classes });
});

upcomingRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  if (!student?.classId) {
    return res.json({ items: [], student: student || null });
  }

  const items = sortUpcomingItems(
    (adminStore.upcomingItems || [])
      .filter((item) => item.classId === student.classId)
      .filter((item) => isActiveUpcomingItem(item))
      .map(mapUpcomingItem)
  );

  return res.json({ items, student });
});

upcomingRouter.post('/teacher', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(403).json({ message: 'Teacher profile not found.' });
  }

  const { title, details, dueDate, classId } = req.body || {};
  const normalizedTitle = String(title || '').trim();
  const normalizedClassId = String(classId || '').trim();
  const normalizedDueDate = normalizeDueDate(dueDate);
  if (!normalizedTitle || !normalizedClassId) {
    return res.status(400).json({ message: 'title and classId are required.' });
  }
  if (normalizedDueDate === null) {
    return res.status(400).json({ message: 'dueDate must be a valid date.' });
  }

  const allowed = adminStore.teacherAssignments.some(
    (assignment) => assignment.teacherId === teacher.id && assignment.classId === normalizedClassId
  );
  if (!allowed) {
    return res.status(403).json({ message: 'You can only post upcoming items for your assigned classes.' });
  }

  const classItem = adminStore.classes.find((item) => item.id === normalizedClassId);
  if (!classItem) {
    return res.status(400).json({ message: 'Referenced class does not exist.' });
  }

  const now = new Date().toISOString();
  const nextItem = {
    teacherId: teacher.id,
    classId: normalizedClassId,
    title: normalizedTitle.toLowerCase(),
    details: String(details || '').trim(),
    dueDate: normalizedDueDate || ''
  };
  if (isDuplicateUpcomingItem(adminStore.upcomingItems, nextItem)) {
    return res.status(409).json({ message: 'This upcoming item already exists for the selected class.' });
  }

  const item = {
    id: makeId('upc'),
    title: normalizedTitle,
    details: nextItem.details,
    dueDate: normalizedDueDate || '',
    classId: normalizedClassId,
    classLabel: classLabel(classItem),
    institution: classItem.institution || '',
    teacherId: teacher.id,
    teacherName: teacher.fullName || teacher.email || 'Teacher',
    createdAt: now,
    updatedAt: now
  };

  adminStore.upcomingItems = adminStore.upcomingItems || [];
  adminStore.upcomingItems.unshift(item);

  return res.status(201).json({ item: mapUpcomingItem(item) });
});

upcomingRouter.delete('/teacher/:id', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(403).json({ message: 'Teacher profile not found.' });
  }

  const index = (adminStore.upcomingItems || []).findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: 'Upcoming item not found.' });
  }

  const item = adminStore.upcomingItems[index];
  if (item.teacherId !== teacher.id) {
    return res.status(403).json({ message: 'You can only remove items you posted.' });
  }

  adminStore.upcomingItems.splice(index, 1);
  return res.json({ message: 'Upcoming item deleted.' });
});

upcomingRouter.put('/teacher/:id', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(403).json({ message: 'Teacher profile not found.' });
  }

  const index = (adminStore.upcomingItems || []).findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: 'Upcoming item not found.' });
  }

  const current = adminStore.upcomingItems[index];
  if (current.teacherId !== teacher.id) {
    return res.status(403).json({ message: 'You can only edit items you posted.' });
  }

  const { title, details, dueDate, classId } = req.body || {};
  const normalizedTitle = String(title || '').trim();
  const normalizedClassId = String(classId || '').trim();
  const normalizedDueDate = normalizeDueDate(dueDate);
  if (!normalizedTitle || !normalizedClassId) {
    return res.status(400).json({ message: 'title and classId are required.' });
  }
  if (normalizedDueDate === null) {
    return res.status(400).json({ message: 'dueDate must be a valid date.' });
  }

  const allowed = adminStore.teacherAssignments.some(
    (assignment) => assignment.teacherId === teacher.id && assignment.classId === normalizedClassId
  );
  if (!allowed) {
    return res.status(403).json({ message: 'You can only post upcoming items for your assigned classes.' });
  }

  const classItem = adminStore.classes.find((item) => item.id === normalizedClassId);
  if (!classItem) {
    return res.status(400).json({ message: 'Referenced class does not exist.' });
  }
  const nextDetails = String(details || '').trim();
  const nextDueDate = normalizedDueDate || '';
  const duplicateItem = (adminStore.upcomingItems || []).some((item) =>
    item.id !== current.id &&
    item.teacherId === teacher.id &&
    item.classId === normalizedClassId &&
    String(item.title || '').trim().toLowerCase() === normalizedTitle.toLowerCase() &&
    String(item.details || '').trim() === nextDetails &&
    String(item.dueDate || '') === nextDueDate
  );
  if (duplicateItem) {
    return res.status(409).json({ message: 'This upcoming item already exists for the selected class.' });
  }

  const updated = {
    ...current,
    title: normalizedTitle,
    details: nextDetails,
    dueDate: nextDueDate,
    classId: normalizedClassId,
    classLabel: classLabel(classItem),
    institution: classItem.institution || '',
    updatedAt: new Date().toISOString()
  };

  adminStore.upcomingItems[index] = updated;
  return res.json({ item: mapUpcomingItem(updated) });
});

export default upcomingRouter;
