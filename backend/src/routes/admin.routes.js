import { Router } from 'express';
import { env } from '../config/env.js';
import { addActivityLog, adminStore, makeId, reloadAdminStoreFromDatabase, saveStoreToDatabase } from '../data/adminStore.js';
import { withTransaction } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { countStudentsByClassIds, createClass, deleteClassById, findClassById, listClasses, updateClass } from '../repositories/classRepository.js';
import { activateAcademicSession, createAcademicSession, ensureActiveAcademicSession, listAcademicSessions } from '../repositories/academicSessionRepository.js';
import { listStudentEnrollments, upsertStudentEnrollment } from '../repositories/studentEnrollmentRepository.js';
import { deleteStudentById, findStudentById, listStudents, updateStudent } from '../repositories/studentRepository.js';
import { createSubject, deleteSubjectById, findSubjectById, listSubjects, updateSubject } from '../repositories/subjectRepository.js';
import { createTeacherAssignment, deleteTeacherAssignmentById, findTeacherAssignmentById, listTeacherAssignments, updateTeacherAssignment } from '../repositories/teacherAssignmentRepository.js';
import { createTeacher, deleteTeacherById, findTeacherByEmail, findTeacherById, listTeachers, updateTeacher } from '../repositories/teacherRepository.js';
import { createUser, deleteUserById, findUserByEmail, findUserById, listUsersByRole, updateUserPassword, updateUserProfile } from '../repositories/userRepository.js';
import {
  createProvisionedStudentRecord,
  resolveStudentRegistrationInput,
  updateProvisionedStudentRecord
} from '../services/studentRegistrationService.js';
import {
  deliverProvisioningCredentials as deliverProvisioningCredentialsInline,
  summarizeCredentialDelivery
} from '../services/credentialDeliveryService.js';
import { listActivityLogs } from '../repositories/activityLogRepository.js';
import { sendAdminNotificationEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import { generateTemporaryPassword, hashPassword } from '../utils/passwords.js';
import { normalizeAdmissionPeriod } from '../utils/admissionPeriod.js';
import {
  computeAcademicOrder,
  describePromotionStep,
  getNextTerm,
  isSessionRolloverTerm,
  normalizeTerm,
  resolveNextClass
} from '../utils/academicProgression.js';
import { normalizeInstitution } from '../utils/institution.js';
import {
  findMatchingStudentForAdmission,
  hasProvisionedStudentPortal,
  normalizeStudentAccountStatus
} from '../utils/studentLifecycle.js';
import {
  createBulkStudentUploadSession,
  getBulkStudentUploadSession,
  listBulkStudentUploadSessions,
  clearBulkStudentUploadSessions
} from '../repositories/bulkUploadRepository.js';
import { countFinalResultsForSessionTerm } from '../repositories/subjectResultRepository.js';

const adminRouter = Router();
const PORTAL_EMAIL_DOMAIN = 'portal.attaufiqschools.com';
const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

adminRouter.use(requireAuth, requireRole('admin'));

function getInstitutionFilter(req) {
  return req.query.institution ? String(req.query.institution) : '';
}

function appendNotification({ title, message, roleTarget = 'all', recipientEmail = '', recipientPhone = '', meta = {} }) {
  adminStore.notifications.unshift({
    id: makeId('ntf'),
    title,
    message,
    roleTarget,
    recipientUserId: String(meta.recipientUserId || ''),
    recipientEmail,
    recipientPhone,
    meta,
    createdAt: new Date().toISOString()
  });
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

function validateAdmissionPeriodConfig(period = {}) {
  const programs = period.programs && typeof period.programs === 'object' ? period.programs : {};
  const windows = [
    { key: 'modern', label: 'ATTAUFEEQ Model Academy', ...programs.modern },
    { key: 'madrasa', label: 'Madrastul ATTAUFEEQ', ...programs.madrasa },
    { key: 'memorization', label: 'Quran Memorization', ...programs.memorization }
  ];
  const activeWindows = [];

  for (const window of windows) {
    const startDate = String(window.startDate || '').trim();
    const endDate = String(window.endDate || '').trim();
    const start = startDate ? new Date(startDate).getTime() : null;
    const end = endDate ? new Date(endDate).getTime() : null;

    if (start != null && Number.isNaN(start)) {
      return `${window.label} start date must be a valid date.`;
    }
    if (end != null && Number.isNaN(end)) {
      return `${window.label} end date must be a valid date.`;
    }
    if (start != null && end != null && start > end) {
      return `${window.label} start date must be before its end date.`;
    }

    if (period.enabled !== false && window.enabled !== false) {
      activeWindows.push(window);
    }
  }

  if (activeWindows.length > 1) {
    return 'Only one admission window can stay active at a time. Disable the other programs before saving.';
  }

  return '';
}

function replaceStoreRecord(collectionName, record) {
  const rows = adminStore[collectionName];
  const index = rows.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    rows[index] = record;
  } else {
    rows.unshift(record);
  }
}

function removeStoreRecord(collectionName, id) {
  adminStore[collectionName] = adminStore[collectionName].filter((item) => item.id !== id);
}

function ensureTeacherCanBeDeleted(teacherId) {
  if (adminStore.timetableEntries.some((item) => item.teacherId === teacherId)) {
    return 'Remove timetable entries linked to this teacher before deletion.';
  }
  if (adminStore.attendanceRecords.some((item) => item.teacherId === teacherId)) {
    return 'Remove attendance records linked to this teacher before deletion.';
  }
  return '';
}

function ensureClassCanBeDeleted(classId) {
  if (adminStore.students.some((item) => item.classId === classId)) {
    return 'Move or delete students in this class before deletion.';
  }
  if ((adminStore.studentEnrollments || []).some((item) => item.classId === classId)) {
    return 'Clear session enrollments linked to this class before deletion.';
  }
  if (adminStore.results.some((item) => item.classId === classId)) {
    return 'Delete result records linked to this class before deletion.';
  }
  if (adminStore.feePlans.some((item) => item.classId === classId)) {
    return 'Delete fee plans linked to this class before deletion.';
  }
  if (adminStore.timetableEntries.some((item) => item.classId === classId)) {
    return 'Delete timetable entries linked to this class before deletion.';
  }
  if (adminStore.attendanceRecords.some((item) => item.classId === classId)) {
    return 'Delete attendance records linked to this class before deletion.';
  }
  if ((adminStore.libraryBooks || []).some((item) => item.classId === classId)) {
    return 'Delete library books linked to this class before deletion.';
  }
  return '';
}

function ensureSubjectCanBeDeleted(subjectId) {
  if (adminStore.results.some((item) => item.subjectId === subjectId)) {
    return 'Delete result records linked to this subject before deletion.';
  }
  if (adminStore.timetableEntries.some((item) => item.subjectId === subjectId)) {
    return 'Delete timetable entries linked to this subject before deletion.';
  }
  if (adminStore.attendanceRecords.some((item) => item.subjectId === subjectId)) {
    return 'Delete attendance records linked to this subject before deletion.';
  }
  return '';
}

function removeStudentDependents(studentId) {
  const issuedBooks = adminStore.libraryIssues.filter(
    (issue) => issue.studentId === studentId && issue.status === 'issued'
  );

  adminStore.studentEnrollments = (adminStore.studentEnrollments || []).filter((item) => item.studentId !== studentId);
  adminStore.results = adminStore.results.filter((item) => item.studentId !== studentId);
  adminStore.payments = adminStore.payments.filter((item) => item.studentId !== studentId);
  adminStore.attendanceRecords = adminStore.attendanceRecords.filter((item) => item.studentId !== studentId);
  adminStore.madrasaRecords = adminStore.madrasaRecords.filter((item) => item.studentId !== studentId);
  adminStore.libraryIssues = adminStore.libraryIssues.filter((item) => item.studentId !== studentId);
  adminStore.admissions = adminStore.admissions.map((item) =>
    item.promotedStudentId === studentId
      ? { ...item, promotedStudentId: '', promotedAt: '' }
      : item
  );
  adminStore.messageThreads = adminStore.messageThreads.filter((item) => item.contextStudentId !== studentId);
  const activeThreadIds = new Set(adminStore.messageThreads.map((item) => item.id));
  adminStore.messages = adminStore.messages.filter((item) => activeThreadIds.has(item.threadId));

  issuedBooks.forEach((issue) => {
    const book = adminStore.libraryBooks.find((item) => item.id === issue.bookId);
    if (book) {
      book.availableCopies = Math.min(book.totalCopies, Number(book.availableCopies || 0) + 1);
    }
  });
}

function appendAdmissionHistory(admission, action, detail) {
  const history = Array.isArray(admission.workflowHistory) ? admission.workflowHistory : [];
  return [
    {
      id: makeId('admwf'),
      action,
      detail,
      createdAt: new Date().toISOString()
    },
    ...history
  ];
}

function resolveAdmissionProgram(admission) {
  if (admission?.program) return admission.program;
  const normalized = String(admission?.institution || '').toLowerCase();
  if (normalized.includes('memor')) return 'memorization';
  if (normalized.includes('madr')) return 'madrasa';
  return 'modern';
}

function normalizePaymentStatus(value) {
  if (value === 'confirmed') return 'confirmed';
  return 'pending';
}

function normalizeLowerText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildAdmissionApprovalNotice(admission) {
  const institution = String(admission?.institution || 'ATTAUFEEQ Model Academy').trim();
  return {
    title: 'Admission approved',
    message: `Your application for ${institution} has been approved. Please come to the school to complete the necessary payment and remaining enrollment requirements before the student can be fully enrolled.`
  };
}

async function deliverAdmissionApprovalNotifications(admission) {
  const notice = buildAdmissionApprovalNotice(admission);
  const recipients = [
    {
      email: String(admission?.email || '').trim(),
      name: admission?.guardianName || admission?.fullName || 'Guardian',
      roleLabel: 'Guardian'
    },
    {
      email: String(admission?.studentEmail || '').trim(),
      name: admission?.fullName || 'Student',
      roleLabel: 'Student'
    }
  ].filter((recipient) => recipient.email);

  const uniqueRecipients = recipients.filter(
    (recipient, index, items) => items.findIndex((candidate) => candidate.email.toLowerCase() === recipient.email.toLowerCase()) === index
  );

  const settled = await Promise.allSettled(
    uniqueRecipients.map((recipient) =>
      sendAdminNotificationEmail({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        title: notice.title,
        message: notice.message,
        roleLabel: recipient.roleLabel
      })
    )
  );

  return settled.reduce(
    (summary, result, index) => {
      summary.attempted += 1;
      if (result.status === 'fulfilled') {
        const status = result.value?.status || 'skipped';
        if (status === 'sent') summary.sent += 1;
        else if (status === 'disabled') summary.disabled += 1;
        else summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.failures.push({
          email: uniqueRecipients[index]?.email || '',
          reason: result.reason?.message || 'Email delivery failed.'
        });
      }
      return summary;
    },
    { attempted: 0, sent: 0, skipped: 0, disabled: 0, failed: 0, failures: [] }
  );
}

function formatInterviewSchedule(interviewDate, interviewMode) {
  const parsed = new Date(interviewDate);
  const formattedDate = Number.isNaN(parsed.getTime())
    ? interviewDate
    : parsed.toLocaleString('en-NG', {
        dateStyle: 'full',
        timeStyle: 'short'
      });

  return {
    formattedDate,
    message: `Your admission interview has been scheduled for ${formattedDate} via ${interviewMode}. Please keep this appointment and contact the school if you need any clarification.`
  };
}

function slugify(value, fallback = 'user') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return normalized || fallback;
}

