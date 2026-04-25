import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth } from '../middleware/auth.js';
import { findFirstUserByRole } from '../repositories/userRepository.js';
import { findChildForParent, findChildrenForParent, findTeacherByUser } from '../utils/portalScope.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';

const messagesRouter = Router();

messagesRouter.use(requireAuth);

function resolveParentChildScope(user, childId = '') {
  const children = findChildrenForParent(user);
  const child = findChildForParent(user, childId) || children[0] || null;
  return { children, child };
}

function canAccessThread(user, thread) {
  if (user?.role === 'admin') return true;

  const userId = String(user?.sub || '');
  if (!userId) return false;

  if (Array.isArray(thread.participantUserIds) && thread.participantUserIds.length) {
    return thread.participantUserIds.includes(userId);
  }

  return thread.createdByUserId === userId;
}

function currentUserId(user) {
  return String(user?.sub || '');
}

function markThreadRead(thread, userId) {
  if (!thread || !userId) return thread;
  thread.readBy = {
    ...(thread.readBy && typeof thread.readBy === 'object' ? thread.readBy : {}),
    [userId]: new Date().toISOString()
  };
  return thread;
}

function getUnreadState(thread, lastMessage, userId) {
  if (!userId || !lastMessage) {
    return { unread: false, lastReadAt: '' };
  }

  const lastReadAt = String(thread?.readBy?.[userId] || '');
  const unread = !lastReadAt || new Date(lastMessage.createdAt).getTime() > new Date(lastReadAt).getTime();
  return { unread, lastReadAt };
}

function buildAdminContacts() {
  const parents = [];
  const seenParents = new Set();
  const activeStudents = filterCountableActiveStudents(adminStore.students);

  activeStudents.forEach((student) => {
    const userId = student.parentUserId || '';
    const name = student.guardianName || '';
    const email = student.parentPortalEmail || student.guardianEmail || '';
    if (!name || !userId) return;

    const key = `${userId}|${student.id}`;
    if (seenParents.has(key)) return;
    seenParents.add(key);
    parents.push({
      id: `parent:${student.id}`,
      role: 'parent',
      label: name,
      subtitle: student.fullName,
      institution: student.institution || '',
      studentId: student.id,
      userId,
      email
    });
  });

  const teachers = adminStore.teachers
    .filter((teacher) => teacher.userId)
    .map((teacher) => ({
      id: `teacher:${teacher.id}`,
      role: 'teacher',
      label: teacher.fullName,
      subtitle: teacher.institution || '',
      institution: teacher.institution || '',
      userId: teacher.userId,
      teacherId: teacher.id
    }));

  return [...parents, ...teachers];
}

async function buildAdminDeskContact() {
  const adminDesk = await findFirstUserByRole('admin');
  if (!adminDesk) return null;

  return {
    id: 'admin:desk',
    role: 'admin',
    label: adminDesk.fullName,
    subtitle: 'School administration',
    institution: 'All Institutions',
    userId: adminDesk.id,
    email: adminDesk.email
  };
}

async function buildTeacherContacts(user) {
  const teacher = findTeacherByUser(user);
  if (!teacher) return [];

  const classIds = adminStore.teacherAssignments
    .filter((assignment) => assignment.teacherId === teacher.id)
    .map((assignment) => assignment.classId);
  const classIdSet = new Set(classIds);

  const activeStudents = filterCountableActiveStudents(adminStore.students);

  const students = activeStudents
    .filter((student) => student.userId && classIdSet.has(student.classId))
    .map((student) => ({
      id: `student:${student.id}`,
      role: 'student',
      label: student.fullName,
      subtitle: student.level || student.classId || '',
      institution: student.institution || '',
      studentId: student.id,
      userId: student.userId
    }));

  const parents = [];
  const seenParents = new Set();

  activeStudents
    .filter((student) => classIdSet.has(student.classId))
    .forEach((student) => {
      const userId = student.parentUserId || '';
      const name = student.guardianName || '';
      const email = student.parentPortalEmail || student.guardianEmail || '';
      if (!name || !userId) return;

      const key = `${userId}|${student.id}`;
      if (seenParents.has(key)) return;
      seenParents.add(key);
      parents.push({
        id: `parent:${student.id}`,
        role: 'parent',
        label: name,
        subtitle: student.fullName,
        institution: student.institution || '',
        studentId: student.id,
        userId,
        email
      });
    });

  const adminDesk = await buildAdminDeskContact();
  const contacts = [...parents, ...students];
  if (adminDesk) {
    contacts.unshift(adminDesk);
  }

  return contacts;
}

