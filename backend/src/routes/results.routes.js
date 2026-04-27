import { Router } from 'express';
import { addActivityLog, adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureActiveAcademicSession } from '../repositories/academicSessionRepository.js';
import { listTeacherAssignments } from '../repositories/teacherAssignmentRepository.js';
import { createResultTokenAccess, findUsedTokenForStudentTerm, getResultTokenAccess } from '../repositories/resultTokenRepository.js';
import { clearUnsubmittedResults, listResults, markResultsClearedForTeacher, publishResults, submitResults, upsertResult } from '../repositories/resultRepository.js';
import { findUserById } from '../repositories/userRepository.js';
import { findChildForParent, findStudentByUser, findTeacherByUser, findChildrenForParent } from '../utils/portalScope.js';
import { institutionEquals, normalizeInstitution } from '../utils/institution.js';
import { normalizeTerm } from '../utils/academicProgression.js';
import { resolveStudentByIdentifier } from '../utils/studentCode.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import {
  compileFinalResultForGroup,
  createSubjectResult,
  getFinalResult,
  listPendingSubjectGroups,
  upsertFinalResult
} from '../repositories/subjectResultRepository.js';

const resultsRouter = Router();

function replaceStoredResult(record) {
  const index = adminStore.results.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    adminStore.results[index] = record;
  } else {
    adminStore.results.unshift(record);
  }
}