function isValidEmail(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function institutionAlias(institution) {
  const normalized = String(institution || '').toLowerCase();
  if (normalized.includes('memor')) return 'memorization';
  if (normalized.includes('madr')) return 'madrasa';
  return 'modern';
}

async function generatePortalEmail({ fullName, role, institution }) {
  const localBase = `${slugify(fullName, role)}.${role}.${institutionAlias(institution)}`;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = attempt === 0 ? '' : `${100 + attempt}`;
    const candidate = `${localBase}${suffix}@${PORTAL_EMAIL_DOMAIN}`;
    const existing = await findUserByEmail(candidate);
    if (!existing) return candidate;
  }

  return `${role}.${Date.now()}@${PORTAL_EMAIL_DOMAIN}`;
}

function serializeCredential(result, label, options = {}) {
  if (!result?.user) return null;

  return {
    label,
    userId: result.user.id,
    fullName: options.fullName || result.user.fullName,
    recipientName: options.recipientName || result.user.fullName,
    recipientEmail: options.recipientEmail || '',
    role: result.user.role,
    email: result.user.email,
    password: result.temporaryPassword || '',
    mustChangePassword: Boolean(result.user.mustChangePassword),
    reused: Boolean(result.reused)
  };
}

async function rollbackProvisionedCredentials(credentials = []) {
  const seen = new Set();

  for (const credential of credentials) {
    if (!credential?.userId || credential.reused || !credential.password || seen.has(credential.userId)) continue;
    seen.add(credential.userId);
    await deleteUserById(credential.userId);
  }
}

async function deliverProvisioningCredentials(credentials = [], institution = '') {
  return deliverProvisioningCredentialsInline(credentials, institution);
}

async function provisionPortalAccount({ role, fullName, institution, preferredEmail = '', allowExisting = false }, options = {}) {
  const normalizedEmail = String(preferredEmail || '').trim().toLowerCase();

  if (normalizedEmail) {
    const existing = await findUserByEmail(normalizedEmail, options);

    if (existing) {
      if (allowExisting && existing.role === role) {
        return { user: existing, temporaryPassword: '', reused: true };
      }

      throw new Error(`A ${existing.role} account already exists for ${normalizedEmail}.`);
    }
  }

  const email = normalizedEmail || await generatePortalEmail({ fullName, role, institution });
  const temporaryPassword = generateTemporaryPassword();
  const user = await createUser({
    fullName: String(fullName || '').trim(),
    email,
    passwordHash: await hashPassword(temporaryPassword),
    role,
    mustChangePassword: true
  }, options);

  return { user, temporaryPassword, reused: false };
}

async function syncProvisionedUser(userId, { fullName, email }, options = {}) {
  if (!userId) return null;

  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  if (normalizedEmail) {
    const existing = await findUserByEmail(normalizedEmail, options);
    if (existing && existing.id !== userId) {
      throw new Error(`Portal email ${normalizedEmail} is already assigned to another account.`);
    }
  }

  const updated = await updateUserProfile(userId, {
    fullName: fullName ? String(fullName).trim() : undefined,
    email: normalizedEmail || undefined
  }, options);

  if (!updated) {
    throw new Error(`Linked portal account ${userId} no longer exists.`);
  }

  return updated;
}