async function buildContactsForUser(user, options = {}) {
  const childId = String(options.childId || '');
  if (user?.role === 'admin') return buildAdminContacts();
  if (user?.role === 'admissions') {
    const adminDesk = await buildAdminDeskContact();
    if (!adminDesk) return [];
    return [adminDesk];
  }
  if (user?.role === 'teacher') return buildTeacherContacts(user);
  if (user?.role === 'parent') {
    const { child } = resolveParentChildScope(user, childId);
    if (!child) return [];

    const classTeachers = adminStore.teacherAssignments
      .filter((assignment) => assignment.classId === child.classId)
      .map((assignment) => {
        const teacher = adminStore.teachers.find((item) => item.id === assignment.teacherId);
        if (!teacher?.userId) return null;
        return {
          id: `teacher:${teacher.id}`,
          role: 'teacher',
          label: teacher.fullName,
          subtitle: assignment.assignmentRole || child.classLabel || '',
          institution: teacher.institution || '',
          userId: teacher.userId,
          teacherId: teacher.id
        };
      })
      .filter(Boolean)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

    const adminDesk = await buildAdminDeskContact();
    const contacts = [...classTeachers];
    if (adminDesk) {
      contacts.unshift(adminDesk);
    }

    return contacts;
  }
  return [];
}

function inferParentThreadStudentId(user, thread) {
  const storedStudentId = String(thread?.contextStudentId || '').trim();
  if (storedStudentId) return storedStudentId;

  const { children } = resolveParentChildScope(user);
  if (children.length === 1) {
    return children[0].id;
  }

  const contactId = String(thread?.contactId || '').trim();
  if (!contactId.startsWith('teacher:')) {
    return '';
  }

  const teacherId = contactId.slice('teacher:'.length);
  if (!teacherId) {
    return '';
  }

  const matches = children.filter((child) =>
    adminStore.teacherAssignments.some(
      (assignment) => assignment.teacherId === teacherId && assignment.classId === child.classId
    )
  );

  return matches.length === 1 ? matches[0].id : '';
}

function resolveScopedParentThread(user, thread, childId = '') {
  if (user?.role !== 'parent') {
    return thread;
  }

  const { child: requestedChild } = resolveParentChildScope(user, childId);
  if (!requestedChild) {
    return null;
  }

  const inferredStudentId = inferParentThreadStudentId(user, thread);
  if (inferredStudentId && inferredStudentId !== thread.contextStudentId) {
    thread.contextStudentId = inferredStudentId;
  }

  return inferredStudentId === requestedChild.id ? thread : null;
}

messagesRouter.get('/contacts', async (req, res) => {
  const role = req.user?.role;
  const childId = String(req.query.childId || '');
  const contacts = (await buildContactsForUser(req.user, { childId })).filter((contact) => {
    if (role === 'admin') return true;
    if (role === 'admissions') return contact.role === 'admin';
    if (role === 'teacher') return ['parent', 'student', 'admin'].includes(contact.role);
    if (role === 'parent') return ['teacher', 'admin'].includes(contact.role);
    return false;
  });

  if (role === 'parent') {
    const { children, child } = resolveParentChildScope(req.user, childId);
    return res.json({ contacts, children, child });
  }

  return res.json({ contacts });
});