function gradeFromTotal(total) {
  if (total >= 70) return { grade: 'A', remark: 'Excellent' };
  if (total >= 60) return { grade: 'B', remark: 'Very Good' };
  if (total >= 50) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Fair' };
  if (total >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

function isLeadTeacherAssignment(assignment) {
  const role = String(assignment?.assignmentRole || '').trim().toLowerCase();
  if (!role) return false;
  return role === 'lead teacher' || role === 'class teacher' || role === 'form teacher' || role.includes('lead');
}

async function ensureTokenAccess(studentId, term, sessionId) {
  if (!studentId || !term) return null;
  let access = await getResultTokenAccess({ studentId, term, sessionId });
  if (!access) {
    access = await getResultTokenAccess({ studentId, term, sessionId: '' });
  }
  if (!access) {
    const usedToken = await findUsedTokenForStudentTerm({ studentId, term, sessionId });
    if (usedToken?.id) {
      const created = await createResultTokenAccess({
        tokenId: usedToken.id,
        studentId,
        term,
        sessionId: usedToken.used_for_session_id || usedToken.session_id || sessionId
      });
      access = created?.access || usedToken;
    }
  }
  return access;
}

// Fee-based result restrictions removed: access is no longer gated by fee status.

async function enrichStudentProfile(student) {
  if (!student) return null;
  if (student.avatarUrl) return student;
  if (!student.userId) return student;
  const userProfile = await findUserById(student.userId);
  if (!userProfile?.avatarUrl) return student;
  return {
    ...student,
    avatarUrl: userProfile.avatarUrl
  };
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

function normalizePromotionAction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'repeat') return 'repeat';
  if (normalized === 'graduate') return 'graduate';
  return 'promote';
}

async function canLeadPromotion(teacherId, classId, term = '') {
  if (!teacherId || !classId || !term) return false;
  const assignments = await listTeacherAssignments({ classId, term });
  if (!assignments.length) return false;
  const lead = assignments.find((item) => isLeadTeacherAssignment(item));
  if (lead) return lead.teacherId === teacherId;
  return assignments.some((item) => item.teacherId === teacherId);
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

function getStudentByRoleUser(user) {
  if (user?.role !== 'student') return null;
  return findStudentByUser(user);
}

function getChildForParent(user, childId = '') {
  if (user?.role !== 'parent') return null;
  const children = findChildrenForParent(user);
  return findChildForParent(user, childId) || children[0] || null;
}

function isResultsOpenForClass(classId = '') {
  if (!classId) return false;
  const openList = adminStore.resultsAccess || [];
  return openList.includes(classId);
}

function buildReportCard(student, term = '', options = {}) {
  if (!student) return null;
  const includeUnpublished = Boolean(options.includeUnpublished);
  const sessionId = String(options.sessionId || '');

  const filtered = adminStore.results.filter(
    (item) =>
      item.studentId === student.id &&
      matchesSession(item.sessionId, sessionId) &&
      (includeUnpublished || item.published) &&
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
  let classRank = null;
  let classSize = null;
  const attendance = resolveAttendanceRate(student.id, term);
  const behavior = resolveBehaviorRating(student.id, term);

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
    publishState: includeUnpublished
      ? rows.every((item) => item.published)
        ? 'Published'
        : 'Pending Approval'
      : 'Published',
    rows
  };
}

function enrichResult(item) {
  const subject = adminStore.subjects.find((subjectEntry) => subjectEntry.id === item.subjectId);
  const classItem = adminStore.classes.find((classEntry) => classEntry.id === item.classId);
  return {
    ...item,
    subjectName: subject?.name || item.subjectId,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId
  };
}

function resolveSubjectsForClass(classId = '', institution = '') {
  const assignmentSubjects = adminStore.teacherAssignments
    .filter((assignment) => assignment.classId === classId)
    .map((assignment) => assignment.subjectId);

  const subjectIds = assignmentSubjects.length
    ? assignmentSubjects
    : adminStore.subjects
      .filter((subject) => institutionEquals(subject.institution, institution))
      .map((subject) => subject.id);

  const uniqueIds = [...new Set(subjectIds)];

  return uniqueIds
    .map((subjectId) => adminStore.subjects.find((subject) => subject.id === subjectId))
    .filter(Boolean)
    .map((subject) => ({ id: subject.id, name: subject.name }));
}

resultsRouter.get('/teacher/options', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = activeSession?.id || '';
  if (!teacher) {
    return res.json({
      institution: 'ATTAUFEEQ Model Academy',
      sessionId,
      activeSession,
      classes: [],
      subjects: [],
      students: [],
      assignments: []
    });
  }

  const institution = normalizeInstitution(teacher.institution || 'ATTAUFEEQ Model Academy');
  const assignments = await listTeacherAssignments({ teacherId: teacher.id });
  const classIds = [...new Set(assignments.map((item) => item.classId))];
  const subjectIds = [...new Set(assignments.map((item) => item.subjectId))];

  const leadByClassTerm = assignments.reduce((acc, assignment) => {
    const key = `${assignment.classId}|${assignment.term}`;
    const classAssignments = adminStore.teacherAssignments.filter(
      (item) => item.classId === assignment.classId && item.term === assignment.term
    );
    const lead = classAssignments.find((item) => isLeadTeacherAssignment(item));
    acc[key] = lead ? lead.teacherId === teacher.id : true;
    return acc;
  }, {});

  const classes = adminStore.classes.filter(
    (item) => classIds.includes(item.id) && institutionEquals(item.institution, institution)
  );
  const subjects = adminStore.subjects.filter(
    (item) => subjectIds.includes(item.id) && institutionEquals(item.institution, institution)
  );
  const sessionEnrollments = (adminStore.studentEnrollments || []).filter(
    (entry) => entry.sessionId === sessionId && classIds.includes(entry.classId)
  );
  const enrollmentByStudent = new Map(sessionEnrollments.map((entry) => [entry.studentId, entry.classId]));
  const students = adminStore.students.filter((item) => {
    const enrolledClassId = enrollmentByStudent.get(item.id);
    const hasEnrollment = enrollmentByStudent.has(item.id);
    if (hasEnrollment) {
      if (!classIds.includes(enrolledClassId)) return false;
    } else if (!classIds.includes(item.classId)) {
      return false;
    }
    if (item.institution && !institutionEquals(item.institution, institution)) return false;
    return true;
  });

  return res.json({ institution, sessionId, activeSession, classes, subjects, students, assignments, leadByClassTerm });
});

resultsRouter.get('/sessions', requireAuth, async (_req, res) => {
  const activeSession = await ensureActiveAcademicSession();
  const sessions = adminStore.academicSessions || (activeSession ? [activeSession] : []);
  return res.json({ sessions, activeSession });
});

resultsRouter.post('/teacher/scores', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const subjectId = String(req.body?.subjectId || '').trim();
  const term = String(req.body?.term || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !subjectId || !term || !Array.isArray(rows)) {
    return res.status(400).json({ message: 'classId, subjectId, term, rows are required.' });
  }
  if (!rows.length) {
    return res.status(400).json({ message: 'At least one score row is required.' });
  }

  const allowedAssignments = await listTeacherAssignments({ teacherId: teacher.id, classId, subjectId, term });
  const allowed = allowedAssignments.length > 0;

  if (!allowed) {
    return res.status(403).json({ message: 'Not assigned to this class/subject.' });
  }

  const institution = normalizeInstitution(teacher.institution || 'ATTAUFEEQ Model Academy');
  const classRecord = adminStore.classes.find(
    (item) => item.id === classId && institutionEquals(item.institution, institution)
  );
  const subjectRecord = adminStore.subjects.find(
    (item) => item.id === subjectId && institutionEquals(item.institution, institution)
  );

  if (!classRecord || !subjectRecord) {
    return res.status(400).json({ message: 'Selected class or subject is outside your institution scope.' });
  }

  const enrollments = (adminStore.studentEnrollments || []).filter(
    (entry) => entry.classId === classId && matchesSession(entry.sessionId, sessionId)
  );
  const enrollmentMap = new Map(enrollments.map((entry) => [entry.studentId, entry.classId]));
  const validStudentIds = new Set(
    adminStore.students
      .filter((student) => {
        if (student.institution && !institutionEquals(student.institution, institution)) return false;
        if (enrollmentMap.has(student.id)) {
          return enrollmentMap.get(student.id) === classId;
        }
        return student.classId === classId;
      })
      .map((student) => student.id)
  );
  if (!validStudentIds.size) {
    return res.status(400).json({ message: 'No students found for this class in the selected session.' });
  }

  for (const row of rows) {
    const ca = Number(row?.ca ?? 0);
    const exam = Number(row?.exam ?? 0);

    if (!validStudentIds.has(row?.studentId)) {
      return res.status(400).json({ message: 'One or more selected students do not belong to this class.' });
    }

    const existing = (await listResults({
      studentId: row?.studentId,
      classId,
      subjectId,
      term,
      sessionId,
      institution
    }))[0];

    if (existing?.published) {
      return res.status(400).json({ message: 'Published results are locked and cannot be edited.' });
    }

    if (existing?.submittedAt || existing?.submittedByTeacherId) {
      return res.status(400).json({ message: 'Submitted results are locked until admin publishes.' });
    }

    if (Number.isNaN(ca) || Number.isNaN(exam) || ca < 0 || ca > 40 || exam < 0 || exam > 60) {
      return res.status(400).json({ message: 'Scores must be within CA 0-40 and Exam 0-60.' });
    }
  }

  const upserted = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const studentId = row.studentId;
    const ca = Number(row.ca || 0);
    const exam = Number(row.exam || 0);
    const total = ca + exam;
    const { grade, remark } = gradeFromTotal(total);

    const existing = (await listResults({ studentId, classId, subjectId, term, sessionId, institution }))[0];

    const stored = await upsertResult({
      id: existing?.id || makeId('res'),
      studentId,
      classId,
      sessionId,
      subjectId,
      institution,
      term,
      ca,
      exam,
      total,
      grade,
      remark,
      published: existing?.published || false,
      approvedAt: existing?.approvedAt || '',
      approvedByUserId: existing?.approvedByUserId || '',
      approvedByName: existing?.approvedByName || '',
      approvedByEmail: existing?.approvedByEmail || '',
      submittedAt: existing?.submittedAt || '',
      submittedByTeacherId: existing?.submittedByTeacherId || '',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      enteredByTeacherId: teacher.id
    });

    replaceStoredResult(stored);
    upserted.push(stored);
  }

  return res.json({ savedCount: upserted.length, results: upserted });
});

