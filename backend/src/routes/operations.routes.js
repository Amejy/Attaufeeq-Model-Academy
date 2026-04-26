import { Router } from 'express';
import { env } from '../config/env.js';
import { adminStore, makeId, reloadAdminStoreFromDatabase } from '../data/adminStore.js';
import { withTransaction } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listClasses } from '../repositories/classRepository.js';
import { deleteStudentById, findStudentById, listStudents } from '../repositories/studentRepository.js';
import { deleteUserById } from '../repositories/userRepository.js';
import {
  createProvisionedStudentRecord,
  resolveStudentRegistrationInput,
  updateProvisionedStudentRecord
} from '../services/studentRegistrationService.js';
import { summarizeCredentialDelivery } from '../services/credentialDeliveryService.js';
import { sendAdminNotificationEmail } from '../utils/mailer.js';
import {
  createBulkStudentUploadSession,
  getBulkStudentUploadSession,
  listBulkStudentUploadSessions,
  clearBulkStudentUploadSessions
} from '../repositories/bulkUploadRepository.js';

const operationsRouter = Router();

operationsRouter.use(requireAuth, requireRole('admissions'));

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

function enrichAdmission(admission) {
  const classItem = adminStore.classes.find((item) => item.id === admission.classId);
  return {
    ...admission,
    program: resolveAdmissionProgram(admission),
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : admission.level || '',
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

function isUniqueViolation(error) {
  return error?.code === '23505';
}

function classLabel(classItem) {
  return classItem ? `${classItem.name} ${classItem.arm}` : '';
}

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0] || null;
  return active?.id || '';
}

