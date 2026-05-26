import { Router } from 'express';
import { env } from '../config/env.js';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser } from '../utils/portalScope.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { resolveStudentByIdentifier } from '../utils/studentCode.js';
import { createResultTokens, assignResultToken, getAssignedResultToken } from '../repositories/resultTokenRepository.js';

const feesRouter = Router();
const SCHOOL_FEE_PAYMENT = 'school_fee';
const SCRATCH_CARD_PAYMENT = 'scratch_card';

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0] || null;
  return active?.id || '';
}

function normalizeSessionId(value = '') {
  return String(value || '').trim() || getActiveSessionId();
}

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

function resolveLatestTerm(values = []) {
  return values.reduce((latest, value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return latest;
    if (!latest) return normalized;
    return TERM_ORDER.indexOf(normalized) > TERM_ORDER.indexOf(latest) ? normalized : latest;
  }, '');
}

function resolveEnrollmentClassId(studentId, sessionId = '') {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function getScratchCardSettings() {
  return {
    title: 'Buy Scratch Card',
    bankName: env.scratchCardBankName,
    accountName: env.scratchCardAccountName,
    accountNumber: env.scratchCardAccountNumber,
    amountLabel: env.scratchCardAmountLabel,
    guide: env.scratchCardGuide
  };
}

function resolveCurrentTokenTerm(sessionId = '') {
  const publishedResultsTerm = resolveLatestTerm(
    (adminStore.results || [])
      .filter((item) => item.published && matchesSession(item.sessionId, sessionId))
      .map((item) => item.term)
  );
  if (publishedResultsTerm) return publishedResultsTerm;

  const requestTerm = resolveLatestTerm(
    (adminStore.paymentRequests || [])
      .filter((item) => matchesSession(item.sessionId, sessionId))
      .map((item) => item.term)
  );
  if (requestTerm) return requestTerm;

  const paymentTerm = resolveLatestTerm(
    (adminStore.payments || [])
      .filter((item) => matchesSession(item.sessionId, sessionId))
      .map((item) => item.term)
  );
  return paymentTerm || 'First Term';
}

function getTokenSalesControl(sessionId = '', term = '') {
  return (adminStore.tokenSalesControls || []).find(
    (item) => matchesSession(item.sessionId, sessionId) && String(item.term || '').trim() === String(term || '').trim()
  ) || null;
}

function isTokenSaleEnabled(sessionId = '', term = '') {
  return Boolean(getTokenSalesControl(sessionId, term)?.enabled);
}

async function buildReleasedTokenPayload(studentId, term, sessionId) {
  const token = await getAssignedResultToken({ studentId, term, sessionId, includeToken: true });
  if (!token) return null;
  return {
    id: token.id,
    token: token.token,
    tokenPreview: token.tokenPreview,
    term: token.term,
    sessionId: token.sessionId,
    status: token.status,
    assignedAt: token.assignedAt || '',
    expiresAt: token.expiresAt || '',
    remainingUses: token.remainingUses
  };
}

function calculateStudentBalance(studentId, options = {}) {
  const term = String(options.term || '').trim();
  const sessionId = normalizeSessionId(options.sessionId);
  const student = adminStore.students.find((item) => item.id === studentId);
  if (!student) return null;
  const classId = options.classIdOverride || resolveEnrollmentClassId(studentId, sessionId) || student.classId;

  const plans = adminStore.feePlans.filter(
    (plan) =>
      plan.classId === classId &&
      matchesSession(plan.sessionId, sessionId) &&
      plan.published !== false &&
      (!term || plan.term === term)
  );
  const payments = adminStore.payments.filter(
    (payment) =>
      payment.studentId === studentId &&
      matchesSession(payment.sessionId, sessionId) &&
      (payment.paymentType || SCHOOL_FEE_PAYMENT) === SCHOOL_FEE_PAYMENT &&
      (!term || payment.term === term)
  );

  const totalPlan = plans.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);

  return {
    student,
    plans,
    payments,
    sessionId,
    term: term || 'All Terms',
    totalPlan,
    totalPaid,
    balance: totalPlan - totalPaid
  };
}