function classLabel(classItem) {
  return classItem ? `${classItem.name} ${classItem.arm}` : '';
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isPromotionEligibleStatus(status) {
  return ['pending', 'provisioned', 'active'].includes(normalizeStatus(status));
}

function buildAutoPromotionMap(classes = []) {
  const byInstitution = classes.reduce((acc, item) => {
    const institution = item.institution || 'Unknown';
    acc[institution] = acc[institution] || [];
    acc[institution].push(item);
    return acc;
  }, {});

  const map = new Map();

  Object.values(byInstitution).forEach((group) => {
    const ranked = group
      .map((item) => ({ item, order: computeAcademicOrder(item) }))
      .filter((entry) => Number.isFinite(entry.order))
      .sort((a, b) => a.order - b.order || String(a.item.arm).localeCompare(String(b.item.arm)));

    ranked.forEach(({ item }) => {
      const { nextClass } = resolveNextClass(item, group);
      if (nextClass?.id) {
        map.set(item.id, nextClass.id);
      }
    });
  });

  return map;
}

function buildPromotionRecommendationMap(sessionId = '', term = '') {
  if (!sessionId || !term) return new Map();
  const recommendations = adminStore.promotionRecommendations || [];
  const filtered = recommendations.filter((entry) => entry.sessionId === sessionId && entry.term === term);
  const map = new Map();
  filtered.forEach((entry) => {
    (entry.decisions || []).forEach((decision) => {
      if (!decision?.studentId) return;
      map.set(decision.studentId, {
        action: String(decision.action || 'promote').toLowerCase(),
        teacherId: entry.teacherId,
        teacherName: entry.teacherName || '',
        classId: entry.classId || ''
      });
    });
  });
  return map;
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

function enrichStudent(student) {
  const activeSessionId = getActiveSessionId();
  const enrollmentClassId = resolveEnrollmentClassId(student.id, activeSessionId);
  const classId = enrollmentClassId || student.classId;
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return {
    ...student,
    classId,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : student.level || '',
    institution: classItem?.institution || student.institution || ''
  };
}

function enrichTeacher(teacher) {
  return {
    ...teacher,
    portalEmail: teacher.portalEmail || teacher.email || '',
    accountStatus: teacher.userId ? 'provisioned' : 'pending'
  };
}

function enrichAssignment(assignment) {
  const teacher = adminStore.teachers.find((item) => item.id === assignment.teacherId);
  const classItem = adminStore.classes.find((item) => item.id === assignment.classId);
  const subject = adminStore.subjects.find((item) => item.id === assignment.subjectId);
  const institution = classItem?.institution || subject?.institution || teacher?.institution || '';

  return {
    ...assignment,
    institution,
    teacherName: teacher?.fullName || assignment.teacherId,
    classLabel: classLabel(classItem) || assignment.classId,
    subjectName: subject?.name || assignment.subjectId
  };
}

function enrichAdmission(admission) {
  const classItem = adminStore.classes.find((item) => item.id === admission.classId);
  return {
    ...admission,
    program: resolveAdmissionProgram(admission),
    classLabel: classLabel(classItem) || admission.level || '',
    paymentStatus: normalizePaymentStatus(admission.paymentStatus),
    paymentConfirmedAt: admission.paymentConfirmedAt || '',
    portalDeliveryStatus: admission.portalDeliveryStatus || '',
    portalDeliveryAt: admission.portalDeliveryAt || '',
    portalDeliverySummary: admission.portalDeliverySummary || null,
    portalDeliveryNotes: admission.portalDeliveryNotes || '',
    portalDelivery: Array.isArray(admission.portalDelivery) ? admission.portalDelivery : [],
    documents: Array.isArray(admission.documents) ? admission.documents : [],
    workflowHistory: Array.isArray(admission.workflowHistory) ? admission.workflowHistory : []
  };
}

function shouldArchiveAdmission(admission) {
  return Boolean(admission);
}

function shouldDeleteAdmission(admission) {
  return admission?.status === 'rejected';
}

function buildAdmissionArchive(admission, reason = '') {
  return {
    id: makeId('adm-archive'),
    admissionId: admission.id,
    program: resolveAdmissionProgram(admission),
    fullName: admission.fullName,
    guardianName: admission.guardianName,
    phone: admission.phone,
    email: admission.email,
    studentEmail: admission.studentEmail || '',
    classId: admission.classId,
    classLabel: admission.level || '',
    institution: admission.institution,
    status: admission.status,
    verificationStatus: admission.verificationStatus || 'pending',
    paymentStatus: normalizePaymentStatus(admission.paymentStatus),
    paymentConfirmedAt: admission.paymentConfirmedAt || '',
    portalDeliveryStatus: admission.portalDeliveryStatus || '',
    portalDeliveryAt: admission.portalDeliveryAt || '',
    portalDeliverySummary: admission.portalDeliverySummary || null,
    promotedStudentId: admission.promotedStudentId || '',
    promotedAt: admission.promotedAt || '',
    reason,
    submittedAt: admission.submittedAt || '',
    archivedAt: new Date().toISOString()
  };
}

function finalizeAdmission(admissionIndex, reason = '') {
  const admission = adminStore.admissions[admissionIndex];
  if (!admission) return { deleted: false, archived: null };

  let archived = null;
  if (shouldArchiveAdmission(admission)) {
    archived = buildAdmissionArchive(admission, reason);
    adminStore.admissionArchive = adminStore.admissionArchive || [];
    adminStore.admissionArchive.unshift(archived);
  }

  adminStore.admissions.splice(admissionIndex, 1);
  return { deleted: true, archived };
}

function findStudentByAccount(userId, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  return adminStore.students.find((student) => {
    if (userId && (student.userId === userId || student.parentUserId === userId)) {
      return true;
    }

    return [
      student.portalEmail,
      student.studentEmail,
      student.parentPortalEmail,
      student.guardianEmail
    ].some((value) => String(value || '').trim().toLowerCase() === normalizedEmail);
  }) || null;
}

function findTeacherByAccount(userId, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  return adminStore.teachers.find((teacher) => {
    if (userId && teacher.userId === userId) return true;
    return [teacher.portalEmail, teacher.email].some(
      (value) => String(value || '').trim().toLowerCase() === normalizedEmail
    );
  }) || null;
}

function resolvePasswordResetContact(user) {
  if (!user) {
    return {
      recipientEmail: '',
      recipientName: '',
      institution: '',
      label: ''
    };
  }

  if (user.role === 'teacher') {
    const teacher = findTeacherByAccount(user.id, user.email);
    return {
      recipientEmail: teacher?.email || user.email || '',
      recipientName: teacher?.fullName || user.fullName || '',
      institution: teacher?.institution || '',
      label: 'Teacher portal'
    };
  }

  if (user.role === 'student') {
    const student = findStudentByAccount(user.id, user.email);
    return {
      recipientEmail: student?.studentEmail || student?.guardianEmail || '',
      recipientName: student?.fullName || user.fullName || '',
      institution: student?.institution || '',
      label: 'Student portal'
    };
  }

  if (user.role === 'parent') {
    const student = findStudentByAccount(user.id, user.email);
    return {
      recipientEmail: student?.guardianEmail || user.email || '',
      recipientName: student?.guardianName || user.fullName || '',
      institution: student?.institution || '',
      label: 'Parent portal'
    };
  }

  return {
    recipientEmail: user.email || '',
    recipientName: user.fullName || '',
    institution: '',
    label: `${user.role} portal`
  };
}

async function resolveStudentInput(payload) {
  return resolveStudentRegistrationInput(payload);
}

function buildAuditContext(req, statusCode = 200) {
  return {
    actorRole: req.user?.role || 'anonymous',
    actorEmail: req.user?.email || 'anonymous',
    ip: req.ip || req.socket?.remoteAddress || 'unknown',
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode
  };
}

function admissionQualifiesForFullAdmission(admission) {
  return Boolean(
    admission
    && admission.status === 'approved'
    && (admission.verificationStatus || 'pending') === 'verified'
    && (admission.paymentStatus || 'pending') === 'confirmed'
    && String(admission.studentEmail || '').trim()
    && (!env.mailEnabled || String(admission.email || '').trim())
    && !admission.promotedStudentId
  );
}

async function promoteQualifiedAdmission({ admissionIndex = -1, archiveIndex = -1, auditContext } = {}) {
  const fromArchive = admissionIndex === -1 && archiveIndex >= 0;
  const admission = admissionIndex >= 0
    ? adminStore.admissions[admissionIndex]
    : adminStore.admissionArchive[archiveIndex];

  if (!admission || admission.promotedStudentId) {
    return { promoted: false, student: null, credentials: [], deleted: false, archived: null };
  }

  const provisionalStudent = {
    id: makeId('stu'),
    fullName: admission.fullName,
    classId: admission.classId || '',
    level: admission.level,
    institution: admission.institution,
    studentEmail: admission.studentEmail || '',
    guardianName: admission.guardianName || '',
    guardianPhone: admission.phone || '',
    guardianEmail: admission.email || ''
  };

  const { storedStudent, deliveredCredentials } = await createProvisionedStudentRecord(
    provisionalStudent,
    { auditContext }
  );
  replaceStoreRecord('students', storedStudent);

  const promotedAt = new Date().toISOString();
  const deliverySummary = summarizeCredentialDelivery(deliveredCredentials);
  const portalDeliveryAt = new Date().toISOString();

  let archivedRecord = null;
  let deleted = false;

  if (fromArchive) {
    adminStore.admissionArchive[archiveIndex] = {
      ...adminStore.admissionArchive[archiveIndex],
      promotedStudentId: storedStudent.id,
      promotedAt,
      portalDeliveryStatus: deliverySummary.status,
      portalDeliveryAt,
      portalDeliverySummary: deliverySummary,
      portalDelivery: deliveredCredentials
    };
    archivedRecord = adminStore.admissionArchive[archiveIndex];
  } else {
    adminStore.admissions[admissionIndex] = {
      ...admission,
      promotedStudentId: storedStudent.id,
      promotedAt,
      portalDeliveryStatus: deliverySummary.status,
      portalDeliveryAt,
      portalDeliverySummary: deliverySummary,
      portalDelivery: deliveredCredentials,
      workflowHistory: appendAdmissionHistory(
        admission,
        'admission.promoted',
        `Admission promoted to student record ${storedStudent.id} with portal access provisioned.`
      )
    };

    const finalized = finalizeAdmission(admissionIndex, 'promoted');
    archivedRecord = finalized.archived || null;
    deleted = finalized.deleted;
  }

  return {
    promoted: true,
    student: storedStudent,
    credentials: deliveredCredentials,
    deleted,
    archived: archivedRecord
  };
}

function buildStudentRegistrationPayload(student) {
  return {
    fullName: student.fullName,
    classId: student.classId || '',
    level: student.level || '',
    institution: student.institution || '',
    studentEmail: student.studentEmail || '',
    guardianName: student.guardianName || '',
    guardianPhone: student.guardianPhone || '',
    guardianEmail: student.guardianEmail || ''
  };
}

function buildAdmissionPortalDeliverySnapshot(student) {
  return {
    promotedStudentId: student.id,
    promotedAt: new Date().toISOString(),
    portalDeliveryStatus: hasProvisionedStudentPortal(student) ? 'confirmed' : 'pending',
    portalDeliveryAt: hasProvisionedStudentPortal(student) ? new Date().toISOString() : '',
    portalDeliverySummary: hasProvisionedStudentPortal(student)
      ? { status: 'confirmed', deliveredCount: 0, emailSentCount: 0, pendingCount: 0, failedCount: 0 }
      : null
  };
}

async function reconcileAdmissionsAndStudents({ dryRun = false, forceInlineDelivery = false, auditContext } = {}) {
  const report = {
    dryRun: Boolean(dryRun),
    studentsScanned: adminStore.students.length,
    studentsPortalRepaired: 0,
    studentsStatusNormalized: 0,
    admissionsScanned: adminStore.admissions.length,
    admissionsPromoted: 0,
    admissionsArchivedAfterLink: 0,
    archiveLinksRepaired: 0,
    credentialsQueued: 0,
    unresolvedAdmissions: []
  };

  for (const student of [...adminStore.students]) {
    const normalizedStatus = normalizeStudentAccountStatus(student.accountStatus);
    const shouldNormalizeStatus = hasProvisionedStudentPortal(student) && normalizedStatus === 'pending';
    const shouldRepairPortal = !hasProvisionedStudentPortal(student);

    if (!shouldNormalizeStatus && !shouldRepairPortal) {
      continue;
    }

    if (dryRun) {
      if (shouldNormalizeStatus) report.studentsStatusNormalized += 1;
      if (shouldRepairPortal) report.studentsPortalRepaired += 1;
      continue;
    }

    if (shouldRepairPortal) {
      const result = await updateProvisionedStudentRecord(
        student,
        buildStudentRegistrationPayload(student),
        {
          allowBrokenLinksRepair: true,
          forceInlineDelivery,
          auditContext
        }
      );
      replaceStoreRecord('students', result.storedStudent);
      report.studentsPortalRepaired += 1;
      report.credentialsQueued += (result.deliveredCredentials || []).length;
      continue;
    }

    const updatedStudent = await updateStudent(student.id, {
      ...student,
      accountStatus: 'provisioned'
    });
    if (updatedStudent) {
      replaceStoreRecord('students', updatedStudent);
      report.studentsStatusNormalized += 1;
    }
  }

  for (let admissionIndex = adminStore.admissions.length - 1; admissionIndex >= 0; admissionIndex -= 1) {
    const admission = adminStore.admissions[admissionIndex];
    if (!admission) continue;

    const linkedStudent = findMatchingStudentForAdmission(admission, adminStore.students);
    const qualifies = admissionQualifiesForFullAdmission(admission);

    if (linkedStudent) {
      if (dryRun) {
        report.admissionsArchivedAfterLink += 1;
        continue;
      }

      adminStore.admissions[admissionIndex] = {
        ...admission,
        ...buildAdmissionPortalDeliverySnapshot(linkedStudent),
        workflowHistory: appendAdmissionHistory(
          admission,
          'admission.reconciled',
          `Legacy admission was linked to existing student record ${linkedStudent.id} during reconciliation.`
        )
      };

      finalizeAdmission(admissionIndex, 'promoted');
      report.admissionsArchivedAfterLink += 1;
      continue;
    }

    if (!qualifies) {
      if (
        admission.status === 'approved'
        && (admission.verificationStatus || 'pending') === 'verified'
        && (admission.paymentStatus || 'pending') === 'confirmed'
      ) {
        report.unresolvedAdmissions.push({
          admissionId: admission.id,
          fullName: admission.fullName,
          institution: admission.institution,
          classId: admission.classId || '',
          reason: !String(admission.studentEmail || '').trim()
            ? 'missing_student_email'
            : (!env.mailEnabled || String(admission.email || '').trim())
              ? 'unknown'
              : 'missing_guardian_email'
        });
      }
      continue;
    }

    if (dryRun) {
      report.admissionsPromoted += 1;
      continue;
    }

    const result = await promoteQualifiedAdmission({
      admissionIndex,
      auditContext: {
        ...auditContext,
        statusCode: 201
      }
    });
    report.admissionsPromoted += 1;
    report.credentialsQueued += (result.credentials || []).length;
  }

  for (let archiveIndex = 0; archiveIndex < (adminStore.admissionArchive || []).length; archiveIndex += 1) {
    const record = adminStore.admissionArchive[archiveIndex];
    if (!record) continue;

    const linkedStudent = findMatchingStudentForAdmission(record, adminStore.students);
    if (!linkedStudent || record.promotedStudentId === linkedStudent.id) {
      continue;
    }

    if (dryRun) {
      report.archiveLinksRepaired += 1;
      continue;
    }

    adminStore.admissionArchive[archiveIndex] = {
      ...record,
      ...buildAdmissionPortalDeliverySnapshot(linkedStudent)
    };
    report.archiveLinksRepaired += 1;
  }

  return report;
}

adminRouter.get('/teachers', async (req, res) => {
  const institution = getInstitutionFilter(req);
  const search = String(req.query.q || '').trim();
  const sort = String(req.query.sort || '').trim();
  const teachers = await listTeachers({ institution, search, sort });

  return res.json({ teachers: teachers.map(enrichTeacher) });
});

adminRouter.post('/teachers', async (req, res) => {
  const { fullName, email, institution } = req.body || {};

  if (!fullName || !email || !institution) {
    return res.status(400).json({ message: 'fullName, email, institution are required.' });
  }

  const alreadyExists = await findTeacherByEmail(email);
  if (alreadyExists) {
    return res.status(409).json({ message: 'Teacher email already exists.' });
  }

  let account = null;
  try {
    account = await provisionPortalAccount({
      role: 'teacher',
      fullName,
      institution,
      preferredEmail: email
    });
    const deliveredCredentials = await deliverProvisioningCredentials(
      [
        serializeCredential(account, 'Teacher portal', {
          fullName,
          recipientName: fullName,
          recipientEmail: email
        })
      ],
      institution
    );

    const teacher = {
      id: makeId('tch'),
      fullName,
      email,
      institution,
      userId: account.user.id,
      portalEmail: account.user.email
    };

    const storedTeacher = await createTeacher(teacher);
    replaceStoreRecord('teachers', storedTeacher);
    return res.status(201).json({
      teacher: enrichTeacher(storedTeacher),
      credentials: deliveredCredentials[0] || null
    });
  } catch (error) {
    await rollbackProvisionedCredentials([
      serializeCredential(account, 'Teacher portal', {
        fullName,
        recipientName: fullName,
        recipientEmail: email
      })
    ]);
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Teacher email already exists.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to provision teacher account.' });
  }
});

adminRouter.put('/teachers/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, email, institution } = req.body || {};
  const current = await findTeacherById(id);

  if (!current) {
    return res.status(404).json({ message: 'Teacher not found.' });
  }

  if (!fullName || !email || !institution) {
    return res.status(400).json({ message: 'fullName, email, institution are required.' });
  }

  const duplicateEmail = await findTeacherByEmail(email);
  if (duplicateEmail && duplicateEmail.id !== id) {
    return res.status(409).json({ message: 'Teacher email already exists.' });
  }

  try {
    const nextTeacher = { ...current, id, fullName, email, institution };

    if (current.userId) {
      const updatedUser = await syncProvisionedUser(current.userId, { fullName, email });
      nextTeacher.portalEmail = updatedUser?.email || email;
    }

    const storedTeacher = await updateTeacher(id, nextTeacher);
    replaceStoreRecord('teachers', storedTeacher);
    return res.json({ teacher: enrichTeacher(storedTeacher) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Teacher email already exists.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to update teacher account.' });
  }
});

adminRouter.delete('/teachers/:id', async (req, res) => {
  const { id } = req.params;
  const teacher = await findTeacherById(id);

  if (!teacher) {
    return res.status(404).json({ message: 'Teacher not found.' });
  }

  const teacherDependencyError = ensureTeacherCanBeDeleted(id);
  if (teacherDependencyError) {
    return res.status(409).json({ message: teacherDependencyError });
  }

  if (teacher.userId) {
    await deleteUserById(teacher.userId);
  }

  await deleteTeacherById(id);
  removeStoreRecord('teachers', id);
  adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => item.teacherId !== id);
  adminStore.upcomingItems = (adminStore.upcomingItems || []).filter((item) => item.teacherId !== id);
  adminStore.notifications = (adminStore.notifications || []).filter((item) => item.teacherId !== id);
  return res.status(204).send();
});

adminRouter.get('/students', async (req, res) => {
  const institution = getInstitutionFilter(req);
  const classId = req.query.classId ? String(req.query.classId) : '';
  const status = req.query.status ? String(req.query.status).toLowerCase() : '';
  const search = String(req.query.q || '').trim();
  const sort = String(req.query.sort || '').trim();

  const students = (await listStudents({ institution, classId, status, search, sort })).map(enrichStudent);
  return res.json({ students });
});

adminRouter.post('/students', async (req, res) => {
  const normalized = await resolveStudentInput(req.body || {});
  if (normalized.error) {
    return res.status(400).json({ message: normalized.error });
  }

  try {
    const provisionalStudent = { id: makeId('stu'), ...normalized };
    const { storedStudent, deliveredCredentials } = await createProvisionedStudentRecord(
      provisionalStudent,
      { auditContext: buildAuditContext(req, 201) }
    );
    replaceStoreRecord('students', storedStudent);

    return res.status(201).json({
      message: 'Student registration completed successfully.',
      student: enrichStudent(storedStudent),
      registration: {
        studentId: storedStudent.id,
        userId: storedStudent.userId,
        parentUserId: storedStudent.parentUserId || '',
        accountStatus: storedStudent.accountStatus || 'provisioned'
      },
      credentials: deliveredCredentials
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Student record conflicts with an existing database record.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to provision student accounts.' });
  }
});

adminRouter.put('/students/:id', async (req, res) => {
  const { id } = req.params;
  const currentStudent = await findStudentById(id);

  if (!currentStudent) {
    return res.status(404).json({ message: 'Student not found.' });
  }

  const normalized = await resolveStudentInput(req.body || {});
  if (normalized.error) {
    return res.status(400).json({ message: normalized.error });
  }

  try {
    const { storedStudent, deliveredCredentials } = await updateProvisionedStudentRecord(
      currentStudent,
      normalized,
      { auditContext: buildAuditContext(req, 200) }
    );
    replaceStoreRecord('students', storedStudent);
    return res.json({
      message: 'Student registration updated successfully.',
      student: enrichStudent(storedStudent),
      registration: {
        studentId: storedStudent.id,
        userId: storedStudent.userId,
        parentUserId: storedStudent.parentUserId || '',
        accountStatus: storedStudent.accountStatus || 'provisioned'
      },
      credentials: deliveredCredentials
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Student record conflicts with an existing database record.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to update student accounts.' });
  }
});

adminRouter.post('/students/bulk', async (req, res) => {
  const rows = Array.isArray(req.body?.students) ? req.body.students : [];

  if (!rows.length) {
    return res.status(400).json({ message: 'students array is required.' });
  }

  const created = [];
  const errors = [];
  const credentials = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const normalized = await resolveStudentInput(row);
    if (normalized.error) {
      errors.push({ index, error: normalized.error, row });
      continue;
    }

    try {
      const provisionalStudent = { id: makeId('stu'), ...normalized };
      const { storedStudent, deliveredCredentials } = await createProvisionedStudentRecord(
        provisionalStudent,
        { auditContext: buildAuditContext(req, 201) }
      );
      replaceStoreRecord('students', storedStudent);
      created.push(enrichStudent(storedStudent));
      credentials.push(
        ...deliveredCredentials.map((item) => ({
          ...item,
          fullName: storedStudent.fullName
        }))
      );
    } catch (error) {
      errors.push({ index, error: error.message || 'Provisioning failed.', row });
    }
  }

  return res.status(201).json({
    message: 'Bulk student registration completed.',
    createdCount: created.length,
    errorCount: errors.length,
    created,
    errors,
    credentials
  });
});

adminRouter.get('/bulk-uploads/students', async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const offset = Number(req.query.offset || 0);

  try {
    const uploads = await listBulkStudentUploadSessions({ limit, offset });
    return res.json({ uploads });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load upload history.' });
  }
});

adminRouter.get('/bulk-uploads/students/:id', async (req, res) => {
  try {
    const upload = await getBulkStudentUploadSession(req.params.id);
    if (!upload) {
      return res.status(404).json({ message: 'Upload session not found.' });
    }
    return res.json({ upload });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load upload session.' });
  }
});

adminRouter.post('/bulk-uploads/students', async (req, res) => {
  const payload = req.body || {};
  try {
    const upload = await createBulkStudentUploadSession({
      createdByUserId: req.user?.id || '',
      createdByRole: req.user?.role || '',
      fileName: payload.fileName || '',
      totalRows: payload.totalRows,
      approvedRows: payload.approvedRows,
      validRows: payload.validRows,
      invalidRows: payload.invalidRows,
      duplicateRows: payload.duplicateRows,
      reportRows: payload.rows || []
    });
    return res.status(201).json({ upload });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to save upload history.' });
  }
});

adminRouter.delete('/bulk-uploads/students', async (_req, res) => {
  try {
    await clearBulkStudentUploadSessions();
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to clear upload history.' });
  }
});

adminRouter.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const student = await findStudentById(id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    await withTransaction(async (executor) => {
      await deleteStudentById(id, { executor });
      if (student.userId) {
        await deleteUserById(student.userId, { executor });
      }
    });

    removeStudentDependents(student.id);
    removeStoreRecord('students', id);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to delete student.' });
  }
});

adminRouter.get('/classes', async (req, res) => {
  const institution = getInstitutionFilter(req);
  const classes = await listClasses({ institution });
  const studentCounts = await countStudentsByClassIds(classes.map((item) => item.id));

  return res.json({
    classes: classes.map((item) => ({
      ...item,
      label: classLabel(item),
      studentCount: studentCounts.get(item.id) || 0
    }))
  });
});

adminRouter.post('/classes', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const arm = String(req.body?.arm || '').trim();
  const institution = String(req.body?.institution || '').trim();
  const { progressionOrder } = req.body || {};

  if (!name || !arm || !institution) {
    return res.status(400).json({ message: 'name, arm, institution are required.' });
  }

  try {
    const parsedOrder = progressionOrder === '' || progressionOrder === null || progressionOrder === undefined
      ? null
      : Number(progressionOrder);

    if (parsedOrder !== null && Number.isNaN(parsedOrder)) {
      return res.status(400).json({ message: 'progressionOrder must be a number.' });
    }

    const classItem = await createClass({
      id: makeId('cls'),
      name,
      arm,
      institution,
      progressionOrder: Number.isFinite(parsedOrder) ? parsedOrder : null
    });
    replaceStoreRecord('classes', classItem);
    return res.status(201).json({ class: classItem });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'This class already exists for the selected institution.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to create class.' });
  }
});