function resolveEnrollmentClassId(studentId, sessionId = '') {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function enrichStudent(student) {
  const activeSessionId = getActiveSessionId();
  const enrolledClassId = resolveEnrollmentClassId(student.id, activeSessionId);
  const classId = enrolledClassId || student.classId;
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return {
    ...student,
    classId,
    classLabel: classLabel(classItem) || student.level || '',
    institution: classItem?.institution || student.institution || ''
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

async function promoteQualifiedAdmission(admissionIndex, auditContext) {
  const admission = adminStore.admissions[admissionIndex];
  if (!admission || admission.promotedStudentId) {
    return { promoted: false, student: null, credentials: [] };
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

  const deliverySummary = summarizeCredentialDelivery(deliveredCredentials);
  const promotedAt = new Date().toISOString();
  const portalDeliveryAt = new Date().toISOString();

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

  const { archived } = finalizeAdmission(admissionIndex, 'promoted');
  return {
    promoted: true,
    student: storedStudent,
    credentials: deliveredCredentials,
    archived,
    deleted: true
  };
}

operationsRouter.get('/students', async (req, res) => {
  const institution = req.query.institution ? String(req.query.institution) : '';
  const classId = req.query.classId ? String(req.query.classId) : '';
  const status = req.query.status ? String(req.query.status).toLowerCase() : '';
  const search = String(req.query.q || '').trim();
  const sort = String(req.query.sort || '').trim();
  const students = (await listStudents({ institution, classId, status, search, sort })).map(enrichStudent);
  return res.json({ students });
});

operationsRouter.post('/students', async (req, res) => {
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

operationsRouter.put('/students/:id', async (req, res) => {
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

operationsRouter.post('/students/bulk', async (req, res) => {
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

operationsRouter.get('/bulk-uploads/students', async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const offset = Number(req.query.offset || 0);

  try {
    const uploads = await listBulkStudentUploadSessions({ limit, offset });
    return res.json({ uploads });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load upload history.' });
  }
});

operationsRouter.get('/bulk-uploads/students/:id', async (req, res) => {
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

operationsRouter.post('/bulk-uploads/students', async (req, res) => {
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

operationsRouter.delete('/bulk-uploads/students', async (_req, res) => {
  try {
    await clearBulkStudentUploadSessions();
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to clear upload history.' });
  }
});

operationsRouter.post('/system/refresh', async (_req, res) => {
  await reloadAdminStoreFromDatabase({ force: true });
  return res.json({ message: 'Portal state refreshed from PostgreSQL.' });
});

operationsRouter.delete('/students/:id', async (req, res) => {
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

operationsRouter.get('/classes', async (req, res) => {
  const institution = req.query.institution ? String(req.query.institution) : '';
  const classes = await listClasses({ institution });
  return res.json({ classes });
});

operationsRouter.get('/admissions', (req, res) => {
  const institution = req.query.institution ? String(req.query.institution) : '';
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

operationsRouter.put('/admissions/:id', async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '').trim().toLowerCase();
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

  try {
    adminStore.admissions[admissionIndex] = {
      ...current,
      status,
      forwardedToAdminAt:
        status === 'approved' ? current.forwardedToAdminAt || new Date().toISOString() : current.forwardedToAdminAt || '',
      forwardedBy:
        status === 'approved' ? current.forwardedBy || req.user?.email || '' : current.forwardedBy || '',
      workflowHistory: appendAdmissionHistory(
        current,
        'desk.status.updated',
        status === 'approved'
          ? `Admissions desk approved this application and forwarded it to admin for final enrollment.`
          : `Admissions desk changed application status to ${status}.`
      )
    };

    if (shouldDeleteAdmission(adminStore.admissions[admissionIndex])) {
      const { archived } = finalizeAdmission(admissionIndex, 'rejected');
      return res.json({
        deleted: true,
        archived,
        student: null,
        credentials: []
      });
    }

    const updated = adminStore.admissions[admissionIndex];
    if (admissionQualifiesForFullAdmission(updated)) {
      const result = await promoteQualifiedAdmission(admissionIndex, buildAuditContext(req, 201));
      return res.status(201).json({
        message: 'Admission promoted to student record.',
        student: result.student ? enrichStudent(result.student) : null,
        credentials: result.credentials || [],
        deleted: result.deleted,
        archived: result.archived || null
      });
    }

    if (status === 'approved') {
      const delivery = await deliverAdmissionApprovalNotifications(updated);
      return res.json({
        admission: enrichAdmission(updated),
        student: null,
        credentials: [],
        delivery
      });
    }

    return res.json({
      admission: enrichAdmission(updated),
      student: null,
      credentials: [],
      delivery: null
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update admission status.' });
  }
});

operationsRouter.put('/admissions/:id/verification', (req, res) => {
  const { id } = req.params;
  const verificationStatus = String(req.body?.verificationStatus || '').trim().toLowerCase();
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
      'desk.documents.reviewed',
      `Admissions desk marked documents as ${verificationStatus}.${notes ? ` Notes: ${notes}` : ''}`
    )
  };

  if (shouldDeleteAdmission(adminStore.admissions[admissionIndex])) {
    const { archived } = finalizeAdmission(admissionIndex, 'rejected');
    return res.json({ deleted: true, archived });
  }

  const updated = adminStore.admissions[admissionIndex];
  if (admissionQualifiesForFullAdmission(updated)) {
    return promoteQualifiedAdmission(admissionIndex, buildAuditContext(req, 201))
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

operationsRouter.put('/admissions/:id/payment', (req, res) => {
  const { id } = req.params;
  const paymentStatus = String(req.body?.paymentStatus || '').trim().toLowerCase();
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
      'desk.payment.updated',
      `Admissions desk marked payment as ${paymentStatus}.${notes ? ` Notes: ${notes}` : ''}`
    )
  };

  const updated = adminStore.admissions[admissionIndex];
  const shouldAutoPromote = req.user?.role === 'admissions' && admissionQualifiesForFullAdmission(updated);

  if (shouldAutoPromote) {
    return promoteQualifiedAdmission(admissionIndex, buildAuditContext(req, 201))
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

operationsRouter.put('/admissions/:id/interview', (req, res) => {
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
      'desk.interview.scheduled',
      `Admissions desk scheduled interview for ${interviewDate} via ${interviewMode}.`
    )
  };

  const scheduledAdmission = adminStore.admissions[admissionIndex];
  const interviewNotice = formatInterviewSchedule(interviewDate, interviewMode);

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

operationsRouter.post('/admissions/:id/offer', (req, res) => {
  const { id } = req.params;
  const offerStatus = String(req.body?.offerStatus || 'sent').trim().toLowerCase() || 'sent';
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

  adminStore.admissions[admissionIndex] = {
    ...current,
    offerStatus,
    offerSentAt: new Date().toISOString(),
    workflowHistory: appendAdmissionHistory(
      current,
      'desk.offer.updated',
      `Admissions desk updated offer status to ${offerStatus}.`
    )
  };

  return res.status(201).json({
    admission: enrichAdmission(adminStore.admissions[admissionIndex])
  });
});

operationsRouter.post('/admissions/:id/forward', (req, res) => {
  const { id } = req.params;
  const admissionIndex = adminStore.admissions.findIndex((item) => item.id === id);

  if (admissionIndex === -1) {
    return res.status(404).json({ message: 'Admission record not found.' });
  }

  const current = adminStore.admissions[admissionIndex];

  if (current.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved applications can be forwarded to admin.' });
  }

  if ((current.verificationStatus || 'pending') !== 'verified') {
    return res.status(400).json({ message: 'Documents must be verified before forwarding to admin.' });
  }

  if (current.forwardedToAdminAt) {
    return res.status(400).json({ message: 'Admission has already been forwarded to admin.' });
  }

  adminStore.admissions[admissionIndex] = {
    ...current,
    forwardedToAdminAt: new Date().toISOString(),
    forwardedBy: req.user?.email || '',
    workflowHistory: appendAdmissionHistory(
      current,
      'desk.forwarded',
      `Admissions desk forwarded this application to admin for final enrollment.`
    )
  };

  return res.status(201).json({
    message: 'Admission forwarded to admin.',
    admission: enrichAdmission(adminStore.admissions[admissionIndex])
  });
});

export default operationsRouter;