feesRouter.get('/admin/plans', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const sessionId = normalizeSessionId(req.query.sessionId);
  const plans = adminStore.feePlans.filter((item) => matchesSession(item.sessionId, sessionId));
  return res.json({ plans, sessionId });
});

feesRouter.post('/admin/plans', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const amount = req.body?.amount;
  const sessionId = normalizeSessionId(req.body?.sessionId);
  if (!classId || !term || amount === undefined) {
    return res.status(400).json({ message: 'classId, term, amount are required.' });
  }
  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({ message: 'amount must be a positive number.' });
  }

  const classExists = adminStore.classes.some((item) => item.id === classId);
  if (!classExists) return res.status(400).json({ message: 'Invalid classId.' });
  const duplicatePlan = adminStore.feePlans.some(
    (item) => item.classId === classId && item.term === term && matchesSession(item.sessionId, sessionId)
  );
  if (duplicatePlan) {
    return res.status(400).json({ message: 'A fee plan already exists for this class, term, and session.' });
  }

  const shouldPublish = req.body?.published === undefined
    ? req.user?.role !== 'admissions'
    : Boolean(req.body?.published);
  const timestamp = shouldPublish ? new Date().toISOString() : '';

  const plan = {
    id: makeId('fee'),
    classId,
    term,
    amount: normalizedAmount,
    sessionId,
    published: shouldPublish,
    publishedAt: timestamp,
    publishedByUserId: shouldPublish ? String(req.user?.sub || req.user?.id || '') : '',
    publishedByEmail: shouldPublish ? String(req.user?.email || '') : ''
  };
  adminStore.feePlans.unshift(plan);
  return res.status(201).json({ plan });
});

feesRouter.put('/admin/plans/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.feePlans.findIndex((item) => item.id === id);
  if (index === -1) return res.status(404).json({ message: 'Fee plan not found.' });

  const current = adminStore.feePlans[index];
  const classId = String(req.body?.classId ?? current.classId).trim();
  const term = String(req.body?.term ?? current.term).trim();
  const amount = req.body?.amount ?? current.amount;
  const sessionId = normalizeSessionId(req.body?.sessionId ?? current.sessionId);

  if (!classId || !term || amount === undefined) {
    return res.status(400).json({ message: 'classId, term, amount are required.' });
  }
  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({ message: 'amount must be a positive number.' });
  }

  const classExists = adminStore.classes.some((item) => item.id === classId);
  if (!classExists) return res.status(400).json({ message: 'Invalid classId.' });

  const duplicatePlan = adminStore.feePlans.some(
    (item) =>
      item.id !== id &&
      item.classId === classId &&
      item.term === term &&
      matchesSession(item.sessionId, sessionId)
  );
  if (duplicatePlan) {
    return res.status(400).json({ message: 'A fee plan already exists for this class, term, and session.' });
  }

  const shouldPublish = req.body?.published === undefined ? current.published !== false : Boolean(req.body?.published);
  const publishedChanged = shouldPublish !== (current.published !== false);

  adminStore.feePlans[index] = {
    ...current,
    classId,
    term,
    amount: normalizedAmount,
    sessionId,
    published: shouldPublish,
    publishedAt: shouldPublish ? (publishedChanged ? new Date().toISOString() : current.publishedAt || '') : '',
    publishedByUserId: shouldPublish ? String(req.user?.sub || req.user?.id || current.publishedByUserId || '') : '',
    publishedByEmail: shouldPublish ? String(req.user?.email || current.publishedByEmail || '') : ''
  };

  return res.json({ plan: adminStore.feePlans[index] });
});

feesRouter.put('/admin/plans/:id/publish', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.feePlans.findIndex((item) => item.id === id);
  if (index === -1) return res.status(404).json({ message: 'Fee plan not found.' });

  const current = adminStore.feePlans[index];
  const published = Boolean(req.body?.published);

  adminStore.feePlans[index] = {
    ...current,
    published,
    publishedAt: published ? new Date().toISOString() : '',
    publishedByUserId: published ? String(req.user?.sub || req.user?.id || '') : '',
    publishedByEmail: published ? String(req.user?.email || '') : ''
  };

  return res.json({ plan: adminStore.feePlans[index] });
});

feesRouter.delete('/admin/plans/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const index = adminStore.feePlans.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Fee plan not found.' });
  adminStore.feePlans.splice(index, 1);
  return res.json({ message: 'Fee plan deleted.' });
});