adminRouter.get('/academic-sessions', async (_req, res) => {
  const sessions = await listAcademicSessions();
  const activeSession = sessions.find((session) => session.isActive) || sessions[0] || null;
  return res.json({ sessions, activeSession });
});

adminRouter.post('/academic-sessions', async (req, res) => {
  const sessionName = String(req.body?.sessionName || '').trim();
  const startDate = String(req.body?.startDate || '').trim();
  const endDate = String(req.body?.endDate || '').trim();
  const isActive = req.body?.isActive ?? true;

  if (!sessionName) {
    return res.status(400).json({ message: 'sessionName is required.' });
  }
  if (startDate && Number.isNaN(new Date(startDate).getTime())) {
    return res.status(400).json({ message: 'startDate must be a valid date.' });
  }
  if (endDate && Number.isNaN(new Date(endDate).getTime())) {
    return res.status(400).json({ message: 'endDate must be a valid date.' });
  }

  const created = await createAcademicSession({
    id: makeId('ses'),
    sessionName,
    startDate,
    endDate,
    isActive: Boolean(isActive)
  });

  if (!created) {
    return res.status(400).json({ message: 'Unable to create academic session.' });
  }

  if (created.isActive) {
    await activateAcademicSession(created.id);
  }

  const sessions = await listAcademicSessions();
  const activeSession = sessions.find((session) => session.isActive) || sessions[0] || null;
  return res.status(201).json({ session: created, activeSession });
});

adminRouter.put('/academic-sessions/:id/activate', async (req, res) => {
  const session = await activateAcademicSession(req.params.id);
  if (!session) {
    return res.status(404).json({ message: 'Academic session not found.' });
  }

  return res.json({ session });
});

adminRouter.get('/terms/closures', async (req, res) => {
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  const termClosures = Array.isArray(adminStore.termClosures) ? adminStore.termClosures : [];
  const closures = sessionId
    ? termClosures.filter((entry) => entry.sessionId === sessionId)
    : termClosures;
  return res.json({ termClosures: closures, sessionId });
});

adminRouter.put('/terms/closures', async (req, res) => {
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.body?.sessionId ? String(req.body.sessionId) : activeSession?.id || '';
  const term = String(req.body?.term || '').trim();
  const closed = Boolean(req.body?.closed);

  if (!term) {
    return res.status(400).json({ message: 'term is required.' });
  }
  if (!TERM_OPTIONS.includes(term)) {
    return res.status(400).json({ message: `term must be one of ${TERM_OPTIONS.join(', ')}.` });
  }
  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }

  adminStore.termClosures = Array.isArray(adminStore.termClosures) ? adminStore.termClosures : [];
  const index = adminStore.termClosures.findIndex(
    (entry) => entry.term === term && entry.sessionId === sessionId
  );
  const isClosed = index >= 0;

  if (closed === isClosed) {
    return res.status(400).json({
      message: closed
        ? 'Term is already closed for this session.'
        : 'Term is already open for this session.'
    });
  }

  if (closed) {
    const record = {
      term,
      sessionId,
      closedAt: new Date().toISOString()
    };
    if (index >= 0) {
      adminStore.termClosures[index] = record;
    } else {
      adminStore.termClosures.unshift(record);
    }
  } else if (index >= 0) {
    adminStore.termClosures.splice(index, 1);
  }

  return res.json({ termClosures: adminStore.termClosures, sessionId });
});

adminRouter.get('/promotions/preview', async (req, res) => {
  const institution = req.query.institution ? String(req.query.institution) : '';
  const term = normalizeTerm(req.query.term ? String(req.query.term) : '');
  const sessions = await listAcademicSessions();
  const activeSession = sessions.find((session) => session.isActive) || sessions[0] || null;
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  const classIdFilter = req.query.classId ? String(req.query.classId) : '';

  const enrollments = sessionId ? await listStudentEnrollments({ sessionId }) : [];
  const sourceRows = enrollments.length
    ? enrollments
    : adminStore.students
        .filter((student) => student.classId)
        .map((student) => ({ studentId: student.id, classId: student.classId, sessionId }));
  const filteredSourceRows = classIdFilter
    ? sourceRows.filter((row) => row.classId === classIdFilter)
    : sourceRows.filter((row) => {
        if (!institution) return true;
        const classItem = adminStore.classes.find((item) => item.id === row.classId);
        return normalizeInstitution(classItem?.institution || '') === normalizeInstitution(institution);
      });

  const autoMap = buildAutoPromotionMap(adminStore.classes);
  const recommendationMap = buildPromotionRecommendationMap(sessionId, term);

  const eligible = [];
  const graduated = [];
  const skipped = [];

  for (const row of filteredSourceRows) {
    const student = await findStudentById(row.studentId);
    if (!student) {
      skipped.push({ studentId: row.studentId, reason: 'student_missing' });
      continue;
    }
    if (!isPromotionEligibleStatus(student.accountStatus)) {
      continue;
    }

    const classItem = adminStore.classes.find((item) => item.id === row.classId);
    if (!classItem) {
      skipped.push({ studentId: student.id, reason: 'class_missing' });
      continue;
    }

    const nextStep = describePromotionStep(term, classItem, adminStore.classes);

    if (nextStep.action === 'term') {
      eligible.push({
        studentId: student.id,
        fullName: student.fullName,
        classId: classItem.id,
        classLabel: classLabel(classItem),
        institution: normalizeInstitution(student.institution || classItem.institution || ''),
        nextTerm: nextStep.nextTerm,
        nextStepType: 'term',
        nextStepLabel: nextStep.label,
        nextClassId: classItem.id,
        nextClassLabel: classLabel(classItem),
        parentEmail: student.parentPortalEmail || student.guardianEmail || '',
        accountStatus: student.accountStatus || 'active',
        recommendation: recommendationMap.get(student.id) || null
      });
      continue;
    }

    if (nextStep.action === 'class' && nextStep.nextClass?.id) {
      eligible.push({
        studentId: student.id,
        fullName: student.fullName,
        classId: classItem.id,
        classLabel: classLabel(classItem),
        institution: normalizeInstitution(student.institution || classItem.institution || ''),
        nextStepType: 'class',
        nextStepLabel: nextStep.label,
        nextClassId: nextStep.nextClass.id,
        nextClassLabel: classLabel(nextStep.nextClass),
        parentEmail: student.parentPortalEmail || student.guardianEmail || '',
        accountStatus: student.accountStatus || 'active',
        recommendation: recommendationMap.get(student.id) || null
      });
      continue;
    }

    if (nextStep.action === 'graduate') {
      graduated.push({
        studentId: student.id,
        fullName: student.fullName,
        classId: classItem.id,
        classLabel: classLabel(classItem),
        institution: normalizeInstitution(classItem.institution || student.institution || 'Unknown'),
        reason: nextStep.reason || 'graduation_gate',
        graduationLabel: nextStep.label,
        parentEmail: student.parentPortalEmail || student.guardianEmail || '',
        accountStatus: student.accountStatus || 'active'
      });
    } else {
      skipped.push({ studentId: student.id, classId: classItem.id, reason: nextStep.reason || 'no_promotion_mapping' });
    }
  }

  return res.json({
    sessionId,
    activeSession,
    institution,
    term,
    canPromote: Boolean(term),
    eligible,
    graduated,
    skipped,
    recommendationCount: recommendationMap.size,
    promotionMap: [...autoMap.entries()].map(([fromClassId, toClassId]) => ({ fromClassId, toClassId }))
  });
});