resultsRouter.post('/teacher/submit', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const subjectId = String(req.body?.subjectId || '').trim();
  const term = String(req.body?.term || '').trim();
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !subjectId || !term) {
    return res.status(400).json({ message: 'classId, subjectId, and term are required.' });
  }

  const allowedAssignments = await listTeacherAssignments({ teacherId: teacher.id, classId, subjectId, term });
  if (!allowedAssignments.length) {
    return res.status(403).json({ message: 'Not assigned to this class/subject.' });
  }

  const institution = normalizeInstitution(teacher.institution || 'ATTAUFEEQ Model Academy');
  const scopedResults = await listResults({ classId, subjectId, term, sessionId, institution });

  if (!scopedResults.length) {
    return res.status(400).json({ message: 'No saved results found to submit for this class and subject.' });
  }

  const draftResults = scopedResults.filter(
    (item) => !item.published && !item.submittedAt && !item.submittedByTeacherId
  );

  if (!draftResults.length) {
    if (scopedResults.some((item) => item.published)) {
      return res.status(400).json({ message: 'Published results are locked and cannot be submitted again.' });
    }

    return res.status(400).json({ message: 'Submitted results are locked until admin publishes.' });
  }

  const updated = await submitResults({ classId, subjectId, term, sessionId, institution, teacherId: teacher.id });

  const submittedAt = updated[0]?.submittedAt || new Date().toISOString();
  return res.json({ submittedCount: updated.length, submittedAt });
});