feesRouter.get('/admin/payments', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const sessionId = normalizeSessionId(req.query.sessionId);
  const tokenSalesTerm = resolveCurrentTokenTerm(sessionId);
  const payments = adminStore.payments.filter((item) => matchesSession(item.sessionId, sessionId));
  const paymentRequests = (adminStore.paymentRequests || [])
    .filter((item) => matchesSession(item.sessionId, sessionId))
    .map((request) => {
      const student = adminStore.students.find((item) => item.id === request.studentId);
      return {
        ...request,
        studentName: student?.fullName || request.studentId,
        classId: resolveEnrollmentClassId(request.studentId, sessionId) || student?.classId || '',
        releasedTokenId: request.releasedTokenId || '',
        tokenReleasedAt: request.tokenReleasedAt || ''
      };
    });
  return res.json({
    payments,
    paymentRequests,
    sessionId,
    tokenSalesControl: {
      term: tokenSalesTerm,
      enabled: isTokenSaleEnabled(sessionId, tokenSalesTerm)
    }
  });
});

feesRouter.get('/admin/token-sales-control', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const sessionId = normalizeSessionId(req.query.sessionId);
  const requestedTerm = String(req.query.term || '').trim();
  const term = requestedTerm || resolveCurrentTokenTerm(sessionId);

  return res.json({
    tokenSalesControl: {
      sessionId,
      term,
      enabled: isTokenSaleEnabled(sessionId, term)
    }
  });
});

feesRouter.put('/admin/token-sales-control', requireAuth, requireRole('admin'), (req, res) => {
  const sessionId = normalizeSessionId(req.body?.sessionId);
  const requestedTerm = String(req.body?.term || '').trim();
  const term = requestedTerm || resolveCurrentTokenTerm(sessionId);
  const enabled = Boolean(req.body?.enabled);

  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }
  if (!term) {
    return res.status(400).json({ message: 'Term is required for token sale control.' });
  }

  if (!adminStore.tokenSalesControls) adminStore.tokenSalesControls = [];
  const existing = adminStore.tokenSalesControls.find(
    (item) => matchesSession(item.sessionId, sessionId) && String(item.term || '').trim() === term
  );

  if (existing) {
    existing.enabled = enabled;
    existing.enabledAt = new Date().toISOString();
    existing.enabledByUserId = String(req.user?.sub || req.user?.id || '');
    existing.enabledByEmail = String(req.user?.email || '');
  } else {
    adminStore.tokenSalesControls.unshift({
      sessionId,
      term,
      enabled,
      enabledAt: new Date().toISOString(),
      enabledByUserId: String(req.user?.sub || req.user?.id || ''),
      enabledByEmail: String(req.user?.email || '')
    });
  }

  return res.json({
    tokenSalesControl: {
      sessionId,
      term,
      enabled
    }
  });
});

feesRouter.post('/admin/payments', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const studentId = String(req.body?.studentId || '').trim();
  const term = String(req.body?.term || '').trim();
  const amountPaid = req.body?.amountPaid;
  const method = String(req.body?.method || '').trim();
  const sessionId = normalizeSessionId(req.body?.sessionId);
  if (!studentId || !term || amountPaid === undefined || !method) {
    return res.status(400).json({ message: 'studentId, term, amountPaid, method are required.' });
  }
  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }

  const normalizedAmountPaid = Number(amountPaid);
  if (!Number.isFinite(normalizedAmountPaid) || normalizedAmountPaid <= 0) {
    return res.status(400).json({ message: 'amountPaid must be a positive number.' });
  }

  const student = adminStore.students.find((item) => item.id === studentId);
  if (!student) return res.status(400).json({ message: 'Invalid studentId.' });
  const classId = resolveEnrollmentClassId(studentId, sessionId) || student.classId || '';
  if (!classId) {
    return res.status(400).json({ message: 'Student must belong to a class before payments can be recorded.' });
  }

  const payment = {
    id: makeId('pay'),
    studentId,
    term,
    amountPaid: normalizedAmountPaid,
    method,
    paymentType: SCHOOL_FEE_PAYMENT,
    sessionId,
    paidAt: new Date().toISOString()
  };

  adminStore.payments.unshift(payment);
  return res.status(201).json({ payment });
});