adminRouter.get('/promotions/batches', (_req, res) => {
  const batches = adminStore.promotionBatches || [];
  return res.json({ batches });
});

adminRouter.delete('/promotions/batches', (req, res) => {
  adminStore.promotionBatches = [];

  addActivityLog({
    action: 'promotions.batches.cleared',
    method: 'DELETE',
    path: '/api/admin/promotions/batches',
    actorRole: req.user?.role || 'admin',
    actorEmail: req.user?.email || 'unknown',
    statusCode: 204,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  return res.status(204).send();
});

adminRouter.post('/academic-sessions/rollover', async (req, res) => {
  try {
    const {
      fromSessionId = '',
      toSessionName = '',
      toSessionId = '',
      startDate = '',
      endDate = '',
      institution = '',
      classId = '',
      term = '',
      studentDecisions = [],
      promoteMap = [],
      carryOverUnmapped = false,
      activateNewSession = true
    } = req.body || {};
    const normalizedSessionName = String(toSessionName || '').trim();
    const normalizedStartDate = String(startDate || '').trim();
    const normalizedEndDate = String(endDate || '').trim();
    const normalizedTerm = normalizeTerm(term);

    if (!normalizedTerm) {
      return res.status(400).json({ message: 'Select a valid term before running promotion.' });
    }

    const requiresSessionRollover = isSessionRolloverTerm(normalizedTerm);

    if (requiresSessionRollover && !normalizedSessionName) {
      return res.status(400).json({ message: 'toSessionName is required.' });
    }
    if (normalizedStartDate && Number.isNaN(new Date(normalizedStartDate).getTime())) {
      return res.status(400).json({ message: 'startDate must be a valid date.' });
    }
    if (normalizedEndDate && Number.isNaN(new Date(normalizedEndDate).getTime())) {
      return res.status(400).json({ message: 'endDate must be a valid date.' });
    }

    const sessions = await listAcademicSessions();
    const activeSession = sessions.find((session) => session.isActive) || sessions[0] || null;
    const sourceSessionId = fromSessionId || activeSession?.id || '';

    if (!sourceSessionId) {
      return res.status(400).json({ message: 'fromSessionId is required when no active session exists.' });
    }

    const enrollments = await listStudentEnrollments({ sessionId: sourceSessionId });
    const sourceRows = (enrollments.length
      ? enrollments
      : adminStore.students
          .filter((student) => student.classId)
          .map((student) => ({
            studentId: student.id,
            classId: student.classId,
            sessionId: sourceSessionId
          })))
      .filter((row) => {
        if (classId) return row.classId === classId;
        if (!institution) return true;
        const classItem = adminStore.classes.find((item) => item.id === row.classId);
        return (classItem?.institution || '') === institution;
      });

    if (!sourceRows.length) {
      return res.status(400).json({ message: 'No students found for the selected promotion scope.' });
    }

    const classIdsForScope = classId
      ? [classId]
      : adminStore.classes
          .filter((item) => (institution ? (item.institution || '') === institution : true))
          .map((item) => item.id);
    const approvedResults = await countFinalResultsForSessionTerm({
      sessionId: sourceSessionId,
      term,
      classIds: classIdsForScope
    });
    if (!approvedResults) {
      return res.status(400).json({
        message: `Promotion requires approved ${normalizedTerm} results for the selected scope.`
      });
    }

    let createdSession = null;

    if (requiresSessionRollover) {
      const existingTarget = sessions.find((session) => session.sessionName === normalizedSessionName) || null;
      const targetSessionId = existingTarget?.id || String(toSessionId || '').trim();
      if (targetSessionId) {
        const targetEnrollments = await listStudentEnrollments({ sessionId: targetSessionId });
        const targetStudentIds = new Set(targetEnrollments.map((row) => row.studentId));
        const alreadyPromoted = sourceRows.some((row) => targetStudentIds.has(row.studentId));
        if (alreadyPromoted) {
          return res.status(409).json({
            message: 'Promotion already ran for this session/scope. Clear the target session before re-running.'
          });
        }
      }

      createdSession = await createAcademicSession({
        id: toSessionId || makeId('ses'),
        sessionName: normalizedSessionName,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        isActive: Boolean(activateNewSession)
      });

      if (!createdSession) {
        return res.status(400).json({ message: 'Unable to create new academic session.' });
      }

      if (activateNewSession) {
        await activateAcademicSession(createdSession.id);
      }
    }

    const map = new Map();
    const manualEntries = Array.isArray(promoteMap) ? promoteMap : [];
    const autoMap = buildAutoPromotionMap(adminStore.classes);
    const useAutoMap = manualEntries.length === 0;
    const decisionEntries = Array.isArray(studentDecisions) ? studentDecisions : [];
    const decisionMap = new Map(
      decisionEntries
        .map((entry) => ({
          studentId: String(entry?.studentId || '').trim(),
          action: String(entry?.action || 'promote').trim().toLowerCase()
        }))
        .filter((entry) => entry.studentId)
        .map((entry) => [entry.studentId, entry.action])
    );
    const recommendationMap = buildPromotionRecommendationMap(sourceSessionId, term);

    if (useAutoMap) {
      autoMap.forEach((value, key) => {
        map.set(key, value);
      });
    } else {
      manualEntries.forEach((entry) => {
        const fromClassId = String(entry?.fromClassId || '').trim();
        const toClassId = String(entry?.toClassId || '').trim();
        if (fromClassId && toClassId) {
          map.set(fromClassId, toClassId);
        }
      });
    }

    const promoted = [];
    const repeated = [];
    const graduated = [];
    const skipped = [];

    for (const row of sourceRows) {
      const currentClassId = row.classId || '';
      if (!currentClassId) {
        skipped.push({ studentId: row.studentId, reason: 'missing_class' });
        continue;
      }

      const decision =
        decisionMap.get(row.studentId) ||
        recommendationMap.get(row.studentId)?.action ||
        'promote';

      if (decision === 'repeat') {
        const student = await findStudentById(row.studentId);
        if (student) {
          const classItem = adminStore.classes.find((item) => item.id === currentClassId);
          const levelLabel = classItem ? classLabel(classItem) : student.level;
          const updated = await updateStudent(student.id, {
            ...student,
            classId: currentClassId,
            level: levelLabel,
            accountStatus: student.accountStatus === 'graduated' ? 'active' : student.accountStatus
          });
          if (updated) {
            replaceStoreRecord('students', updated);
          }
        }

        if (createdSession?.id) {
          await upsertStudentEnrollment({
            studentId: row.studentId,
            classId: currentClassId,
            sessionId: createdSession.id,
            promotedFromClass: currentClassId
          });
        }

        repeated.push({
          studentId: row.studentId,
          classId: currentClassId,
          term: normalizedTerm,
          nextTerm: getNextTerm(normalizedTerm) || '',
          reason: 'repeat'
        });
        continue;
      }

      if (decision === 'graduate') {
        const student = await findStudentById(row.studentId);
        if (student) {
          const updated = await updateStudent(student.id, { ...student, accountStatus: 'graduated' });
          if (updated) {
            replaceStoreRecord('students', updated);
          }
        }
        graduated.push({ studentId: row.studentId, classId: currentClassId, reason: 'manual_graduate' });
        continue;
      }

      const student = await findStudentById(row.studentId);
      if (!student) {
        skipped.push({ studentId: row.studentId, classId: currentClassId, reason: 'student_missing' });
        continue;
      }
      if (!isPromotionEligibleStatus(student.accountStatus)) {
        skipped.push({ studentId: row.studentId, classId: currentClassId, reason: 'inactive_or_graduated' });
        continue;
      }

      const currentClass = adminStore.classes.find((item) => item.id === currentClassId);
      const nextStep = describePromotionStep(normalizedTerm, currentClass, adminStore.classes);

      if (nextStep.action === 'graduate') {
        const updated = await updateStudent(student.id, { ...student, accountStatus: 'graduated' });
        if (updated) {
          replaceStoreRecord('students', updated);
        }
        graduated.push({ studentId: row.studentId, classId: currentClassId, reason: nextStep.reason || 'graduation_gate' });
        continue;
      }

      if (nextStep.action === 'term') {
        promoted.push({
          studentId: student.id,
          classId: currentClassId,
          fromTerm: normalizedTerm,
          toTerm: nextStep.nextTerm || '',
          stepType: 'term'
        });
        continue;
      }

      const nextClassId = map.get(currentClassId)
        || nextStep.nextClass?.id
        || (carryOverUnmapped ? currentClassId : '');
      if (!nextClassId) {
        skipped.push({ studentId: row.studentId, classId: currentClassId, reason: nextStep.reason || 'no_promotion_mapping' });
        continue;
      }

      const nextClass = adminStore.classes.find((item) => item.id === nextClassId);
      const nextLevel = nextClass ? `${nextClass.name} ${nextClass.arm}` : student.level;
      const updated = await updateStudent(student.id, {
        ...student,
        classId: nextClassId,
        level: nextLevel
      });

      if (updated) {
        replaceStoreRecord('students', updated);
      }

      if (createdSession?.id) {
        await upsertStudentEnrollment({
          studentId: student.id,
          classId: nextClassId,
          sessionId: createdSession.id,
          promotedFromClass: currentClassId
        });
      }

      promoted.push({
        studentId: student.id,
        fromClassId: currentClassId,
        toClassId: nextClassId,
        stepType: 'class'
      });
    }

    const responseMap = useAutoMap
      ? [...autoMap.entries()].map(([fromClassId, toClassId]) => ({ fromClassId, toClassId }))
      : manualEntries.map((entry) => ({
          fromClassId: String(entry?.fromClassId || '').trim(),
          toClassId: String(entry?.toClassId || '').trim()
        }));

    const batch = {
      id: makeId('promo'),
      institution,
      classId,
      term: normalizedTerm,
      fromSessionId: sourceSessionId,
      toSessionId: createdSession?.id || '',
      toSessionName: createdSession?.sessionName || '',
      promotionMode: useAutoMap ? 'auto' : 'manual',
      progressionMode: requiresSessionRollover ? 'session-rollover' : 'term-advance',
      promotionMap: responseMap.filter((entry) => entry.fromClassId && entry.toClassId),
      promotedCount: promoted.length,
      repeatedCount: repeated.length,
      graduatedCount: graduated.length,
      skippedCount: skipped.length,
      promoted,
      repeated,
      graduated,
      skipped,
      createdAt: new Date().toISOString()
    };

    adminStore.promotionBatches = adminStore.promotionBatches || [];
    adminStore.promotionBatches.unshift(batch);

    addActivityLog({
      action: 'promotions.rollover.completed',
      method: 'POST',
      path: '/api/admin/academic-sessions/rollover',
      actorRole: req.user?.role || 'admin',
      actorEmail: req.user?.email || 'unknown',
      statusCode: 201,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    return res.status(201).json({
      fromSessionId: sourceSessionId,
      toSession: createdSession,
      institution,
      classId,
      term: normalizedTerm,
      promotionMode: useAutoMap ? 'auto' : 'manual',
      progressionMode: requiresSessionRollover ? 'session-rollover' : 'term-advance',
      promotionMap: responseMap.filter((entry) => entry.fromClassId && entry.toClassId),
      promotedCount: promoted.length,
      repeatedCount: repeated.length,
      graduatedCount: graduated.length,
      skippedCount: skipped.length,
      promoted,
      repeated,
      graduated,
      skipped
    });
  } catch (error) {
    console.error('Promotion rollover failed', error);
    addActivityLog({
      action: 'promotions.rollover.failed',
      method: 'POST',
      path: '/api/admin/academic-sessions/rollover',
      actorRole: req.user?.role || 'admin',
      actorEmail: req.user?.email || 'unknown',
      statusCode: 500,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      details: {
        message: error?.message || 'Promotion rollover failed.'
      }
    });
    return res.status(500).json({ message: 'Promotion rollover failed. Check server logs for details.' });
  }
});

adminRouter.put('/classes/:id', async (req, res) => {
  const { id } = req.params;
  const name = String(req.body?.name || '').trim();
  const arm = String(req.body?.arm || '').trim();
  const institution = String(req.body?.institution || '').trim();
  const { progressionOrder } = req.body || {};
  const currentClass = await findClassById(id);

  if (!currentClass) {
    return res.status(404).json({ message: 'Class not found.' });
  }

  if (!name || !arm || !institution) {
    return res.status(400).json({ message: 'name, arm, institution are required.' });
  }

  try {
    const parsedOrder = progressionOrder === '' || progressionOrder === null || progressionOrder === undefined
      ? null
      : Number(progressionOrder);

    if (parsedOrder !== null && Number.isNaN(parsedOrder)) {
      return res.status(400).json({ message: 'progressionOrder must be a number.' });
    }

    const nextClass = await updateClass(id, {
      ...currentClass,
      name,
      arm,
      institution,
      progressionOrder: Number.isFinite(parsedOrder) ? parsedOrder : null
    });
    replaceStoreRecord('classes', nextClass);
    return res.json({ class: nextClass });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'This class already exists for the selected institution.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to update class.' });
  }
});

adminRouter.delete('/classes/:id', async (req, res) => {
  const { id } = req.params;
  const currentClass = await findClassById(id);

  if (!currentClass) {
    return res.status(404).json({ message: 'Class not found.' });
  }

  const classDependencyError = ensureClassCanBeDeleted(id);
  if (classDependencyError) {
    return res.status(409).json({ message: classDependencyError });
  }

  await deleteClassById(id);
  removeStoreRecord('classes', id);
  adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => item.classId !== id);
  adminStore.upcomingItems = (adminStore.upcomingItems || []).filter((item) => item.classId !== id);
  adminStore.notifications = (adminStore.notifications || []).filter((item) => item.classId !== id);
  adminStore.resultsAccess = (adminStore.resultsAccess || []).filter((item) => item !== id);
  return res.status(204).send();
});

adminRouter.get('/subjects', async (req, res) => {
  const institution = getInstitutionFilter(req);
  const subjects = await listSubjects({ institution });

  return res.json({ subjects });
});

adminRouter.post('/subjects', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const institution = String(req.body?.institution || '').trim();

  if (!name || !institution) {
    return res.status(400).json({ message: 'name and institution are required.' });
  }

  try {
    const subject = await createSubject({ id: makeId('sub'), name, institution });
    replaceStoreRecord('subjects', subject);
    return res.status(201).json({ subject });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'This subject already exists for the selected institution.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to create subject.' });
  }
});