resultsRouter.post('/teacher/subject-results', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(403).json({ message: 'Teacher profile not found.' });
  }

  const studentCode = String(req.body?.studentCode || '').trim().toUpperCase();
  const subject = String(req.body?.subject || '').trim();
  const score = Number(req.body?.score || 0);
  const grade = String(req.body?.grade || '').trim().toUpperCase();
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();

  if (!studentCode || !subject || !classId || !term || !sessionId) {
    return res.status(400).json({ message: 'studentCode, subject, classId, term, and sessionId are required.' });
  }
  if (!Number.isFinite(score)) {
    return res.status(400).json({ message: 'score must be a valid number.' });
  }
  if (!grade) {
    return res.status(400).json({ message: 'grade is required.' });
  }

  const saved = await createSubjectResult({
    studentCode,
    subject,
    score,
    grade,
    classId,
    term,
    sessionId,
    teacherId: teacher.id
  });

  return res.json({ subjectResult: saved });
});

resultsRouter.post('/teacher/clear-drafts', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const subjectId = String(req.body?.subjectId || '').trim();
  const term = String(req.body?.term || '').trim();
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !subjectId || !term) {
    return res.status(400).json({ message: 'classId, subjectId, and term are required.' });
  }

  const allowedAssignments = await listTeacherAssignments({ teacherId: teacher.id, classId, subjectId, term });
  if (!allowedAssignments.length) {
    return res.status(403).json({ message: 'Not assigned to this class/subject.' });
  }

  const institution = normalizeInstitution(teacher.institution || 'ATTAUFEEQ Model Academy');
  const scopedResults = await listResults({ classId, subjectId, term, sessionId, institution });

  if (!scopedResults.length) {
    return res.status(400).json({ message: 'No saved results found to clear for this class and subject.' });
  }

  const draftResults = scopedResults.filter(
    (item) => !item.published && !item.submittedAt && !item.submittedByTeacherId
  );

  if (!draftResults.length) {
    if (scopedResults.some((item) => item.published)) {
      return res.status(400).json({ message: 'Published results are locked and cannot be cleared as drafts.' });
    }

    return res.status(400).json({ message: 'Submitted results are locked until admin publishes.' });
  }

  const removedCount = await clearUnsubmittedResults({
    classId,
    subjectId,
    term,
    sessionId,
    institution,
    teacherId: teacher.id
  });

  return res.json({ removedCount });
});

resultsRouter.post('/teacher/clear-published', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const subjectId = String(req.body?.subjectId || '').trim();
  const term = String(req.body?.term || '').trim();
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !subjectId || !term) {
    return res.status(400).json({ message: 'classId, subjectId, and term are required.' });
  }

  const allowedAssignments = await listTeacherAssignments({ teacherId: teacher.id, classId, subjectId, term });
  if (!allowedAssignments.length) {
    return res.status(403).json({ message: 'Not assigned to this class/subject.' });
  }

  const institution = teacher.institution || 'ATTAUFEEQ Model Academy';
  const scopedResults = await listResults({ classId, subjectId, term, sessionId, institution });
  if (!scopedResults.length) {
    return res.status(400).json({ message: 'No results found to clear for this class and subject.' });
  }

  const unclearedResults = scopedResults.filter((item) => !item.teacherClearedAt);
  if (!unclearedResults.length) {
    return res.status(400).json({ message: 'Approved results have already been cleared from your dashboard.' });
  }

  const allPublished = unclearedResults.every((item) => item.published);
  if (!allPublished) {
    return res.status(400).json({ message: 'Results must be approved and published before they can be cleared.' });
  }

  const termClosures = adminStore.termClosures || [];
  const isTermClosed = termClosures.some(
    (entry) => entry.term === term && entry.sessionId === sessionId
  );
  if (!isTermClosed) {
    return res.status(400).json({ message: 'Admin must close the term before approved results can be cleared.' });
  }

  const clearedCount = await markResultsClearedForTeacher({
    classId,
    subjectId,
    term,
    sessionId,
    institution,
    teacherId: teacher.id
  });

  return res.json({ clearedCount });
});

resultsRouter.get('/teacher/promotion-recommendations', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.query.classId || '');
  const term = normalizeTerm(req.query.term || '');
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !term || !sessionId) {
    return res.status(400).json({ message: 'classId, term, and sessionId are required.' });
  }

  const leadOk = await canLeadPromotion(teacher.id, classId, term);
  if (!leadOk) {
    return res.status(403).json({ message: 'Only lead teachers can send promotion recommendations.' });
  }

  const recommendation = (adminStore.promotionRecommendations || []).find(
    (entry) => entry.classId === classId && entry.sessionId === sessionId && entry.term === term
  );

  return res.json({ recommendation: recommendation || null });
});