feesRouter.put('/admin/payment-requests/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const request = (adminStore.paymentRequests || []).find((item) => item.id === req.params.id);
  if (!request) return res.status(404).json({ message: 'Payment request not found.' });
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'This payment request has already been reviewed.' });
  }

  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be approved or rejected.' });
  }

  request.status = status;
  request.reviewNote = note;
  request.reviewedAt = new Date().toISOString();
  request.reviewedByUserId = String(req.user?.sub || '');
  request.reviewedByEmail = String(req.user?.email || '');

  let payment = null;
  if (status === 'approved') {
    payment = {
      id: makeId('pay'),
      studentId: request.studentId,
      term: request.term,
      amountPaid: Number(request.amountPaid || 0),
      method: request.method || 'receipt upload',
      paymentType: SCRATCH_CARD_PAYMENT,
      sessionId: request.sessionId,
      paidAt: request.reviewedAt,
      receiptRequestId: request.id
    };
    adminStore.payments.unshift(payment);
  }

  return res.json({ paymentRequest: request, payment });
});

feesRouter.post('/admin/payment-requests/:id/release-token', requireAuth, requireRole('admin', 'admissions'), async (req, res) => {
  const request = (adminStore.paymentRequests || []).find((item) => item.id === req.params.id);
  if (!request) return res.status(404).json({ message: 'Payment request not found.' });
  if (request.status !== 'approved') {
    return res.status(400).json({ message: 'Approve the receipt before releasing a result token.' });
  }
  if (!isTokenSaleEnabled(request.sessionId, request.term)) {
    return res.status(400).json({ message: 'Token sales are closed for this term. Ask the admin to enable token sales first.' });
  }

  const student = adminStore.students.find((item) => item.id === request.studentId);
  if (!student) {
    return res.status(404).json({ message: 'Student record for this receipt is missing.' });
  }

  const existingToken = await getAssignedResultToken({
    studentId: request.studentId,
    term: request.term,
    sessionId: request.sessionId,
    includeToken: true
  });

  if (existingToken) {
    request.releasedTokenId = existingToken.id;
    request.tokenReleasedAt = request.tokenReleasedAt || new Date().toISOString();
    request.tokenReleasedByUserId = request.tokenReleasedByUserId || String(req.user?.sub || '');
    request.tokenReleasedByEmail = request.tokenReleasedByEmail || String(req.user?.email || '');
    return res.json({
      paymentRequest: request,
      releasedToken: await buildReleasedTokenPayload(request.studentId, request.term, request.sessionId)
    });
  }

  const [createdToken] = await createResultTokens({
    quantity: 1,
    term: request.term,
    sessionId: request.sessionId,
    createdByUserId: String(req.user?.sub || ''),
    length: 10
  });

  const assigned = await assignResultToken({
    tokenId: createdToken?.id || '',
    tokenValue: createdToken?.token || '',
    studentId: request.studentId,
    assignedByUserId: String(req.user?.sub || '')
  });

  if (assigned.error) {
    return res.status(400).json({ message: assigned.error });
  }

  request.releasedTokenId = assigned.token?.id || createdToken?.id || '';
  request.tokenReleasedAt = new Date().toISOString();
  request.tokenReleasedByUserId = String(req.user?.sub || '');
  request.tokenReleasedByEmail = String(req.user?.email || '');

  return res.json({
    paymentRequest: request,
    releasedToken: await buildReleasedTokenPayload(request.studentId, request.term, request.sessionId)
  });
});

feesRouter.delete('/admin/payments/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const index = adminStore.payments.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Payment not found.' });
  adminStore.payments.splice(index, 1);
  return res.json({ message: 'Payment deleted.' });
});

