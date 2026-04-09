import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listStudents } from '../repositories/studentRepository.js';
import { listTeachers } from '../repositories/teacherRepository.js';
import { listUsersByRole } from '../repositories/userRepository.js';
import { sendAdminNotificationEmail } from '../utils/mailer.js';
import { findTeacherByUser } from '../utils/portalScope.js';

const notificationsRouter = Router();

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function uniqueRecipients(items = []) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const email = normalize(item.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    unique.push({
      ...item,
      email
    });
  }

  return unique;
}

async function resolveRecipients(roleTarget) {
  if (roleTarget === 'student') {
    const students = await listStudents();
    return uniqueRecipients(
      students.map((student) => ({
        name: student.fullName || student.guardianName || 'Student',
        email: student.studentEmail || student.guardianEmail || student.parentPortalEmail || student.portalEmail,
        roleLabel: 'Student'
      }))
    );
  }

  if (roleTarget === 'teacher') {
    const teachers = await listTeachers();
    return uniqueRecipients(
      teachers.map((teacher) => ({
        name: teacher.fullName || 'Teacher',
        email: teacher.email || teacher.portalEmail,
        roleLabel: 'Teacher'
      }))
    );
  }

  if (roleTarget === 'all') {
    const [admins, admissionsUsers, parents, teachers, students] = await Promise.all([
      listUsersByRole('admin'),
      listUsersByRole('admissions'),
      listUsersByRole('parent'),
      listTeachers(),
      listStudents()
    ]);

    return uniqueRecipients([
      ...admins.map((user) => ({
        name: user.fullName || 'Admin',
        email: user.email,
        roleLabel: user.role
      })),
      ...admissionsUsers.map((user) => ({
        name: user.fullName || 'Admissions',
        email: user.email,
        roleLabel: user.role
      })),
      ...parents.map((user) => ({
        name: user.fullName || 'Parent',
        email: user.email,
        roleLabel: user.role
      })),
      ...teachers.map((teacher) => ({
        name: teacher.fullName || 'Teacher',
        email: teacher.email || teacher.portalEmail,
        roleLabel: 'Teacher'
      })),
      ...students.map((student) => ({
        name: student.fullName || student.guardianName || 'Student',
        email: student.studentEmail || student.guardianEmail || student.parentPortalEmail || student.portalEmail,
        roleLabel: 'Student'
      }))
    ]);
  }

  const usersByRole = await Promise.all([listUsersByRole(roleTarget)]);
  return uniqueRecipients(
    usersByRole
      .flat()
      .map((user) => ({
        name: user.fullName || 'Portal user',
        email: user.email,
        roleLabel: user.role
      }))
  );
}

function resolveTeachersForClass(classId) {
  if (!classId) return [];
  const assignments = adminStore.teacherAssignments.filter((item) => item.classId === classId);
  const teacherIds = [...new Set(assignments.map((item) => item.teacherId))];
  return teacherIds
    .map((teacherId) => adminStore.teachers.find((teacher) => teacher.id === teacherId))
    .filter(Boolean)
    .map((teacher) => ({
      name: teacher.fullName || 'Teacher',
      email: teacher.email || teacher.portalEmail || '',
      roleLabel: 'Teacher',
      teacherId: teacher.id
    }))
    .filter((item) => item.email);
}

notificationsRouter.get('/me', requireAuth, (req, res) => {
  const role = req.user?.role;
  const userId = String(req.user?.sub || '');
  const email = normalize(req.user?.email);
  const teacher = role === 'teacher' ? findTeacherByUser(req.user) : null;
  const notifications = adminStore.notifications.filter(
    (item) => {
      const hasSpecificRecipient = Boolean(item.recipientUserId || item.recipientEmail || item.recipientPhone);
      if (item.recipientUserId && item.recipientUserId === userId) return true;
      if (item.recipientEmail && normalize(item.recipientEmail) === email) return true;
      if (role === 'teacher' && item.teacherId && teacher?.id && item.teacherId === teacher.id) return true;
      if (role === 'teacher' && item.classId && teacher?.id) {
        return adminStore.teacherAssignments.some(
          (assignment) => assignment.teacherId === teacher.id && assignment.classId === item.classId
        );
      }
      if (!hasSpecificRecipient && (item.roleTarget === 'all' || item.roleTarget === role)) return true;
      return false;
    }
  );

  return res.json({ notifications });
});