resultsRouter.post('/teacher/promotion-recommendations', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const term = normalizeTerm(req.body?.term || '');
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });
  if (!classId || !term || !Array.isArray(decisions)) {
    return res.status(400).json({ message: 'classId, term, and decisions are required.' });
  }

  const leadOk = await canLeadPromotion(teacher.id, classId, term);
  if (!leadOk) {
    return res.status(403).json({ message: 'Only lead teachers can send promotion recommendations.' });
  }

  const classStudents = resolveClassStudents(classId, sessionId);
  const validStudentIds = new Set(classStudents.map((student) => student.id));

  const cleanedDecisions = decisions
    .map((entry) => ({
      studentId: String(entry?.studentId || '').trim(),
      action: normalizePromotionAction(entry?.action)
    }))
    .filter((entry) => entry.studentId && validStudentIds.has(entry.studentId));

  if (!cleanedDecisions.length) {
    return res.status(400).json({ message: 'No valid promotion decisions supplied.' });
  }

  const now = new Date().toISOString();
  const existingIndex = (adminStore.promotionRecommendations || []).findIndex(
    (entry) => entry.classId === classId && entry.sessionId === sessionId && entry.term === term
  );

  const record = {
    id: existingIndex >= 0 ? adminStore.promotionRecommendations[existingIndex].id : makeId('promo-rec'),
    classId,
    sessionId,
    term,
    teacherId: teacher.id,
    teacherName: teacher.fullName,
    decisions: cleanedDecisions,
    createdAt: existingIndex >= 0 ? adminStore.promotionRecommendations[existingIndex].createdAt : now,
    updatedAt: now
  };

  if (!adminStore.promotionRecommendations) {
    adminStore.promotionRecommendations = [];
  }

  if (existingIndex >= 0) {
    adminStore.promotionRecommendations[existingIndex] = record;
  } else {
    adminStore.promotionRecommendations.unshift(record);
  }

  return res.status(201).json({ recommendation: record });
});

resultsRouter.get('/teacher/records', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  if (!teacher) return res.json({ results: [] });

  const institution = teacher.institution || 'ATTAUFEEQ Model Academy';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  const assignments = await listTeacherAssignments({ teacherId: teacher.id });
  const assignmentPairs = new Set(assignments.map((item) => `${item.classId}|${item.subjectId}|${item.term}`));

  const results = (await listResults({ institution, sessionId }))
    .filter(
      (item) =>
        assignmentPairs.has(`${item.classId}|${item.subjectId}|${item.term}`) &&
        (item.institution ? item.institution === institution : true) &&
        !item.teacherClearedAt
    )
    .map((item) => {
      const student = adminStore.students.find((studentItem) => studentItem.id === item.studentId);
      const classItem = adminStore.classes.find((classEntry) => classEntry.id === item.classId);
      const subject = adminStore.subjects.find((subjectEntry) => subjectEntry.id === item.subjectId);

      return {
        ...item,
        studentName: student?.fullName || item.studentId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId,
        subjectName: subject?.name || item.subjectId,
        institution: item.institution || institution
      };
    })
    .sort((a, b) => {
      const left = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const right = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return left - right;
    });

  return res.json({ results });
});