adminRouter.put('/subjects/:id', async (req, res) => {
  const { id } = req.params;
  const name = String(req.body?.name || '').trim();
  const institution = String(req.body?.institution || '').trim();
  const currentSubject = await findSubjectById(id);

  if (!currentSubject) {
    return res.status(404).json({ message: 'Subject not found.' });
  }

  if (!name || !institution) {
    return res.status(400).json({ message: 'name and institution are required.' });
  }

  try {
    const subject = await updateSubject(id, { ...currentSubject, name, institution });
    replaceStoreRecord('subjects', subject);
    return res.json({ subject });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'This subject already exists for the selected institution.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to update subject.' });
  }
});

adminRouter.delete('/subjects/:id', async (req, res) => {
  const { id } = req.params;
  const currentSubject = await findSubjectById(id);

  if (!currentSubject) {
    return res.status(404).json({ message: 'Subject not found.' });
  }

  const subjectDependencyError = ensureSubjectCanBeDeleted(id);
  if (subjectDependencyError) {
    return res.status(409).json({ message: subjectDependencyError });
  }

  await deleteSubjectById(id);
  removeStoreRecord('subjects', id);
  adminStore.teacherAssignments = adminStore.teacherAssignments.filter((item) => item.subjectId !== id);
  return res.status(204).send();
});

adminRouter.get('/teacher-assignments', async (req, res) => {
  const institution = getInstitutionFilter(req);
  const assignments = (await listTeacherAssignments({ institution }))
    .map(enrichAssignment)
    .filter((item) => (institution ? item.institution === institution : true));

  return res.json({ assignments });
});

adminRouter.post('/teacher-assignments', async (req, res) => {
  const { teacherId, teacherIds, classId, subjectId, term, assignmentRole, note } = req.body || {};

  const normalizedTeacherIds = [...new Set([
    ...(Array.isArray(teacherIds) ? teacherIds.filter(Boolean) : []),
    ...(teacherId ? [teacherId] : [])
  ])];

  if (!normalizedTeacherIds.length || !classId || !subjectId || !term) {
    return res.status(400).json({ message: 'teacherId/teacherIds, classId, subjectId, term are required.' });
  }

  const classItem = await findClassById(classId);
  const subjectItem = await findSubjectById(subjectId);
  const teacherItems = await Promise.all(
    normalizedTeacherIds.map((candidateTeacherId) => findTeacherById(candidateTeacherId))
  );
  const missingTeacher = teacherItems.findIndex((item) => !item);

  if (missingTeacher >= 0 || !classItem || !subjectItem) {
    return res.status(400).json({ message: 'Referenced teacher, class, or subject does not exist.' });
  }

  const institution = classItem.institution;
  const crossInstitutionTeacher = teacherItems.find((item) => item.institution !== institution);
  if (subjectItem.institution !== institution || crossInstitutionTeacher) {
    return res.status(400).json({
      message: 'Teacher, class, and subject must belong to the same institution.'
    });
  }

  const existingAssignments = await listTeacherAssignments({ classId, subjectId, term });
  const existingTeacherIds = new Set(existingAssignments.map((item) => item.teacherId));
  const conflictingTeacher = normalizedTeacherIds.find((candidateTeacherId) => existingTeacherIds.has(candidateTeacherId));
  if (conflictingTeacher) {
    return res.status(409).json({ message: 'One or more selected teachers are already assigned to this class, subject, and term.' });
  }

  const createdAssignments = [];

  for (const candidateTeacherId of normalizedTeacherIds) {
    const assignment = await createTeacherAssignment({
      id: makeId('asg'),
      teacherId: candidateTeacherId,
      classId,
      subjectId,
      term,
      assignmentRole: assignmentRole || 'Subject Teacher',
      note: note || ''
    });
    replaceStoreRecord('teacherAssignments', assignment);
    createdAssignments.push(enrichAssignment(assignment));
  }

  return res.status(201).json({
    createdCount: createdAssignments.length,
    assignments: createdAssignments,
    assignment: createdAssignments[0]
  });
});

adminRouter.put('/teacher-assignments/:id', async (req, res) => {
  const { id } = req.params;
  const { teacherId, classId, subjectId, term, assignmentRole, note } = req.body || {};
  const currentAssignment = await findTeacherAssignmentById(id);

  if (!currentAssignment) {
    return res.status(404).json({ message: 'Assignment not found.' });
  }

  if (!teacherId || !classId || !subjectId || !term) {
    return res.status(400).json({ message: 'teacherId, classId, subjectId, term are required.' });
  }

  const [teacher, classItem, subject] = await Promise.all([
    findTeacherById(teacherId),
    findClassById(classId),
    findSubjectById(subjectId)
  ]);

  if (!teacher || !classItem || !subject) {
    return res.status(400).json({ message: 'Referenced teacher, class, or subject does not exist.' });
  }

  if (teacher.institution !== classItem.institution || subject.institution !== classItem.institution) {
    return res.status(400).json({
      message: 'Teacher, class, and subject must belong to the same institution.'
    });
  }

  try {
    const assignment = await updateTeacherAssignment(id, {
      ...currentAssignment,
      teacherId,
      classId,
      subjectId,
      term,
      assignmentRole: assignmentRole || 'Subject Teacher',
      note: note || ''
    });
    replaceStoreRecord('teacherAssignments', assignment);
    return res.json({ assignment: enrichAssignment(assignment) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'This teacher assignment already exists for the selected term.' });
    }
    return res.status(400).json({ message: error.message || 'Unable to update assignment.' });
  }
});

adminRouter.delete('/teacher-assignments/:id', async (req, res) => {
  const { id } = req.params;
  const currentAssignment = await findTeacherAssignmentById(id);

  if (!currentAssignment) {
    return res.status(404).json({ message: 'Assignment not found.' });
  }

  await deleteTeacherAssignmentById(id);
  removeStoreRecord('teacherAssignments', id);
  return res.status(204).send();
});

adminRouter.get('/admissions/period', (_req, res) => {
  return res.json({ admissionPeriod: normalizeAdmissionPeriod(adminStore.admissionPeriod) });
});

adminRouter.put('/admissions/period', (req, res) => {
  const incoming = req.body || {};
  const current = normalizeAdmissionPeriod(adminStore.admissionPeriod);
  const incomingPrograms = incoming.programs && typeof incoming.programs === 'object' ? incoming.programs : {};
  const mergedPrograms = { ...current.programs };

  Object.keys(incomingPrograms).forEach((key) => {
    mergedPrograms[key] = {
      ...mergedPrograms[key],
      ...(incomingPrograms[key] || {})
    };
  });

  const nextPeriod = normalizeAdmissionPeriod({
    ...current,
    ...incoming,
    programs: mergedPrograms
  });
  const validationError = validateAdmissionPeriodConfig(nextPeriod);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  adminStore.admissionPeriod = nextPeriod;

  return res.json({ admissionPeriod: adminStore.admissionPeriod });
});

adminRouter.get('/admissions', (req, res) => {
  const institution = getInstitutionFilter(req);
  const status = String(req.query.status || '').trim().toLowerCase();
  const paymentStatus = String(req.query.paymentStatus || '').trim().toLowerCase();
  const classId = String(req.query.classId || '').trim();
  const search = String(req.query.q || '').trim().toLowerCase();
  const sort = String(req.query.sort || '').trim();
  const admissions = adminStore.admissions
    .map(enrichAdmission)
    .filter((item) => (institution ? item.institution === institution : true))
    .filter((item) => (status ? item.status === status : true))
    .filter((item) => (paymentStatus ? (item.paymentStatus || 'pending') === paymentStatus : true))
    .filter((item) => (classId ? (item.classId || item.classLabel || item.level || '') === classId : true))
    .filter((item) => {
      if (!search) return true;
      const haystack = `${item.fullName} ${item.guardianName} ${item.phone || ''} ${item.email || ''} ${item.studentEmail || ''}`.toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (sort === 'name_desc') return a.fullName.localeCompare(b.fullName) * -1;
      if (sort === 'name_asc') return a.fullName.localeCompare(b.fullName);
      const timeA = new Date(a.submittedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.submittedAt || b.createdAt || 0).getTime();
      return sort === 'submitted_asc' ? timeA - timeB : timeB - timeA;
    });

  return res.json({ admissions });
});

