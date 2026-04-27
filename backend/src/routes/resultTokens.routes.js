import { Router } from 'express';
import { addActivityLog, adminStore } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { ensureActiveAcademicSession } from '../repositories/academicSessionRepository.js';
import { findUserById } from '../repositories/userRepository.js';
import {
  assignResultToken,
  createResultTokens,
  consumeResultTokenOnce,
  createResultTokenAccess,
  getResultTokenAccess,
  getResultTokenStats,
  getTokenState,
  listResultTokens,
  recordResultTokenAttempt
} from '../repositories/resultTokenRepository.js';
import { resolveStudentByIdentifier } from '../utils/studentCode.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';

const resultTokenRouter = Router();

const tokenCheckLimiter = createRateLimiter({
  name: 'result-token-check',
  windowMs: 60_000,
  maxRequests: 8
});

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

function normalizeSessionId(sessionId = '') {
  if (sessionId) return String(sessionId).trim();
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((item) => item.isActive) || sessions[0];
  return active?.id || '';
}

function resolveClassStudents(classId, sessionId = '') {
  if (!classId) return [];
  if (!sessionId) {
    return filterCountableActiveStudents(adminStore.students).filter((student) => student.classId === classId);
  }

  const enrollments = (adminStore.studentEnrollments || []).filter(
    (entry) => entry.classId === classId && entry.sessionId === sessionId
  );

  return enrollments
    .map((entry) => adminStore.students.find((student) => student.id === entry.studentId))
    .filter(Boolean);
}

function isResultsOpenForClass(classId) {
  if (!classId) return false;
  const openList = adminStore.resultsAccess || [];
  return openList.includes(classId);
}

// Token-only access: fee checks removed by design.

const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

function resolveLatestTerm(values = []) {
  return values.reduce((latest, value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return latest;
    if (!latest) return normalized;
    return TERM_ORDER.indexOf(normalized) > TERM_ORDER.indexOf(latest) ? normalized : latest;
  }, '');
}

function resolveAttendanceRate(studentId, term = '') {
  if (!studentId) return '—';
  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId);
  const activeTerm = term || resolveLatestTerm(allRows.map((record) => record.term));
  const rows = activeTerm
    ? allRows.filter((record) => String(record.term || '').trim() === activeTerm)
    : allRows;
  const total = rows.length;
  if (!total) return '—';
  const present = rows.filter((record) => record.present).length;
  return `${Number(((present / total) * 100).toFixed(1))}%`;
}

function resolveBehaviorRating(studentId, term = '') {
  if (!studentId) return '—';
  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId)
    .filter((record) => record.remark);
  const activeTerm = term || resolveLatestTerm(allRows.map((record) => record.term));
  const rows = activeTerm
    ? allRows.filter((record) => String(record.term || '').trim() === activeTerm)
    : allRows;
  if (!rows.length) return '—';
  const negative = rows.filter((record) => /poor|bad|late|absent|disrupt|misconduct/i.test(record.remark)).length;
  const positive = rows.filter((record) => /excellent|good|punctual|neat|respect|outstanding/i.test(record.remark)).length;
  if (negative > positive) return 'Needs Improvement';
  if (positive > 0) return 'Good';
  return 'Satisfactory';
}

function isClassRankingReady(term, classId, sessionId = '') {
  if (!term || !classId) return false;
  const classStudents = resolveClassStudents(classId, sessionId);
  if (!classStudents.length) return false;
  const classInfo = adminStore.classes.find((item) => item.id === classId);
  const subjects = resolveSubjectsForClass(classId, classInfo?.institution || '');
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  if (!subjectIds.size) return false;

  const subjectMap = new Map();
  adminStore.results.forEach((result) => {
    if (!result.published) return;
    if (result.term !== term) return;
    if (result.classId !== classId) return;
    if (!matchesSession(result.sessionId, sessionId)) return;
    if (!subjectIds.has(result.subjectId)) return;

    const current = subjectMap.get(result.studentId) || new Set();
    current.add(result.subjectId);
    subjectMap.set(result.studentId, current);
  });

  return classStudents.every((student) => {
    const subjectsDone = subjectMap.get(student.id);
    return subjectsDone && subjectsDone.size === subjectIds.size;
  });
}