feesRouter.post('/admin/payments/bulk', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const amountPaid = Number(req.body?.amountPaid || 0);
  const method = String(req.body?.method || '').trim() || 'cash';
  const sessionId = normalizeSessionId(req.body?.sessionId);
  const identifiers = Array.isArray(req.body?.studentIdentifiers) ? req.body.studentIdentifiers : [];

  if (!sessionId) {
    return res.status(400).json({ message: 'Active academic session is required.' });
  }
  if (!classId) {
    return res.status(400).json({ message: 'classId is required for bulk payments.' });
  }
  if (!term) {
    return res.status(400).json({ message: 'term is required for bulk payments.' });
  }
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return res.status(400).json({ message: 'amountPaid must be a positive number.' });
  }
  if (!identifiers.length) {
    return res.status(400).json({ message: 'studentIdentifiers array is required.' });
  }

  const payments = [];
  const errors = [];

  identifiers.forEach((raw, index) => {
    const identifier = String(raw || '').trim();
    if (!identifier) return;

    let student = resolveStudentByIdentifier(adminStore.students || [], identifier);
    if (!student) {
      student = adminStore.students.find(
        (item) =>
          item.classId === classId &&
          String(item.fullName || '').trim().toLowerCase() === identifier.toLowerCase()
      );
    }

    if (!student) {
      errors.push({ index, identifier, error: 'Student not found.' });
      return;
    }

    const resolvedClassId = resolveEnrollmentClassId(student.id, sessionId) || student.classId || '';
    if (resolvedClassId !== classId) {
      errors.push({ index, identifier, error: 'Student does not belong to selected class.' });
      return;
    }

    const payment = {
      id: makeId('pay'),
      studentId: student.id,
      term,
      amountPaid,
      method,
      paymentType: SCHOOL_FEE_PAYMENT,
      sessionId,
      paidAt: new Date().toISOString()
    };

    adminStore.payments.unshift(payment);
    payments.push(payment);
  });

  return res.status(201).json({
    message: 'Bulk payments recorded.',
    createdCount: payments.length,
    errorCount: errors.length,
    payments,
    errors
  });
});

feesRouter.get('/admin/defaulters', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const term = req.query.term ? String(req.query.term) : '';
  const sessionId = normalizeSessionId(req.query.sessionId);
  const defaulters = filterCountableActiveStudents(adminStore.students)
    .map((student) => calculateStudentBalance(student.id, { term, sessionId }))
    .filter((item) => item && item.balance > 0);

  return res.json({ defaulters, term: term || 'All Terms', sessionId });
});

feesRouter.get('/student', requireAuth, requireRole('student'), async (req, res) => {
  const student = findStudentByUser(req.user);
  const term = req.query.term ? String(req.query.term) : '';
  const sessionId = normalizeSessionId(req.query.sessionId);
  if (!student) return res.json({ summary: null });

  const summary = calculateStudentBalance(student.id, { term, sessionId });
  const paymentRequests = (adminStore.paymentRequests || [])
    .filter((request) => request.studentId === student.id)
    .filter((request) => matchesSession(request.sessionId, sessionId))
    .filter((request) => (!term || request.term === term))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return res.json({
    summary,
    student,
    sessionId,
    paymentRequests,
    scratchCard: getScratchCardSettings(),
    releasedToken: await buildReleasedTokenPayload(student.id, term || 'First Term', sessionId),
    tokenSalesControl: {
      term,
      enabled: isTokenSaleEnabled(sessionId, term)
    }
  });
});

feesRouter.get('/parent', requireAuth, requireRole('parent'), async (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  const term = req.query.term ? String(req.query.term) : '';
  const sessionId = normalizeSessionId(req.query.sessionId);
  if (!child) return res.json({ summary: null, child: null, children });

  const summary = calculateStudentBalance(child.id, { term, sessionId });
  const paymentRequests = (adminStore.paymentRequests || [])
    .filter((request) => request.studentId === child.id)
    .filter((request) => matchesSession(request.sessionId, sessionId))
    .filter((request) => (!term || request.term === term))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return res.json({
    summary,
    child,
    children,
    sessionId,
    paymentRequests,
    scratchCard: getScratchCardSettings(),
    releasedToken: await buildReleasedTokenPayload(child.id, term || 'First Term', sessionId),
    tokenSalesControl: {
      term,
      enabled: isTokenSaleEnabled(sessionId, term)
    }
  });
});