adminRouter.post('/admissions/bulk-fix', (req, res) => {
  const { copyGuardianEmail = false, setMissingPaymentStatus = true, dryRun = false } = req.body || {};
  if (!copyGuardianEmail && !setMissingPaymentStatus) {
    return res.status(400).json({ message: 'Select at least one bulk-fix action.' });
  }
  const updates = {
    scanned: 0,
    studentEmailFilled: 0,
    paymentStatusSet: 0
  };
  const remaining = {
    missingStudentEmail: [],
    missingPaymentStatus: []
  };

  adminStore.admissions = adminStore.admissions.map((admission) => {
    updates.scanned += 1;
    let changed = false;
    const next = { ...admission };

    const hasStudentEmail = String(next.studentEmail || '').trim();
    if (!hasStudentEmail) {
      if (copyGuardianEmail && String(next.email || '').trim()) {
        next.studentEmail = String(next.email).trim();
        updates.studentEmailFilled += 1;
        changed = true;
      } else {
        remaining.missingStudentEmail.push(next.id);
      }
    }

    const paymentStatus = String(next.paymentStatus || '').trim();
    if (!['pending', 'confirmed'].includes(paymentStatus)) {
      if (setMissingPaymentStatus) {
        next.paymentStatus = 'pending';
        next.paymentConfirmedAt = '';
        updates.paymentStatusSet += 1;
        changed = true;
      } else {
        remaining.missingPaymentStatus.push(next.id);
      }
    }

    if (changed && !dryRun) {
      next.workflowHistory = appendAdmissionHistory(
        admission,
        'admin.bulkfix',
        'Admin bulk-updated missing admission fields.'
      );
    }

    return dryRun ? admission : next;
  });

  return res.json({
    updated: updates,
    remaining,
    dryRun
  });
});

adminRouter.get('/admissions/archive', (_req, res) => {
  return res.json({ archive: adminStore.admissionArchive || [] });
});

