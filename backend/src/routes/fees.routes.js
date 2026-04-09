import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser } from '../utils/portalScope.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { resolveStudentByIdentifier } from '../utils/studentCode.js';

const feesRouter = Router();

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

function resolveEnrollmentClassId(studentId, sessionId = '') {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function calculateStudentBalance(studentId, options = {}) {
  const term = String(options.term || '').trim();
  const sessionId = normalizeSessionId(options.sessionId);
  const student = adminStore.students.find((item) => item.id === studentId);
  if (!student) return null;
  const classId = options.classIdOverride || resolveEnrollmentClassId(studentId, sessionId) || student.classId;

  const plans = adminStore.feePlans.filter(
    (plan) => plan.classId === classId && matchesSession(plan.sessionId, sessionId) && (!term || plan.term === term)
  );
  const payments = adminStore.payments.filter(
    (payment) => payment.studentId === studentId && matchesSession(payment.sessionId, sessionId) && (!term || payment.term === term)
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

  const plan = { id: makeId('fee'), classId, term, amount: normalizedAmount, sessionId };
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

  adminStore.feePlans[index] = {
    ...current,
    classId,
    term,
    amount: normalizedAmount,
    sessionId
  };

  return res.json({ plan: adminStore.feePlans[index] });
});

feesRouter.get('/admin/payments', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const sessionId = normalizeSessionId(req.query.sessionId);
  const payments = adminStore.payments.filter((item) => matchesSession(item.sessionId, sessionId));
  return res.json({ payments, sessionId });
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
    sessionId,
    paidAt: new Date().toISOString()
  };

  adminStore.payments.unshift(payment);
  return res.status(201).json({ payment });
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

feesRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  const term = req.query.term ? String(req.query.term) : '';
  const sessionId = normalizeSessionId(req.query.sessionId);
  if (!student) return res.json({ summary: null });

  const summary = calculateStudentBalance(student.id, { term, sessionId });
  return res.json({ summary, student, sessionId });
});

feesRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  const term = req.query.term ? String(req.query.term) : '';
  const sessionId = normalizeSessionId(req.query.sessionId);
  if (!child) return res.json({ summary: null, child: null, children });

  const summary = calculateStudentBalance(child.id, { term, sessionId });
  return res.json({ summary, child, children, sessionId });
});

export default feesRouter;