feesRouter.post('/student/payment-requests', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  const term = String(req.body?.term || '').trim();
  const sessionId = normalizeSessionId(req.body?.sessionId);
  const amountPaid = Number(req.body?.amountPaid || 0);
  const method = String(req.body?.method || 'receipt upload').trim() || 'receipt upload';
  const receiptName = String(req.body?.receiptName || '').trim();
  const receiptDataUrl = String(req.body?.receiptDataUrl || '').trim();

  if (!student) return res.status(400).json({ message: 'No student profile found for this portal account.' });
  if (!term || !sessionId) return res.status(400).json({ message: 'term and active session are required.' });
  if (!isTokenSaleEnabled(sessionId, term)) {
    return res.status(400).json({ message: 'Result token sales are not open yet for this term. Wait for the admin to enable token sales after results are out.' });
  }
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return res.status(400).json({ message: 'amountPaid must be a positive number.' });
  }
  if (!receiptDataUrl) {
    return res.status(400).json({ message: 'Upload a receipt before submitting payment confirmation.' });
  }
  if (receiptDataUrl.length > 2_000_000) {
    return res.status(400).json({ message: 'Receipt upload is too large. Use a compressed image or PDF under 2MB.' });
  }

  const paymentRequest = {
    id: makeId('payreq'),
    studentId: student.id,
    parentUserId: '',
    parentEmail: '',
    submittedByRole: 'student',
    submittedByUserId: String(req.user?.sub || ''),
    submittedByEmail: String(req.user?.email || ''),
    term,
    sessionId,
    amountPaid,
    method,
    requestType: SCRATCH_CARD_PAYMENT,
    receiptName,
    receiptDataUrl,
    status: 'pending',
    reviewNote: '',
    reviewedAt: '',
    reviewedByUserId: '',
    reviewedByEmail: '',
    releasedTokenId: '',
    tokenReleasedAt: '',
    tokenReleasedByUserId: '',
    tokenReleasedByEmail: '',
    createdAt: new Date().toISOString()
  };

  if (!adminStore.paymentRequests) adminStore.paymentRequests = [];
  adminStore.paymentRequests.unshift(paymentRequest);
  return res.status(201).json({ paymentRequest });
});

feesRouter.post('/parent/payment-requests', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.body?.childId || '')) || children[0] || null;
  const term = String(req.body?.term || '').trim();
  const sessionId = normalizeSessionId(req.body?.sessionId);
  const amountPaid = Number(req.body?.amountPaid || 0);
  const method = String(req.body?.method || 'receipt upload').trim() || 'receipt upload';
  const receiptName = String(req.body?.receiptName || '').trim();
  const receiptDataUrl = String(req.body?.receiptDataUrl || '').trim();

  if (!child) return res.status(400).json({ message: 'No child profile found for this parent.' });
  if (!term || !sessionId) return res.status(400).json({ message: 'term and active session are required.' });
  if (!isTokenSaleEnabled(sessionId, term)) {
    return res.status(400).json({ message: 'Result token sales are not open yet for this term. Wait for the admin to enable token sales after results are out.' });
  }
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return res.status(400).json({ message: 'amountPaid must be a positive number.' });
  }
  if (!receiptDataUrl) {
    return res.status(400).json({ message: 'Upload a receipt before submitting payment confirmation.' });
  }
  if (receiptDataUrl.length > 2_000_000) {
    return res.status(400).json({ message: 'Receipt upload is too large. Use a compressed image or PDF under 2MB.' });
  }

  const paymentRequest = {
    id: makeId('payreq'),
    studentId: child.id,
    parentUserId: String(req.user?.sub || ''),
    parentEmail: String(req.user?.email || ''),
    submittedByRole: 'parent',
    submittedByUserId: String(req.user?.sub || ''),
    submittedByEmail: String(req.user?.email || ''),
    term,
    sessionId,
    amountPaid,
    method,
    requestType: SCRATCH_CARD_PAYMENT,
    receiptName,
    receiptDataUrl,
    status: 'pending',
    reviewNote: '',
    reviewedAt: '',
    reviewedByUserId: '',
    reviewedByEmail: '',
    releasedTokenId: '',
    tokenReleasedAt: '',
    tokenReleasedByUserId: '',
    tokenReleasedByEmail: '',
    createdAt: new Date().toISOString()
  };

  if (!adminStore.paymentRequests) adminStore.paymentRequests = [];
  adminStore.paymentRequests.unshift(paymentRequest);
  return res.status(201).json({ paymentRequest });
});

export default feesRouter;