messagesRouter.get('/threads', (req, res) => {
  const childId = String(req.query.childId || '').trim();
  const userId = currentUserId(req.user);
  const requestedChild =
    req.user?.role === 'parent' ? resolveParentChildScope(req.user, childId).child : null;

  const threads = adminStore.messageThreads
    .filter((thread) => canAccessThread(req.user, thread))
    .filter((thread) => {
      if (req.user?.role !== 'parent') {
        return true;
      }

      if (!requestedChild) {
        return false;
      }

      const inferredStudentId = inferParentThreadStudentId(req.user, thread);
      if (inferredStudentId && inferredStudentId !== thread.contextStudentId) {
        thread.contextStudentId = inferredStudentId;
      }

      return inferredStudentId === requestedChild.id;
    })
    .map((thread) => {
      const lastMessage = adminStore.messages
        .filter((item) => item.threadId === thread.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

      return {
        ...thread,
        lastMessage,
        ...getUnreadState(thread, lastMessage, userId)
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return res.json({ threads });
});

messagesRouter.post('/threads', async (req, res) => {
  const role = req.user?.role;
  const { title, contactId, childId } = req.body || {};
  const normalizedTitle = String(title || '').trim();
  const normalizedContactId = String(contactId || '').trim();

  if (!['admin', 'admissions', 'teacher', 'parent'].includes(role || '')) {
    return res.status(403).json({ message: 'Only admin, admissions, teachers, and parents can start new threads.' });
  }

  if (!normalizedTitle || !normalizedContactId) {
    return res.status(400).json({ message: 'title and contactId are required.' });
  }

  const scopedChild =
    role === 'parent' ? findChildForParent(req.user, String(childId || '').trim()) : null;
  if (role === 'parent' && !scopedChild) {
    return res.status(400).json({ message: 'A valid child scope is required to start this conversation.' });
  }

  const contact = (await buildContactsForUser(req.user, { childId })).find((item) => item.id === normalizedContactId);
  if (!contact) {
    return res.status(400).json({ message: 'The selected contact is outside your messaging scope.' });
  }
  if (contact.role === 'student' && role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can start conversations with students.' });
  }
  if (!contact.userId && contact.role !== 'admin') {
    return res.status(400).json({ message: 'The selected contact does not have an active portal account yet.' });
  }

  const participantUserIds = [...new Set([String(req.user?.sub || ''), contact.userId || ''].filter(Boolean))];
  const participants = [...new Set([role, contact.role])];
  const contextSubtitle = [contact?.subtitle || '', scopedChild?.fullName || '']
    .filter(Boolean)
    .join(' • ');
  const contextStudentId = role === 'parent' ? scopedChild?.id || '' : contact?.studentId || '';
  const duplicateThread = adminStore.messageThreads.find((item) =>
    item.createdByUserId === String(req.user?.sub || '') &&
    String(item.contactId || '') === (contact?.id || '') &&
    String(item.contextStudentId || '') === contextStudentId &&
    String(item.title || '').trim().toLowerCase() === normalizedTitle.toLowerCase()
  );
  if (duplicateThread) {
    return res.status(409).json({ message: 'A matching conversation thread already exists for this scope.' });
  }

  const thread = {
    id: makeId('thr'),
    title: normalizedTitle,
    participants,
    participantUserIds,
    contactId: contact?.id || '',
    contextLabel: contact ? `${contact.role.charAt(0).toUpperCase()}${contact.role.slice(1)}: ${contact.label}` : '',
    contextSubtitle,
    contextStudentId,
    createdByRole: role,
    createdByUserId: currentUserId(req.user),
    readBy: {
      [currentUserId(req.user)]: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  adminStore.messageThreads.unshift(thread);
  return res.status(201).json({ thread });
});

messagesRouter.get('/threads/:id', (req, res) => {
  const childId = String(req.query.childId || '').trim();
  const baseThread = adminStore.messageThreads.find((item) => item.id === req.params.id);
  const thread = baseThread ? resolveScopedParentThread(req.user, baseThread, childId) : null;

  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (!canAccessThread(req.user, thread)) {
    return res.status(403).json({ message: 'You do not have access to this thread.' });
  }
  markThreadRead(thread, currentUserId(req.user));

  const messages = adminStore.messages
    .filter((item) => item.threadId === thread.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return res.json({ thread, messages });
});

messagesRouter.post('/threads/:id/messages', (req, res) => {
  const role = req.user?.role;
  const childId = String(req.query.childId || '').trim();
  const baseThread = adminStore.messageThreads.find((item) => item.id === req.params.id);
  const thread = baseThread ? resolveScopedParentThread(req.user, baseThread, childId) : null;
  const body = String(req.body?.body || '').trim();

  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (!canAccessThread(req.user, thread)) {
    return res.status(403).json({ message: 'You do not have access to this thread.' });
  }
  if (role === 'student') {
    return res.status(403).json({ message: 'Students can only read messages.' });
  }
  if (Array.isArray(thread.participants) && thread.participants.includes('student') && role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can message students.' });
  }
  if (!body) return res.status(400).json({ message: 'Message body is required.' });

  const message = {
    id: makeId('msg'),
    threadId: thread.id,
    senderRole: role,
    senderUserId: currentUserId(req.user),
    senderName: req.user?.fullName || req.user?.email || role,
    body,
    createdAt: new Date().toISOString()
  };

  adminStore.messages.push(message);
  thread.updatedAt = new Date().toISOString();
  markThreadRead(thread, currentUserId(req.user));

  return res.status(201).json({ message });
});

messagesRouter.delete('/threads/:id', (req, res) => {
  const childId = String(req.query.childId || '').trim();
  const baseThread = adminStore.messageThreads.find((item) => item.id === req.params.id);
  const thread = baseThread ? resolveScopedParentThread(req.user, baseThread, childId) : null;
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (!canAccessThread(req.user, thread)) {
    return res.status(403).json({ message: 'You do not have access to this thread.' });
  }

  const userId = String(req.user?.sub || '');
  if (req.user?.role !== 'admin' && thread.createdByUserId !== userId) {
    return res.status(403).json({ message: 'Only the thread creator can delete this thread.' });
  }

  adminStore.messageThreads = adminStore.messageThreads.filter((item) => item.id !== thread.id);
  adminStore.messages = adminStore.messages.filter((item) => item.threadId !== thread.id);

  return res.json({ message: 'Thread deleted.' });
});

export default messagesRouter;