resultsRouter.get('/admin/overview', requireAuth, requireRole('admin'), async (req, res) => {
  const term = req.query.term ? String(req.query.term) : '';
  const classId = req.query.classId ? String(req.query.classId) : '';
  const institution = req.query.institution ? String(req.query.institution) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';

  const filtered = (await listResults({ term, classId, sessionId, institution }))
    .map((item) => {
      const student = adminStore.students.find((studentItem) => studentItem.id === item.studentId);
      const classItem = adminStore.classes.find((classEntry) => classEntry.id === item.classId);
      const subject = adminStore.subjects.find((subjectEntry) => subjectEntry.id === item.subjectId);

      return {
        ...item,
        studentName: student?.fullName || item.studentId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId,
        institution: item.institution || classItem?.institution || '',
        subjectName: subject?.name || item.subjectId
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.subjectName.localeCompare(b.subjectName));

  return res.json({ results: filtered });
});

resultsRouter.get('/admin/pending-subject-results', requireAuth, requireRole('admin'), async (req, res) => {
  const term = String(req.query.term || '').trim();
  const sessionId = String(req.query.sessionId || '').trim();
  const groups = await listPendingSubjectGroups({ term, sessionId });
  return res.json({ groups });
});

resultsRouter.post('/admin/approve-subject-results', requireAuth, requireRole('admin'), async (req, res) => {
  const studentCode = String(req.body?.studentCode || '').trim();
  const term = String(req.body?.term || '').trim();
  const sessionId = String(req.body?.sessionId || '').trim();

  if (!studentCode || !term) {
    return res.status(400).json({ message: 'studentCode and term are required.' });
  }

  const approvedByUserId = req.user?.sub ? String(req.user.sub) : '';
  const { finalResult, error } = await compileFinalResultForGroup({
    studentCode,
    term,
    sessionId,
    approvedByUserId
  });

  if (error) {
    return res.status(400).json({ message: error });
  }

  return res.json({ finalResult });
});

resultsRouter.post('/admin/publish', requireAuth, requireRole('admin'), async (req, res) => {
  const term = String(req.body?.term || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const institution = String(req.body?.institution || '').trim();
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';
  if (!term) return res.status(400).json({ message: 'term is required.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });

  const candidateResults = await listResults({ term, classId, sessionId, institution });
  const submittedCandidates = candidateResults.filter(
    (item) => (item.submittedAt || item.submittedByTeacherId) && !item.published
  );

  if (!submittedCandidates.length) {
    const hasPublishedRows = candidateResults.some((item) => item.published);
    return res.status(400).json({
      message: hasPublishedRows
        ? 'Published results are locked and do not need to be published again.'
        : 'No submitted results found. Teachers must submit results before admin can publish.',
      blockedCount: 0,
      blockedStudents: []
    });
  }

  const eligibleStudentIds = [...new Set(submittedCandidates.map((item) => item.studentId).filter(Boolean))];

  const approvedBy = req.user
    ? { userId: String(req.user.sub || ''), name: req.user.fullName || '', email: req.user.email || '' }
    : null;
  const updatedRows = await publishResults({
    term,
    classId,
    sessionId,
    institution,
    requireSubmitted: true,
    approvedBy,
    studentIds: eligibleStudentIds
  });
  updatedRows.forEach((item) => replaceStoredResult(item));

  const resultByStudent = updatedRows.reduce((acc, row) => {
    if (!row.studentId) return acc;
    const key = row.studentId;
    const items = acc.get(key) || [];
    items.push(row);
    acc.set(key, items);
    return acc;
  }, new Map());

  for (const [studentId, rows] of resultByStudent.entries()) {
    const student = adminStore.students.find((item) => item.id === studentId);
    if (!student) continue;
    const studentCode = student.studentCode || student.id;
    const subjectPayload = rows.map((row) => ({
      subject: row.subjectName || row.subjectId,
      score: row.total,
      grade: row.grade,
      teacherId: row.enteredByTeacherId || row.submittedByTeacherId || ''
    }));
    const totalScore = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const averageScore = rows.length ? Number((totalScore / rows.length).toFixed(2)) : 0;
    const gradeSummary =
      averageScore >= 70 ? 'A' :
      averageScore >= 60 ? 'B' :
      averageScore >= 50 ? 'C' :
      averageScore >= 45 ? 'D' :
      averageScore >= 40 ? 'E' : 'F';

    await upsertFinalResult({
      id: '',
      studentCode,
      term,
      sessionId,
      classId: rows[0]?.classId || '',
      subjects: subjectPayload,
      totalScore,
      averageScore,
      gradeSummary,
      approvedByUserId: approvedBy?.userId || ''
    });
  }

  if (!updatedRows.length) {
    return res.status(400).json({
      message: 'Published results are locked and do not need to be published again.',
      blockedCount: 0,
      blockedStudents: []
    });
  }

  addActivityLog({
    action: 'results.published',
    method: 'POST',
    path: '/api/results/admin/publish',
    actorRole: req.user?.role || 'admin',
    actorEmail: req.user?.email || 'unknown',
    statusCode: 200,
    ip: req.ip || req.socket?.remoteAddress || 'unknown'
  });

  return res.json({
    publishedCount: updatedRows.length,
    blockedCount: 0,
    blockedStudents: [],
    compiledCount: resultByStudent.size
  });
});

resultsRouter.get('/student', requireAuth, requireRole('student'), async (req, res) => {
  const student = getStudentByRoleUser(req.user);
  if (!student) return res.json({ student: null, results: [], subjects: [] });

  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  const term = req.query.term ? String(req.query.term) : '';
  const enrollment = sessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === student.id && entry.sessionId === sessionId
      )
    : null;
  const classId = enrollment?.classId || student.classId;

  if (!isResultsOpenForClass(classId)) {
    return res.json({
      student,
      sessionId,
      results: [],
      subjects: [],
      holdStatus: 'locked',
      holdReason: 'Results are locked for your class until the admin opens access.'
    });
  }

  if (term) {
    const access = await ensureTokenAccess(student.id, term, sessionId);
    if (!access) {
      const subjects = resolveSubjectsForClass(classId, student.institution || '');
      return res.json({
        student,
        sessionId,
        results: [],
        subjects,
        holdStatus: 'token-required',
        holdReason: 'Result access has not been activated for this term. Use your result token first.'
      });
    }
  }

  const results = adminStore.results.filter(
    (item) =>
      item.studentId === student.id &&
      item.published &&
      matchesSession(item.sessionId, sessionId) &&
      (!term || item.term === term)
  );
  const subjects = resolveSubjectsForClass(classId, student.institution || '');
  return res.json({ student, sessionId, results: results.map(enrichResult), subjects });
});

resultsRouter.get('/student/report-card', requireAuth, requireRole('student'), async (req, res) => {
  const student = getStudentByRoleUser(req.user);
  if (!student) return res.json({ reportCard: null });
  const enrichedStudent = await enrichStudentProfile(student);
  const term = req.query.term ? String(req.query.term) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  if (!term) {
    return res.json({
      reportCard: null,
      holdStatus: 'token-required',
      holdReason: 'Select a term to view the report card.'
    });
  }
  const enrollment = sessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === student.id && entry.sessionId === sessionId
      )
    : null;
  const classId = enrollment?.classId || student.classId;

  if (!isResultsOpenForClass(classId)) {
    return res.json({
      reportCard: null,
      holdStatus: 'locked',
      holdReason: 'Results are locked for your class until the admin opens access.'
    });
  }

  const access = await ensureTokenAccess(student.id, term, sessionId);
  if (!access) {
    return res.json({
      reportCard: null,
      holdStatus: 'token-required',
      holdReason: 'Result access has not been activated for this term. Use your result token first.'
    });
  }

  return res.json({ reportCard: buildReportCard(enrichedStudent, term, { sessionId }) });
});

resultsRouter.get('/parent', requireAuth, requireRole('parent'), async (req, res) => {
  const child = getChildForParent(req.user, String(req.query.childId || ''));
  const children = findChildrenForParent(req.user);
  if (!child) return res.json({ child: null, children, results: [], subjects: [] });

  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  const term = req.query.term ? String(req.query.term) : '';
  const enrollment = sessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === child.id && entry.sessionId === sessionId
      )
    : null;
  const classId = enrollment?.classId || child.classId;

  if (!isResultsOpenForClass(classId)) {
    return res.json({
      child,
      children,
      sessionId,
      results: [],
      subjects: [],
      holdStatus: 'locked',
      holdReason: 'Results are locked for this class until the admin opens access.'
    });
  }

  if (term) {
    const access = await ensureTokenAccess(child.id, term, sessionId);
    if (!access) {
      const subjects = resolveSubjectsForClass(classId, child.institution || '');
      return res.json({
        child,
        children,
        sessionId,
        results: [],
        subjects,
        holdStatus: 'token-required',
        holdReason: 'Result access has not been activated for this term. Use your result token first.'
      });
    }
  }

  const results = adminStore.results.filter(
    (item) =>
      item.studentId === child.id &&
      item.published &&
      matchesSession(item.sessionId, sessionId) &&
      (!term || item.term === term)
  );
  const subjects = resolveSubjectsForClass(classId, child.institution || '');
  return res.json({ child, children, sessionId, results: results.map(enrichResult), subjects });
});

resultsRouter.get('/parent/report-card', requireAuth, requireRole('parent'), async (req, res) => {
  const child = getChildForParent(req.user, String(req.query.childId || ''));
  const children = findChildrenForParent(req.user);
  if (!child) return res.json({ reportCard: null, children });
  const enrichedChild = await enrichStudentProfile(child);
  const term = req.query.term ? String(req.query.term) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  if (!term) {
    return res.json({
      reportCard: null,
      children,
      holdStatus: 'token-required',
      holdReason: 'Select a term to view the report card.'
    });
  }
  const enrollment = sessionId
    ? (adminStore.studentEnrollments || []).find(
        (entry) => entry.studentId === child.id && entry.sessionId === sessionId
      )
    : null;
  const classId = enrollment?.classId || child.classId;

  if (!isResultsOpenForClass(classId)) {
    return res.json({
      reportCard: null,
      children,
      holdStatus: 'locked',
      holdReason: 'Results are locked for this class until the admin opens access.'
    });
  }

  const access = await ensureTokenAccess(child.id, term, sessionId);
  if (!access) {
    return res.json({
      reportCard: null,
      children,
      holdStatus: 'token-required',
      holdReason: 'Result access has not been activated for this term. Use your result token first.'
    });
  }

  return res.json({ reportCard: buildReportCard(enrichedChild, term, { sessionId }), children });
});

resultsRouter.get('/admin/access', requireAuth, requireRole('admin'), (_req, res) => {
  return res.json({ openClassIds: adminStore.resultsAccess || [] });
});

resultsRouter.put('/admin/access', requireAuth, requireRole('admin'), (req, res) => {
  const classId = String(req.body?.classId || '').trim();
  const open = req.body?.open;
  if (!classId) {
    return res.status(400).json({ message: 'classId is required.' });
  }
  if (typeof open !== 'boolean') {
    return res.status(400).json({ message: 'open must be a boolean.' });
  }

  const classExists = adminStore.classes.some((item) => item.id === classId);
  if (!classExists) {
    return res.status(400).json({ message: 'Referenced class does not exist.' });
  }

  const list = adminStore.resultsAccess || [];
  const has = list.includes(classId);

  if (open === has) {
    return res.status(400).json({
      message: open
        ? 'Results access is already open for this class.'
        : 'Results access is already closed for this class.'
    });
  }

  if (open && !has) {
    list.push(classId);
  } else if (!open && has) {
    adminStore.resultsAccess = list.filter((id) => id !== classId);
    return res.json({ openClassIds: adminStore.resultsAccess || [] });
  }

  adminStore.resultsAccess = list;
  return res.json({ openClassIds: adminStore.resultsAccess || [] });
});

resultsRouter.get('/admin/report-card/:studentId', requireAuth, requireRole('admin'), async (req, res) => {
  const student = adminStore.students.find((item) => item.id === req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student not found.' });
  const term = req.query.term ? String(req.query.term) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  return res.json({ reportCard: buildReportCard(student, term, { includeUnpublished: true, sessionId }) });
});

resultsRouter.post('/admin/compile-final-results', requireAuth, requireRole('admin'), async (req, res) => {
  const term = String(req.body?.term || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const institution = String(req.body?.institution || '').trim();
  const rawSessionId = String(req.body?.sessionId || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = rawSessionId || activeSession?.id || '';

  if (!term) return res.status(400).json({ message: 'term is required.' });
  if (!sessionId) return res.status(400).json({ message: 'Active academic session is required.' });

  const candidateResults = await listResults({ term, classId, sessionId, institution, published: true });
  if (!candidateResults.length) {
    return res.status(400).json({ message: 'No published results found for this scope.' });
  }

  const grouped = candidateResults.reduce((acc, row) => {
    if (!row.studentId) return acc;
    const list = acc.get(row.studentId) || [];
    list.push(row);
    acc.set(row.studentId, list);
    return acc;
  }, new Map());

  let compiledCount = 0;

  for (const [studentId, rows] of grouped.entries()) {
    const student = adminStore.students.find((item) => item.id === studentId);
    if (!student) continue;
    const studentCode = student.studentCode || student.id;
    const subjectPayload = rows.map((row) => ({
      subject: row.subjectName || row.subjectId,
      score: row.total,
      grade: row.grade,
      teacherId: row.enteredByTeacherId || row.submittedByTeacherId || ''
    }));
    const totalScore = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const averageScore = rows.length ? Number((totalScore / rows.length).toFixed(2)) : 0;
    const gradeSummary =
      averageScore >= 70 ? 'A' :
      averageScore >= 60 ? 'B' :
      averageScore >= 50 ? 'C' :
      averageScore >= 45 ? 'D' :
      averageScore >= 40 ? 'E' : 'F';

    await upsertFinalResult({
      id: '',
      studentCode,
      term,
      sessionId,
      classId: rows[0]?.classId || '',
      subjects: subjectPayload,
      totalScore,
      averageScore,
      gradeSummary,
      approvedByUserId: String(req.user?.sub || '')
    });
    compiledCount += 1;
  }

  return res.json({ compiledCount });
});

resultsRouter.get('/final', async (req, res) => {
  const studentCode = String(req.query.studentCode || '').trim().toUpperCase();
  const term = String(req.query.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.query.sessionId || activeSession?.id || '').trim();
  if (!studentCode || !term || !sessionId) {
    return res.status(400).json({ message: 'studentCode, term, and sessionId are required.' });
  }
  const student = resolveStudentByIdentifier(adminStore.students || [], studentCode);
  if (student) {
    const access = await ensureTokenAccess(student.id, term, sessionId);
    if (!access) {
      return res.status(403).json({ message: 'Result access has not been activated for this term.' });
    }
  }
  const finalResult = await getFinalResult({ studentCode, term, sessionId });
  if (!finalResult) {
    return res.json({ finalResult: null, student: student || null, message: 'Final result not found yet.' });
  }
  return res.json({ finalResult, student: student || null });
});

export default resultsRouter;