notificationsRouter.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  const notifications = [...(adminStore.notifications || [])].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  return res.json({ notifications });
});

notificationsRouter.post('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const roleTarget = String(req.body?.roleTarget || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const teacherId = String(req.body?.teacherId || '').trim();
  const recipientEmail = String(req.body?.recipientEmail || '').trim();
  if (!title || !message || !roleTarget) {
    return res.status(400).json({ message: 'title, message, roleTarget are required.' });
  }

  const allowedTargets = ['all', 'admin', 'teacher', 'student', 'parent'];
  if (!allowedTargets.includes(roleTarget)) {
    return res.status(400).json({ message: 'Invalid roleTarget.' });
  }

  if ((classId || teacherId) && roleTarget !== 'teacher') {
    return res.status(400).json({ message: 'classId or teacherId can only be used with roleTarget=teacher.' });
  }

  if (classId && teacherId) {
    return res.status(400).json({ message: 'Use either classId or teacherId for teacher notifications, not both.' });
  }

  if (recipientEmail && (classId || teacherId)) {
    return res.status(400).json({ message: 'Direct email notifications cannot also target a teacher or class.' });
  }

  if (recipientEmail && !isValidEmail(recipientEmail)) {
    return res.status(400).json({ message: 'A valid recipientEmail is required for direct notifications.' });
  }

  if (teacherId && !adminStore.teachers.some((item) => item.id === teacherId)) {
    return res.status(400).json({ message: 'Invalid teacherId.' });
  }

  if (classId && !adminStore.classes.some((item) => item.id === classId)) {
    return res.status(400).json({ message: 'Invalid classId.' });
  }

  if (classId && !resolveTeachersForClass(classId).length) {
    return res.status(400).json({ message: 'No teacher assignments exist for the selected class.' });
  }

  let recipients = [];
  if (recipientEmail) {
    recipients = uniqueRecipients([{ name: 'Recipient', email: recipientEmail, roleLabel: 'Direct' }]);
  } else if (teacherId) {
    const teacher = adminStore.teachers.find((item) => item.id === teacherId);
    recipients = uniqueRecipients([
      {
        name: teacher?.fullName || 'Teacher',
        email: teacher?.email || teacher?.portalEmail || '',
        roleLabel: 'Teacher'
      }
    ]);
  } else if (classId) {
    recipients = uniqueRecipients(resolveTeachersForClass(classId));
  } else {
    recipients = await resolveRecipients(roleTarget);
  }
  if (!recipients.length) {
    return res.status(400).json({ message: 'No deliverable recipients were found for this notification target.' });
  }

  const notification = {
    id: makeId('ntf'),
    title,
    message,
    roleTarget,
    recipientUserId: '',
    recipientEmail: recipientEmail || '',
    recipientPhone: '',
    classId: classId || '',
    teacherId: teacherId || '',
    createdAt: new Date().toISOString()
  };

  adminStore.notifications.unshift(notification);

  const deliveryResults = await Promise.allSettled(
    recipients.map((recipient) =>
      sendAdminNotificationEmail({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        title,
        message,
        roleLabel: recipient.roleLabel
      })
    )
  );

  const delivery = deliveryResults.reduce(
    (summary, result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'sent') summary.sent += 1;
        else summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.failures.push({
          email: recipients[index]?.email || '',
          reason: result.reason?.message || 'Email delivery failed.'
        });
      }
      return summary;
    },
    { attempted: recipients.length, sent: 0, skipped: 0, failed: 0, failures: [] }
  );

  return res.status(201).json({ notification, delivery });
});

notificationsRouter.delete('/admin/:id', requireAuth, requireRole('admin'), (req, res) => {
  const index = adminStore.notifications.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Notification not found.' });
  adminStore.notifications.splice(index, 1);
  return res.json({ message: 'Notification deleted.' });
});

export default notificationsRouter;