adminRouter.post('/users/reset-password', async (req, res) => {
  const { email, userId } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = userId ? await findUserById(String(userId)) : await findUserByEmail(normalizedEmail);

  if (!user) {
    return res.status(404).json({ message: 'User account not found.' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const updatedUser = await updateUserPassword(user.id, {
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true
  });

  const nextUser = updatedUser || user;
  const contact = resolvePasswordResetContact(nextUser);

  let delivery = { status: 'manual-only', reason: 'missing-recipient-email' };

  if (contact.recipientEmail) {
    delivery = await sendPasswordResetEmail({
      recipientName: contact.recipientName,
      recipientEmail: contact.recipientEmail,
      portalEmail: nextUser.email,
      temporaryPassword,
      role: nextUser.role,
      institution: contact.institution
    });
  }

  addActivityLog({
    action: 'admin.password.reset',
    method: 'POST',
    path: '/api/admin/users/reset-password',
    actorRole: req.user?.role || 'admin',
    actorEmail: req.user?.email || 'unknown',
    statusCode: 201,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  return res.status(201).json({
    message: 'Temporary password generated successfully.',
    user: {
      id: nextUser.id,
      fullName: nextUser.fullName,
      email: nextUser.email,
      role: nextUser.role,
      mustChangePassword: Boolean(nextUser.mustChangePassword)
    },
    credential: {
      label: contact.label,
      recipientName: contact.recipientName,
      recipientEmail: contact.recipientEmail,
      role: nextUser.role,
      email: nextUser.email,
      password: temporaryPassword,
      reused: false,
      mustChangePassword: true,
      emailDeliveryStatus: delivery.status,
      emailDeliveryMessage: delivery.messageId || delivery.reason || ''
    }
  });
});

adminRouter.get('/users/admissions-handlers', async (_req, res) => {
  const handlers = await listUsersByRole('admissions');
  return res.json({
    handlers: handlers.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      createdAt: user.createdAt || ''
    }))
  });
});

adminRouter.post('/users/admissions-handlers', async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim();

  if (!fullName || !email) {
    return res.status(400).json({ message: 'fullName and email are required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }

  let account = null;

  try {
    account = await provisionPortalAccount({
      role: 'admissions',
      fullName,
      institution: 'Admissions Desk',
      preferredEmail: email
    });

    const deliveredCredentials = await deliverProvisioningCredentials(
      [
        serializeCredential(account, 'Admissions desk portal', {
          fullName,
          recipientName: fullName,
          recipientEmail: email
        })
      ],
      'Admissions Desk'
    );

    addActivityLog({
      action: 'admin.admissions-handler.created',
      method: 'POST',
      path: '/api/admin/users/admissions-handlers',
      actorRole: req.user?.role || 'admin',
      actorEmail: req.user?.email || 'unknown',
      statusCode: 201,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    return res.status(201).json({
      handler: {
        id: account.user.id,
        fullName: account.user.fullName,
        email: account.user.email,
        role: account.user.role,
        mustChangePassword: Boolean(account.user.mustChangePassword),
        createdAt: account.user.createdAt || new Date().toISOString()
      },
      credential: deliveredCredentials[0] || null
    });
  } catch (error) {
    await rollbackProvisionedCredentials([
      serializeCredential(account, 'Admissions desk portal', {
        fullName,
        recipientName: fullName,
        recipientEmail: email
      })
    ]);

    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Admissions handler email already exists.' });
    }

    return res.status(400).json({ message: error.message || 'Unable to provision admissions handler account.' });
  }
});

adminRouter.delete('/users/admissions-handlers/:id', async (req, res) => {
  const { id } = req.params;
  const handler = await findUserById(id);

  if (!handler || handler.role !== 'admissions') {
    return res.status(404).json({ message: 'Admissions handler not found.' });
  }

  await deleteUserById(id);

  addActivityLog({
    action: 'admin.admissions-handler.deleted',
    method: 'DELETE',
    path: `/api/admin/users/admissions-handlers/${id}`,
    actorRole: req.user?.role || 'admin',
    actorEmail: req.user?.email || 'unknown',
    statusCode: 204,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  return res.status(204).send();
});

adminRouter.put('/admissions/:id', async (req, res) => {
  const { id } = req.params;
  const status = normalizeLowerText(req.body?.status);
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be pending, approved, or rejected.' });
  }

  const current = adminStore.admissions[admissionIndex];

  if (current.status === status) {
    return res.status(400).json({ message: `Admission is already ${status}.` });
  }

  if (status === 'approved' && (current.verificationStatus || 'pending') !== 'verified') {
    return res.status(400).json({ message: 'Verify admission documents before approving and admitting the student.' });
  }

  if (status === 'approved' && !String(current.studentEmail || '').trim()) {
    return res.status(400).json({ message: 'Student email is required before approval.' });
  }

  if (status === 'approved' && env.mailEnabled && !String(current.email || '').trim()) {
    return res.status(400).json({
      message: 'A guardian email address is required before approval so portal access can be handed over automatically.'
    });
  }

  if (current.promotedStudentId && status !== 'approved') {
    return res.status(400).json({ message: 'This admitted student has already been created. Manage the student record directly.' });
  }

  adminStore.admissions[admissionIndex] = {
    ...current,
    status,
    verificationStatus: current.verificationStatus || 'pending',
    interviewDate: current.interviewDate || '',
    interviewMode: current.interviewMode || '',
    offerStatus: current.offerStatus || 'none',
    offerLetterRef: current.offerLetterRef || '',
    documents: Array.isArray(current.documents)
      ? current.documents
      : [],
    workflowHistory: appendAdmissionHistory(
      current,
      'status.updated',
      `Application status changed to ${status}.`
    )
  };

  const updated = adminStore.admissions[admissionIndex];

  appendNotification({
    title: 'Admission status updated',
    message: `${updated.fullName}: your application is now ${status}.`,
    roleTarget: 'parent',
    recipientEmail: updated.email || '',
    recipientPhone: updated.phone || '',
    meta: {
      admissionId: id,
      institution: updated.institution,
      category: 'admissions'
    }
  });

  if (shouldDeleteAdmission(updated)) {
    const { archived } = finalizeAdmission(admissionIndex, 'rejected');
    return res.json({ deleted: true, archived });
  }

  if (admissionQualifiesForFullAdmission(updated)) {
    return promoteQualifiedAdmission({
      admissionIndex,
      auditContext: buildAuditContext(req, 201)
    })
      .then((result) => res.status(201).json({
        message: 'Admission promoted to student record.',
        student: result.student ? enrichStudent(result.student) : null,
        credentials: result.credentials || [],
        deleted: result.deleted,
        archived: result.archived || null
      }))
      .catch((error) => res.status(400).json({ message: error.message || 'Unable to provision portal accounts for admission.' }));
  }

  if (status === 'approved') {
    const delivery = await deliverAdmissionApprovalNotifications(updated);
    return res.json({ admission: enrichAdmission(updated), delivery });
  }

  return res.json({ admission: enrichAdmission(updated), delivery: null });
});

adminRouter.delete('/admissions/:id', (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.query.reason || 'manual_delete');
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const { archived } = finalizeAdmission(admissionIndex, reason);
  return res.json({ deleted: true, archived });
});

adminRouter.put('/admissions/:id/verification', (req, res) => {
  const { id } = req.params;
  const verificationStatus = normalizeLowerText(req.body?.verificationStatus);
  const notes = String(req.body?.notes || '').trim();
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  if (!['pending', 'verified', 'rejected'].includes(verificationStatus)) {
    return res.status(400).json({ message: 'verificationStatus must be pending, verified, or rejected.' });
  }

  if ((adminStore.admissions[admissionIndex].verificationStatus || 'pending') === verificationStatus) {
    return res.status(400).json({ message: `Verification is already ${verificationStatus}.` });
  }

  adminStore.admissions[admissionIndex] = {
    ...adminStore.admissions[admissionIndex],
    verificationStatus,
    verificationNotes: notes || '',
    workflowHistory: appendAdmissionHistory(
      adminStore.admissions[admissionIndex],
      'documents.reviewed',
      `Document verification marked as ${verificationStatus}.${notes ? ` Notes: ${notes}` : ''}`
    )
  };

  appendNotification({
    title: 'Document verification updated',
    message: `${adminStore.admissions[admissionIndex].fullName}: your document review is now ${verificationStatus}.`,
    roleTarget: 'parent',
    recipientEmail: adminStore.admissions[admissionIndex].email || '',
    recipientPhone: adminStore.admissions[admissionIndex].phone || '',
    meta: {
      admissionId: id,
      institution: adminStore.admissions[admissionIndex].institution,
      category: 'admissions'
    }
  });

  if (shouldDeleteAdmission(adminStore.admissions[admissionIndex])) {
    const { archived } = finalizeAdmission(admissionIndex, 'rejected');
    return res.json({ deleted: true, archived });
  }

  const updated = adminStore.admissions[admissionIndex];
  if (admissionQualifiesForFullAdmission(updated)) {
    return promoteQualifiedAdmission({
      admissionIndex,
      auditContext: buildAuditContext(req, 201)
    })
      .then((result) => res.status(201).json({
        message: 'Admission promoted to student record.',
        student: result.student ? enrichStudent(result.student) : null,
        credentials: result.credentials || [],
        deleted: result.deleted,
        archived: result.archived || null
      }))
      .catch((error) => res.status(400).json({ message: error.message || 'Unable to provision portal accounts for admission.' }));
  }

  return res.json({ admission: enrichAdmission(updated) });
});

adminRouter.put('/admissions/:id/payment', (req, res) => {
  const { id } = req.params;
  const paymentStatus = normalizeLowerText(req.body?.paymentStatus);
  const notes = String(req.body?.notes || '').trim();
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  if (!['pending', 'confirmed'].includes(paymentStatus)) {
    return res.status(400).json({ message: 'paymentStatus must be pending or confirmed.' });
  }

  if ((adminStore.admissions[admissionIndex].paymentStatus || 'pending') === paymentStatus) {
    return res.status(400).json({ message: `Payment is already ${paymentStatus}.` });
  }

  const confirmedAt = paymentStatus === 'confirmed' ? new Date().toISOString() : '';

  adminStore.admissions[admissionIndex] = {
    ...adminStore.admissions[admissionIndex],
    paymentStatus,
    paymentNotes: notes || '',
    paymentConfirmedAt: confirmedAt,
    workflowHistory: appendAdmissionHistory(
      adminStore.admissions[admissionIndex],
      'payment.updated',
      `Payment status marked as ${paymentStatus}.${notes ? ` Notes: ${notes}` : ''}`
    )
  };

  const updated = adminStore.admissions[admissionIndex];
  if (admissionQualifiesForFullAdmission(updated)) {
    return promoteQualifiedAdmission({
      admissionIndex,
      auditContext: buildAuditContext(req, 201)
    })
      .then((result) => res.status(201).json({
        message: 'Admission promoted to student record.',
        student: result.student ? enrichStudent(result.student) : null,
        credentials: result.credentials || [],
        deleted: result.deleted,
        archived: result.archived || null
      }))
      .catch((error) => res.status(400).json({ message: error.message || 'Unable to provision portal accounts for admission.' }));
  }

  return res.json({ admission: enrichAdmission(updated) });
});

adminRouter.put('/admissions/:id/delivery', (req, res) => {
  const { id } = req.params;
  const portalDeliveryStatus = normalizeLowerText(req.body?.portalDeliveryStatus);
  const notes = String(req.body?.notes || '').trim();
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const allowedStatuses = ['pending', 'sent', 'manual-only', 'disabled', 'skipped', 'confirmed'];
  if (!allowedStatuses.includes(portalDeliveryStatus)) {
    return res.status(400).json({ message: `portalDeliveryStatus must be one of ${allowedStatuses.join(', ')}.` });
  }

  if ((adminStore.admissions[admissionIndex].portalDeliveryStatus || 'pending') === portalDeliveryStatus) {
    return res.status(400).json({ message: `Portal delivery is already ${portalDeliveryStatus}.` });
  }

  adminStore.admissions[admissionIndex] = {
    ...adminStore.admissions[admissionIndex],
    portalDeliveryStatus,
    portalDeliveryNotes: notes || adminStore.admissions[admissionIndex].portalDeliveryNotes || '',
    portalDeliveryAt: new Date().toISOString(),
    workflowHistory: appendAdmissionHistory(
      adminStore.admissions[admissionIndex],
      'portal.delivery.updated',
      `Portal delivery status marked as ${portalDeliveryStatus}.${notes ? ` Notes: ${notes}` : ''}`
    )
  };

  return res.json({ admission: enrichAdmission(adminStore.admissions[admissionIndex]) });
});

adminRouter.put('/admissions/:id/interview', (req, res) => {
  const { id } = req.params;
  const interviewDate = String(req.body?.interviewDate || '').trim();
  const interviewMode = String(req.body?.interviewMode || '').trim();
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const current = adminStore.admissions[admissionIndex];

  if (current.status === 'rejected') {
    return res.status(400).json({ message: 'Rejected applications cannot be scheduled for interview.' });
  }

  if (current.promotedStudentId) {
    return res.status(400).json({ message: 'This admission has already been promoted to a student record.' });
  }

  if (!interviewDate || !interviewMode) {
    return res.status(400).json({ message: 'interviewDate and interviewMode are required.' });
  }
  if (Number.isNaN(new Date(interviewDate).getTime())) {
    return res.status(400).json({ message: 'interviewDate must be a valid date/time.' });
  }
  if ((current.interviewDate || '') === interviewDate && (current.interviewMode || '') === interviewMode) {
    return res.status(400).json({ message: 'Interview is already scheduled for this date and mode.' });
  }

  adminStore.admissions[admissionIndex] = {
    ...current,
    interviewDate,
    interviewMode,
    workflowHistory: appendAdmissionHistory(
      current,
      'interview.scheduled',
      `Interview scheduled for ${interviewDate} via ${interviewMode}.`
    )
  };

  const scheduledAdmission = adminStore.admissions[admissionIndex];
  const interviewNotice = formatInterviewSchedule(interviewDate, interviewMode);

  appendNotification({
    title: 'Interview scheduled',
    message: `${scheduledAdmission.fullName}: ${interviewNotice.message}`,
    roleTarget: 'parent',
    recipientEmail: scheduledAdmission.email || '',
    recipientPhone: scheduledAdmission.phone || '',
    meta: {
      admissionId: id,
      institution: scheduledAdmission.institution,
      category: 'admissions'
    }
  });

  return Promise.resolve(
    sendAdminNotificationEmail({
      recipientName: scheduledAdmission.guardianName || scheduledAdmission.fullName,
      recipientEmail: scheduledAdmission.email || '',
      title: 'Interview scheduled',
      message: interviewNotice.message,
      roleLabel: 'Guardian'
    })
  )
    .catch((error) => ({
      status: 'failed',
      reason: error?.message || 'Email delivery failed.'
    }))
    .then((delivery) => res.json({ admission: enrichAdmission(scheduledAdmission), delivery }));
});

adminRouter.post('/admissions/:id/offer', (req, res) => {
  const { id } = req.params;
  const offerStatus = normalizeLowerText(req.body?.offerStatus || 'sent') || 'sent';
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const current = adminStore.admissions[admissionIndex];
  const currentOfferStatus = current.offerStatus || 'none';

  if (!['sent', 'accepted', 'declined'].includes(offerStatus)) {
    return res.status(400).json({ message: 'offerStatus must be sent, accepted, or declined.' });
  }

  if (current.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved applications can receive offer updates.' });
  }

  if ((current.verificationStatus || 'pending') !== 'verified') {
    return res.status(400).json({ message: 'Verify admission documents before sending or updating offers.' });
  }

  if (current.promotedStudentId) {
    return res.status(400).json({ message: 'This admission has already been promoted to a student record.' });
  }

  if (currentOfferStatus === offerStatus) {
    return res.status(400).json({ message: `Offer is already ${offerStatus}.` });
  }

  if (['accepted', 'declined'].includes(currentOfferStatus)) {
    return res.status(400).json({ message: 'Finalized offers cannot be changed.' });
  }

  if (['accepted', 'declined'].includes(offerStatus) && currentOfferStatus !== 'sent') {
    return res.status(400).json({ message: 'Offer must be sent before it can be accepted or declined.' });
  }

  if (offerStatus === 'sent' && ['accepted', 'declined'].includes(currentOfferStatus)) {
    return res.status(400).json({ message: 'Finalized offers cannot be reset to sent.' });
  }

  const ref = `OFF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  adminStore.admissions[admissionIndex] = {
    ...current,
    offerStatus,
    offerLetterRef: ref,
    offerSentAt: new Date().toISOString(),
    workflowHistory: appendAdmissionHistory(
      current,
      'offer.generated',
      `Offer status updated to ${offerStatus} with reference ${ref}.`
    )
  };

  appendNotification({
    title: 'Admission offer update',
    message: `${adminStore.admissions[admissionIndex].fullName}: offer status is now ${offerStatus}. Reference: ${ref}.`,
    roleTarget: 'parent',
    recipientEmail: adminStore.admissions[admissionIndex].email || '',
    recipientPhone: adminStore.admissions[admissionIndex].phone || '',
    meta: {
      admissionId: id,
      institution: adminStore.admissions[admissionIndex].institution,
      category: 'admissions'
    }
  });

  return res.status(201).json({
    message: 'Offer letter generated.',
    admission: enrichAdmission(adminStore.admissions[admissionIndex]),
    offerLetter: {
      reference: ref,
      candidate: adminStore.admissions[admissionIndex].fullName,
      level: adminStore.admissions[admissionIndex].level,
      institution: adminStore.admissions[admissionIndex].institution,
      generatedAt: new Date().toISOString()
    }
  });
});

adminRouter.post('/admissions/:id/promote', async (req, res) => {
  const { id } = req.params;
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);
  const archiveIndex = (adminStore.admissionArchive || []).findIndex((item) => item.admissionId === id);

  if (admissionIndex === -1 && archiveIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const admission = admissionIndex >= 0
    ? adminStore.admissions[admissionIndex]
    : adminStore.admissionArchive[archiveIndex];

  if (admission.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved admissions can be promoted.' });
  }

  if ((admission.verificationStatus || 'pending') !== 'verified') {
    return res.status(400).json({ message: 'Admission documents must be verified before promotion.' });
  }

  if ((admission.paymentStatus || 'pending') !== 'confirmed') {
    return res.status(400).json({ message: 'Payment must be confirmed before full admission.' });
  }

  if (!String(admission.studentEmail || '').trim()) {
    return res.status(400).json({ message: 'Student email is required before portal access can be issued.' });
  }

  if (admission.promotedStudentId) {
    return res.status(409).json({ message: 'Admission has already been promoted.' });
  }

  try {
    const result = await promoteQualifiedAdmission({
      admissionIndex,
      archiveIndex,
      auditContext: buildAuditContext(req, 201)
    });

    return res.status(201).json({
      message: 'Admission promoted to student record.',
      student: result.student ? enrichStudent(result.student) : null,
      credentials: result.credentials || [],
      deleted: result.deleted,
      archived: result.archived || null
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to provision portal accounts for admission.' });
  }
});

adminRouter.post('/system/save', async (_req, res) => {
  await saveStoreToDatabase({ force: true });
  return res.json({ message: 'Store saved to PostgreSQL.' });
});

adminRouter.post('/system/refresh', async (_req, res) => {
  await reloadAdminStoreFromDatabase({ force: true });
  return res.json({ message: 'Portal state refreshed from PostgreSQL.' });
});

adminRouter.post('/system/reconcile-students', async (req, res) => {
  const dryRun = Boolean(req.body?.dryRun);
  const forceInlineDelivery = Boolean(req.body?.forceInlineDelivery);

  try {
    const report = await reconcileAdmissionsAndStudents({
      dryRun,
      forceInlineDelivery,
      auditContext: buildAuditContext(req, dryRun ? 200 : 201)
    });

    if (!dryRun) {
      await saveStoreToDatabase({ force: true });
    }

    return res.json({
      message: dryRun
        ? 'Reconciliation preview completed.'
        : 'Admissions and student lifecycle reconciliation completed.',
      report
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to reconcile admissions and students.' });
  }
});

adminRouter.get('/system/backup', async (_req, res) => {
  await saveStoreToDatabase({ force: true });
  return res.json({
    generatedAt: new Date().toISOString(),
    store: adminStore
  });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const actorRole = req.query.actorRole ? String(req.query.actorRole) : '';
  const method = req.query.method ? String(req.query.method).toUpperCase() : '';
  const statusCode = req.query.statusCode ? Number(req.query.statusCode) : 0;
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';

  const rows = await listActivityLogs({ actorRole, method, statusCode, search, limit });

  return res.json({ logs: rows, total: rows.length });
});

export default adminRouter;