function buildClassRanking(term, classId, sessionId = '') {
  if (!term || !classId) return { ranking: [], size: 0 };

  const classStudents = resolveClassStudents(classId, sessionId);
  if (!classStudents.length) return { ranking: [], size: 0 };

  const scoreByStudent = new Map();

  adminStore.results.forEach((result) => {
    if (!result.published) return;
    if (result.term !== term) return;
    if (result.classId !== classId) return;
    if (!matchesSession(result.sessionId, sessionId)) return;

    const current = scoreByStudent.get(result.studentId) || { totalScore: 0, subjectCount: 0 };
    current.totalScore += Number(result.total || 0);
    current.subjectCount += 1;
    scoreByStudent.set(result.studentId, current);
  });

  const ranking = classStudents
    .map((student) => {
      const scores = scoreByStudent.get(student.id) || { totalScore: 0, subjectCount: 0 };
      const average = scores.subjectCount ? Number((scores.totalScore / scores.subjectCount).toFixed(2)) : 0;
      return {
        studentId: student.id,
        fullName: student.fullName,
        totalScore: scores.totalScore,
        averageScore: average
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || a.fullName.localeCompare(b.fullName));

  let lastScore = null;
  let lastPosition = 0;

  ranking.forEach((entry, index) => {
    if (lastScore === null || entry.totalScore < lastScore) {
      lastPosition = index + 1;
      lastScore = entry.totalScore;
    }
    entry.position = lastPosition;
  });

  return { ranking, size: classStudents.length };
}

function resolveSubjectsForClass(classId, institution) {
  const scoped = adminStore.subjects.filter((subject) => subject.classId === classId);
  if (scoped.length) return scoped;
  if (institution) {
    return adminStore.subjects.filter((subject) => subject.institution === institution);
  }
  return adminStore.subjects;
}

function enrichResult(row) {
  const subject = adminStore.subjects.find((entry) => entry.id === row.subjectId);
  const classItem = adminStore.classes.find((entry) => entry.id === row.classId);
  return {
    ...row,
    subjectName: subject?.name || row.subjectId,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : row.classId
  };
}

function gradeFromTotal(total) {
  if (total >= 70) return { grade: 'A', remark: 'Excellent' };
  if (total >= 60) return { grade: 'B', remark: 'Very Good' };
  if (total >= 50) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Fair' };
  if (total >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

function buildReportCard(student, term = '', sessionId = '') {
  if (!student) return null;
  const filtered = adminStore.results.filter(
    (item) =>
      item.studentId === student.id &&
      matchesSession(item.sessionId, sessionId) &&
      item.published &&
      (!term || item.term === term)
  );

  const rows = filtered.map((item) => {
    const subject = adminStore.subjects.find((subjectItem) => subjectItem.id === item.subjectId);
    return {
      ...item,
      subjectName: subject?.name || item.subjectId
    };
  });

  const totalScore = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const averageScore = rows.length ? Number((totalScore / rows.length).toFixed(2)) : 0;
  const enrollment = sessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === student.id && entry.sessionId === sessionId
      )
    : null;
  const classId = enrollment?.classId || student.classId;
  const classInfo = adminStore.classes.find((item) => item.id === classId);
  const institution = student.institution || classInfo?.institution || 'ATTAUFEEQ Model Academy';
  const attendance = resolveAttendanceRate(student.id, term);
  const behavior = resolveBehaviorRating(student.id, term);
  let classRank = null;
  let classSize = null;

  if (term && classInfo && isClassRankingReady(term, classInfo.id, sessionId)) {
    const rankingResult = buildClassRanking(term, classInfo.id, sessionId);
    classSize = rankingResult.size;
    const self = rankingResult.ranking.find((entry) => entry.studentId === student.id);
    classRank = self ? self.position : null;
  }

  return {
    student,
    classInfo,
    institution,
    term: term || 'All Terms',
    sessionId: sessionId || '',
    generatedAt: new Date().toISOString(),
    totalSubjects: rows.length,
    totalScore,
    averageScore,
    overallGrade: gradeFromTotal(averageScore).grade,
    classRank,
    classSize,
    attendance,
    behavior,
    publishState: 'Published',
    rows
  };
}

resultTokenRouter.post('/admin/generate', requireAuth, requireRole('admin'), async (req, res) => {
  const quantity = Number(req.body?.quantity || 0);
  const length = Number(req.body?.length || 10);
  const term = String(req.body?.term || '').trim();
  const expiresAt = req.body?.expiresAt || '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Quantity must be at least 1.' });
  }
  if (!term) {
    return res.status(400).json({ message: 'Term is required for tokens.' });
  }

  try {
    const tokens = await createResultTokens({
      quantity,
      length,
      term,
      sessionId,
      expiresAt,
      createdByUserId: req.user?.id || ''
    });

    addActivityLog({
      action: 'result-tokens.generated',
      method: 'POST',
      path: '/api/result-tokens/admin/generate',
      actorRole: req.user?.role || 'admin',
      actorEmail: req.user?.email || 'unknown',
      statusCode: 201,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    const stats = await getResultTokenStats();
    return res.status(201).json({ tokens, stats });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to generate tokens.' });
  }
});

resultTokenRouter.get('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  const status = String(req.query.status || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);

  try {
    const tokens = await listResultTokens({ status, search, limit, offset, includeToken: true });
    const stats = await getResultTokenStats();
    return res.json({ tokens, stats });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load result tokens.' });
  }
});

resultTokenRouter.get('/admin/export', requireAuth, requireRole('admin'), async (req, res) => {
  const status = String(req.query.status || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();

  try {
    const tokens = await listResultTokens({ status, search, limit: 1000, offset: 0, includeToken: true });
    const rows = [
      ['Token', 'Term', 'Status', 'Used Count', 'Max Uses', 'Created At', 'Expires At']
    ];
    tokens.forEach((token) => {
      rows.push([
        token.token || '',
        token.term || '',
        token.status,
        token.usedCount,
        token.maxUses,
        token.createdAt || '',
        token.expiresAt || ''
      ]);
    });
    const csv = rows.map((row) => row.map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="result-tokens.csv"');
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to export tokens.' });
  }
});

resultTokenRouter.get('/admissions', requireAuth, requireRole('admissions'), async (req, res) => {
  const status = String(req.query.status || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);

  try {
    const tokens = await listResultTokens({ status, search, limit, offset, includeToken: true });
    const stats = await getResultTokenStats();
    return res.json({ tokens, stats });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load result tokens.' });
  }
});

resultTokenRouter.post('/admissions/assign', requireAuth, requireRole('admissions'), async (req, res) => {
  const tokenId = String(req.body?.tokenId || '').trim();
  const tokenValue = String(req.body?.token || '').trim();
  const studentIdentifier = String(req.body?.studentIdentifier || '').trim();

  if (!studentIdentifier) {
    return res.status(400).json({ message: 'Student ID or code is required.' });
  }

  const student = resolveStudentByIdentifier(adminStore.students || [], studentIdentifier);
  if (!student) {
    return res.status(404).json({ message: 'Student not found for the supplied ID or code.' });
  }

  const result = await assignResultToken({
    tokenId,
    tokenValue,
    studentId: student.id,
    assignedByUserId: req.user?.id || ''
  });

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  addActivityLog({
    action: 'result-tokens.assigned',
    method: 'POST',
    path: '/api/result-tokens/admissions/assign',
    actorRole: req.user?.role || 'admissions',
    actorEmail: req.user?.email || 'unknown',
    statusCode: 200,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  return res.json({ token: result.token, student });
});

resultTokenRouter.get('/admissions/report-card/:studentId', requireAuth, requireRole('admissions'), async (req, res) => {
  const student = adminStore.students.find((item) => item.id === req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student not found.' });
  const term = req.query.term ? String(req.query.term) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  return res.json({ reportCard: buildReportCard(student, term, sessionId) });
});

resultTokenRouter.post('/check', tokenCheckLimiter, async (req, res) => {
  const tokenValue = String(req.body?.token || '').trim().toUpperCase();
  const studentIdentifier = String(req.body?.studentIdentifier || '').trim();
  const term = String(req.body?.term || '').trim();
  const sessionId = normalizeSessionId(String(req.body?.sessionId || '').trim());

  if (!studentIdentifier) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Missing student identifier.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Student ID or code is required.' });
  }
  if (!term) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Missing term.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Term is required.' });
  }

  const students = adminStore.students || [];
  const student = resolveStudentByIdentifier(students, studentIdentifier);
  if (!student) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Student not found.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(404).json({ message: 'Student not found for the supplied ID or code.' });
  }

  const resolvedSessionId = sessionId || (await ensureActiveAcademicSession())?.id || '';
  const enrollment = resolvedSessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === student.id && entry.sessionId === resolvedSessionId
      )
    : null;
  const classId = enrollment?.classId || student.classId;
  const classItem = adminStore.classes.find((item) => item.id === classId);
  const userProfile = student.userId ? await findUserById(student.userId) : null;
  const studentPayload = {
    ...student,
    avatarUrl: student.avatarUrl || userProfile?.avatarUrl || '',
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : student.classLabel || ''
  };

  if (!isResultsOpenForClass(classId)) {
    return res.json({
      student: studentPayload,
      sessionId: resolvedSessionId,
      results: [],
      subjects: [],
      holdStatus: 'locked',
      holdReason: 'Results are locked for this class until the admin opens access.',
      remainingUses: 0
    });
  }

  const existingAccess = await getResultTokenAccess({
    studentId: student.id,
    term,
    sessionId: resolvedSessionId
  });

  if (existingAccess) {
    const results = adminStore.results.filter(
      (item) =>
        item.studentId === student.id &&
        item.published &&
        matchesSession(item.sessionId, resolvedSessionId) &&
        (!term || item.term === term)
    );
    const subjects = resolveSubjectsForClass(classId, student.institution || '');
    return res.json({
      student: studentPayload,
      sessionId: resolvedSessionId,
      results: results.map(enrichResult),
      subjects,
      reportCard: buildReportCard(studentPayload, term, resolvedSessionId),
      holdStatus: results.length ? 'ready' : 'empty',
      remainingUses: 0
    });
  }

  if (!tokenValue) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Missing token.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token is required for first-time access.' });
  }

  const tokenState = await getTokenState({ tokenValue });
  if (!tokenState) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Invalid token.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(404).json({ message: 'Invalid token.' });
  }
  if (tokenState.status === 'expired') {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Token expired.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token expired.' });
  }
  if (tokenState.status === 'used') {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Token already used.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token already used.' });
  }
  if (!tokenState.term || String(tokenState.term).trim() !== term) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Token term mismatch.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token does not match the selected term.' });
  }
  if (tokenState.sessionId && String(tokenState.sessionId).trim() !== resolvedSessionId) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Token session mismatch.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token does not match the active session.' });
  }
  if (tokenState.assignedStudentId && tokenState.assignedStudentId !== student.id) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'Token assigned to another student.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: 'Token is assigned to another student.' });
  }
  if (!tokenState.assignedStudentId) {
    const assigned = await assignResultToken({
      tokenValue,
      studentId: student.id,
      assignedByUserId: ''
    });
    if (assigned.error) {
      await recordResultTokenAttempt({
        tokenValue,
        studentIdentifier,
        success: false,
        failureReason: assigned.error,
        ipAddress: req.ip || req.socket?.remoteAddress || '',
        userAgent: req.get('user-agent') || ''
      });
      return res.status(400).json({ message: assigned.error });
    }
  }

  const results = adminStore.results.filter(
    (item) =>
      item.studentId === student.id &&
      item.published &&
      matchesSession(item.sessionId, resolvedSessionId) &&
      (!term || item.term === term)
  );

  if (!results.length) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: 'No published results for term.',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.json({
      student: studentPayload,
      sessionId: resolvedSessionId,
      results: [],
      subjects: [],
      holdStatus: 'empty',
      holdReason: 'No published results found for the selected term.',
      remainingUses: 0
    });
  }

  const consume = await consumeResultTokenOnce({
    tokenValue,
    studentId: student.id,
    term,
    sessionId: resolvedSessionId
  });
  if (consume.error) {
    await recordResultTokenAttempt({
      tokenValue,
      studentIdentifier,
      success: false,
      failureReason: consume.error,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get('user-agent') || ''
    });
    return res.status(400).json({ message: consume.error });
  }

  await createResultTokenAccess({
    tokenId: consume.token?.id || tokenState.id,
    studentId: student.id,
    term,
    sessionId: resolvedSessionId,
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || ''
  });

  await recordResultTokenAttempt({
    tokenValue,
    studentIdentifier,
    success: true,
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || ''
  });

  addActivityLog({
    action: 'result-tokens.used',
    method: 'POST',
    path: '/api/result-tokens/check',
    actorRole: 'public',
    actorEmail: student.portalEmail || student.email || 'unknown',
    statusCode: 200,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  const subjects = resolveSubjectsForClass(classId, student.institution || '');
  return res.json({
    student: studentPayload,
    sessionId: resolvedSessionId,
    results: results.map(enrichResult),
    subjects,
    reportCard: buildReportCard(studentPayload, term, resolvedSessionId),
    holdStatus: 'ready',
    remainingUses: 0
  });
});

export default resultTokenRouter;
