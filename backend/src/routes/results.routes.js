import { Router } from 'express';
import { addActivityLog, adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureActiveAcademicSession } from '../repositories/academicSessionRepository.js';
import { listTeacherAssignments } from '../repositories/teacherAssignmentRepository.js';
import { createResultTokenAccess, findUsedTokenForStudentTerm, getResultTokenAccess } from '../repositories/resultTokenRepository.js';
import { clearUnsubmittedResults, listResults, markResultsClearedForTeacher, publishResults, submitResults, upsertResult } from '../repositories/resultRepository.js';
import { findUserById } from '../repositories/userRepository.js';
import { findChildForParent, findClassLead, findStudentByUser, findTeacherByUser, findChildrenForParent } from '../utils/portalScope.js';
import { institutionEquals, normalizeInstitution } from '../utils/institution.js';
import { resolveNextTermBegins } from '../utils/academicCalendar.js';
import { inferClassStage, normalizeTerm } from '../utils/academicProgression.js';
import { resolveStudentByIdentifier } from '../utils/studentCode.js';
import { filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { sendAdminNotificationEmail } from '../utils/mailer.js';
import { toPublicErrorMessage } from '../utils/publicError.js';
import { hasAttendanceOverride, hasBehaviorOverride, normalizeReportOverride, normalizeReportSettings } from '../utils/reportConfig.js';
import { publicUpload, saveUploadedFile } from './upload.js';
import {
  compileFinalResultForGroup,
  createSubjectResult,
  getFinalResult,
  listPendingSubjectGroups,
  upsertFinalResult
} from '../repositories/subjectResultRepository.js';
import { getAssignedResultToken } from '../repositories/resultTokenRepository.js';

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

function normalizeResultBreakdown(result = {}) {
  const normalizedCa = Number(result.ca || 0);
  const hasExplicitBreakdown = result.test1 !== undefined || result.test2 !== undefined;
  const fallbackTest1 = Number((normalizedCa / 2).toFixed(2));
  const fallbackTest2 = Number((normalizedCa - fallbackTest1).toFixed(2));
  const test1 = hasExplicitBreakdown ? Number(result.test1 || 0) : fallbackTest1;
  const test2 = hasExplicitBreakdown ? Number(result.test2 || 0) : fallbackTest2;

  return {
    ...result,
    test1,
    test2,
    ca: Number((test1 + test2).toFixed(2)),
    exam: Number(result.exam || 0),
    total: Number(result.total || 0)
  };
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

async function getAvailableReleasedToken(studentId, term, sessionId) {
  if (!studentId || !term) return null;
  const token = await getAssignedResultToken({ studentId, term, sessionId, includeToken: true });
  if (!token || token.status === 'expired' || token.status === 'used') return null;
  return {
    id: token.id,
    token: token.token,
    tokenPreview: token.tokenPreview,
    term: token.term,
    sessionId: token.sessionId,
    assignedAt: token.assignedAt || '',
    expiresAt: token.expiresAt || '',
    remainingUses: token.remainingUses
  };
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

function resolveAttendanceRate(studentId, term = '', sessionId = '') {
  if (!studentId) return '—';
  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId)
    .filter((record) => matchesSession(record.sessionId, sessionId));
  const activeTerm = term || resolveLatestTerm(allRows.map((record) => record.term));
  const rows = activeTerm
    ? allRows.filter((record) => String(record.term || '').trim() === activeTerm)
    : allRows;
  const total = rows.length;
  if (!total) return '—';
  const present = rows.filter((record) => record.present).length;
  return `${Number(((present / total) * 100).toFixed(1))}%`;
}

function resolveBehaviorRating(studentId, term = '', sessionId = '') {
  if (!studentId) return '—';
  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId)
    .filter((record) => matchesSession(record.sessionId, sessionId))
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

function normalizeAttendanceStatus(value, present) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'late') return 'late';
  if (normalized === 'absent') return 'absent';
  if (normalized === 'present') return 'present';
  return present === false ? 'absent' : 'present';
}

function resolveAttendanceSummary(studentId, term = '', sessionId = '') {
  if (!studentId) {
    return {
      totalSchoolDays: 0,
      daysPresent: 0,
      daysAbsent: 0,
      lateComing: 0,
      attendanceRate: 0,
      attendanceRemark: '—'
    };
  }

  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId)
    .filter((record) => matchesSession(record.sessionId, sessionId));
  const activeTerm = term || resolveLatestTerm(allRows.map((record) => record.term));
  const rows = activeTerm
    ? allRows.filter((record) => String(record.term || '').trim() === activeTerm)
    : allRows;
  const totalSchoolDays = rows.length;
  const daysAbsent = rows.filter((record) => normalizeAttendanceStatus(record.status, record.present) === 'absent').length;
  const lateComing = rows.filter((record) => normalizeAttendanceStatus(record.status, record.present) === 'late').length;
  const daysPresent = totalSchoolDays - daysAbsent;
  const attendanceRate = totalSchoolDays ? Number(((daysPresent / totalSchoolDays) * 100).toFixed(1)) : 0;

  let attendanceRemark = 'No attendance record yet';
  if (totalSchoolDays) {
    if (attendanceRate >= 95 && lateComing <= 1) attendanceRemark = 'Excellent attendance';
    else if (attendanceRate >= 85) attendanceRemark = 'Good attendance';
    else if (attendanceRate >= 70) attendanceRemark = 'Fair attendance';
    else attendanceRemark = 'Attendance needs improvement';
  }

  return { totalSchoolDays, daysPresent, daysAbsent, lateComing, attendanceRate, attendanceRemark };
}

function resolveBehaviorRatings(studentId, term = '', sessionId = '') {
  const fields = ['discipline', 'responsibility', 'cooperation', 'respect', 'initiative'];
  const scoreMap = { A: 4, B: 3, C: 2, D: 1 };
  const gradeFromAverage = (average) => {
    if (!average) return '—';
    if (average >= 3.5) return 'A';
    if (average >= 2.5) return 'B';
    if (average >= 1.5) return 'C';
    return 'D';
  };
  const allRows = adminStore.attendanceRecords
    .filter((record) => record.studentId === studentId)
    .filter((record) => matchesSession(record.sessionId, sessionId));
  const activeTerm = term || resolveLatestTerm(allRows.map((record) => record.term));
  const rows = activeTerm
    ? allRows.filter((record) => String(record.term || '').trim() === activeTerm)
    : allRows;

  return fields.reduce((summary, field) => {
    const scores = rows
      .map((record) => scoreMap[String(record.behavior?.[field] || '').trim().toUpperCase()])
      .filter(Boolean);
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    summary[field] = gradeFromAverage(average);
    return summary;
  }, {});
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

function findReportRemark({ studentId = '', classId = '', sessionId = '', term = '' } = {}) {
  return (adminStore.reportRemarks || []).find(
    (item) =>
      item.studentId === studentId &&
      item.classId === classId &&
      matchesSession(item.sessionId, sessionId) &&
      item.term === term
  ) || null;
}

function mergeAttendanceSummary(base = {}, override = {}) {
  if (!hasAttendanceOverride({ attendanceSummary: override })) return base;
  const next = {
    ...base,
    totalSchoolDays: override.totalSchoolDays ?? base.totalSchoolDays ?? 0,
    daysPresent: override.daysPresent ?? base.daysPresent ?? 0,
    daysAbsent: override.daysAbsent ?? base.daysAbsent ?? 0,
    lateComing: override.lateComing ?? base.lateComing ?? 0,
    attendanceRemark: override.attendanceRemark || base.attendanceRemark || ''
  };
  next.attendanceRate = next.totalSchoolDays
    ? Number(((Number(next.daysPresent || 0) / Number(next.totalSchoolDays || 1)) * 100).toFixed(1))
    : 0;
  return next;
}

function mergeBehaviorRatings(base = {}, override = {}) {
  if (!hasBehaviorOverride({ behaviorRatings: override })) return base;
  return {
    discipline: override.discipline || base.discipline || '—',
    responsibility: override.responsibility || base.responsibility || '—',
    cooperation: override.cooperation || base.cooperation || '—',
    respect: override.respect || base.respect || '—',
    initiative: override.initiative || base.initiative || '—'
  };
}

function getReportSettings() {
  return normalizeReportSettings(adminStore.reportSettings || {});
}

function upsertReportRemark({ studentId = '', classId = '', sessionId = '', term = '', strengths, weaknesses, classTeacherRemark, headTeacherRemark, override } = {}) {
  const existingIndex = (adminStore.reportRemarks || []).findIndex(
    (item) =>
      item.studentId === studentId &&
      item.classId === classId &&
      matchesSession(item.sessionId, sessionId) &&
      item.term === term
  );
  const existing = existingIndex >= 0 ? adminStore.reportRemarks[existingIndex] : null;
  const next = {
    id: existing?.id || makeId('rrm'),
    studentId,
    classId,
    sessionId,
    term,
    strengths: strengths ?? existing?.strengths ?? '',
    weaknesses: weaknesses ?? existing?.weaknesses ?? '',
    classTeacherRemark: classTeacherRemark ?? existing?.classTeacherRemark ?? '',
    headTeacherRemark: headTeacherRemark ?? existing?.headTeacherRemark ?? '',
    override: override ? normalizeReportOverride(override) : (existing?.override || normalizeReportOverride({})),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    adminStore.reportRemarks[existingIndex] = next;
  } else {
    adminStore.reportRemarks.unshift(next);
  }

  return next;
}

function summarizeSubjectPerformance(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.subjectName)
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  const strengths = sorted.filter((row) => Number(row.total || 0) >= 70).slice(0, 2).map((row) => row.subjectName);
  const weaknesses = [...sorted]
    .reverse()
    .filter((row) => Number(row.total || 0) < 50)
    .slice(0, 2)
    .map((row) => row.subjectName);
  return { strengths, weaknesses };
}

function summarizeBehaviorForRemark(behaviorRatings = {}) {
  if (!behaviorRatings || typeof behaviorRatings !== 'object') return { strong: [], weak: [] };
  const labelMap = {
    discipline: 'discipline',
    responsibility: 'responsibility',
    cooperation: 'cooperation',
    respect: 'respect',
    initiative: 'initiative'
  };
  const strong = [];
  const weak = [];

  Object.entries(behaviorRatings).forEach(([key, grade]) => {
    const label = labelMap[key] || key;
    if (grade === 'A' || grade === 'B') strong.push(label);
    if (grade === 'D') weak.push(label);
  });

  return { strong: strong.slice(0, 2), weak: weak.slice(0, 2) };
}

function joinNatural(items = []) {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function resolveLearnerProfile(reportCard) {
  const institution = String(reportCard?.institution || '').toLowerCase();
  const classInfo = reportCard?.classInfo || null;
  const stage = inferClassStage(classInfo);
  const order = Number(stage?.order || 0);
  const isMadrasa = institution.includes('madrasa');
  const phase =
    order && order <= 40
      ? 'early-years'
      : order && order <= 100
        ? 'primary'
        : order && order <= 130
          ? 'junior'
          : 'senior';

  return { isMadrasa, phase };
}

function composeTeacherDraftRemark(reportCard, guided = {}) {
  const average = Number(reportCard?.averageScore || 0);
  const attendanceRate = Number(reportCard?.attendanceSummary?.attendanceRate || 0);
  const inferred = summarizeSubjectPerformance(reportCard?.rows || []);
  const strengths = guided.strengths?.length ? guided.strengths : inferred.strengths;
  const weaknesses = guided.weaknesses?.length ? guided.weaknesses : inferred.weaknesses;
  const behavior = summarizeBehaviorForRemark(reportCard?.behaviorRatings || {});
  const profile = resolveLearnerProfile(reportCard);

  const opener =
    profile.phase === 'early-years'
      ? average >= 60
        ? 'The learner showed encouraging development and steady classroom growth this term.'
        : 'The learner is still developing core classroom habits and needs patient guidance next term.'
      : average >= 70
        ? 'A very strong academic performance was maintained this term.'
        : average >= 60
          ? 'A solid academic performance was recorded this term.'
          : average >= 50
            ? 'A fair academic performance was recorded this term with room for growth.'
            : 'Academic performance needs closer attention and steady support next term.';

  const strengthLine = strengths.length
    ? `The student showed clear strength in ${joinNatural(strengths)}.`
    : profile.isMadrasa
      ? 'The student showed willingness to engage across lessons and guided memorization activities.'
      : 'The student showed willingness to engage across class activities.';
  const attendanceLine =
    attendanceRate >= 95
      ? 'Attendance was excellent and supported consistent classroom progress.'
      : attendanceRate >= 85
        ? 'Attendance was good overall and supported steady learning.'
        : attendanceRate >= 70
          ? 'Attendance was fair, but more consistency will improve academic continuity.'
          : 'Attendance needs improvement because missed school time affected continuity in learning.';
  const behaviorLine = behavior.strong.length
    ? `Behavioural strengths were seen in ${joinNatural(behavior.strong)}.`
    : profile.phase === 'early-years'
      ? 'Classroom conduct remained generally manageable and the learner responded to guidance.'
      : 'Classroom conduct remained generally manageable during the term.';
  const growthLine = weaknesses.length || behavior.weak.length
    ? `More focused support is needed in ${joinNatural([...weaknesses, ...behavior.weak].slice(0, 3))} next term.`
    : profile.isMadrasa
      ? 'The next step is to maintain this pace and keep building confidence in both learning and discipline.'
      : 'The next step is to maintain this pace and keep building confidence across all subjects.';

  return [opener, strengthLine, attendanceLine, behaviorLine, growthLine].join(' ');
}

function composeHeadTeacherDraftRemark(reportCard, classTeacherRemark = '', guidedWeaknesses = []) {
  const average = Number(reportCard?.averageScore || 0);
  const overallGrade = String(reportCard?.overallGrade || '').trim();
  const attendanceRate = Number(reportCard?.attendanceSummary?.attendanceRate || 0);
  const { strengths, weaknesses } = summarizeSubjectPerformance(reportCard?.rows || []);
  const finalWeaknesses = guidedWeaknesses.length ? guidedWeaknesses : weaknesses;
  const profile = resolveLearnerProfile(reportCard);

  const opener =
    profile.phase === 'early-years'
      ? average >= 60
        ? 'The learner recorded an encouraging term outcome.'
        : 'The learner needs closer foundational support in the coming term.'
      : average >= 70
        ? 'An excellent overall term result was achieved.'
        : average >= 60
          ? 'A very commendable overall term result was achieved.'
          : average >= 50
            ? 'A moderate overall result was achieved this term.'
            : 'The overall result for the term requires stronger follow-through.';

  const academicLine = strengths.length
    ? `Performance was especially encouraging in ${joinNatural(strengths)}.`
    : `The overall grade for the term stands at ${overallGrade || 'the recorded level'}.`;
  const supportLine = finalWeaknesses.length
    ? `Priority attention should now go to ${joinNatural(finalWeaknesses)}.`
    : profile.isMadrasa
      ? 'The focus now should be on preserving momentum, discipline, and consistent study next term.'
      : 'The focus now should be on preserving momentum and consistency next term.';
  const attendanceLine =
    attendanceRate >= 85
      ? 'Attendance was supportive of stable academic progress.'
      : 'Attendance should improve further so classroom progress can remain stable.';
  const teacherLine = classTeacherRemark
    ? 'The class teacher remarks support the need for steady follow-up at home and in school.'
    : 'Continued cooperation between home and school will help the student progress further.';

  return [opener, academicLine, supportLine, attendanceLine, teacherLine].join(' ');
}

function buildGeneratedRemarkRows({ classId = '', term = '', sessionId = '', role = 'teacher', studentId = '', preserveExisting = false } = {}) {
  const students = resolveClassStudents(classId, sessionId)
    .filter((student) => !studentId || student.id === studentId);
  return students.map((student) => {
    const reportCard = buildReportCard(student, term, { includeUnpublished: true, sessionId });
    const remark = findReportRemark({ studentId: student.id, classId, sessionId, term });
    const guidedStrengths = String(remark?.strengths || '').trim();
    const guidedWeaknesses = String(remark?.weaknesses || '').trim();
    const strengths = guidedStrengths
      ? guidedStrengths.split(',').map((item) => item.trim()).filter(Boolean)
      : summarizeSubjectPerformance(reportCard?.rows || []).strengths;
    const weaknesses = guidedWeaknesses
      ? guidedWeaknesses.split(',').map((item) => item.trim()).filter(Boolean)
      : summarizeSubjectPerformance(reportCard?.rows || []).weaknesses;
    const generatedTeacherRemark = composeTeacherDraftRemark(reportCard, { strengths, weaknesses });
    const existingTeacherRemark = String(remark?.classTeacherRemark || '').trim();
    const classTeacherRemark = role === 'teacher'
      ? (preserveExisting && existingTeacherRemark ? existingTeacherRemark : generatedTeacherRemark)
      : (remark?.classTeacherRemark || generatedTeacherRemark);
    const headTeacherRemark = composeHeadTeacherDraftRemark(reportCard, classTeacherRemark, weaknesses);
    const existingHeadTeacherRemark = String(remark?.headTeacherRemark || '').trim();

    return {
      studentId: student.id,
      studentName: student.fullName,
      strengths: strengths.join(', '),
      weaknesses: weaknesses.join(', '),
      classTeacherRemark,
      override: normalizeReportOverride(remark?.override || {}),
      headTeacherRemark: role === 'admin'
        ? (preserveExisting && existingHeadTeacherRemark ? existingHeadTeacherRemark : headTeacherRemark)
        : remark?.headTeacherRemark || '',
      insight: {
        strengths,
        weaknesses,
        attendanceRate: reportCard?.attendanceSummary?.attendanceRate || 0,
        overallGrade: reportCard?.overallGrade || '',
        averageScore: reportCard?.averageScore || 0,
        phase: resolveLearnerProfile(reportCard).phase,
        institutionType: resolveLearnerProfile(reportCard).isMadrasa ? 'madrasa' : 'academy'
      }
    };
  });
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
      ...normalizeResultBreakdown(item),
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
  const classLead = findClassLead(classId);
  const reportRemark = findReportRemark({ studentId: student.id, classId, sessionId, term });
  let classRank = null;
  let classSize = null;
  const baseAttendanceSummary = resolveAttendanceSummary(student.id, term, sessionId);
  const baseBehaviorRatings = resolveBehaviorRatings(student.id, term, sessionId);
  const attendanceSummary = mergeAttendanceSummary(baseAttendanceSummary, reportRemark?.override?.attendanceSummary || {});
  const behaviorRatings = mergeBehaviorRatings(baseBehaviorRatings, reportRemark?.override?.behaviorRatings || {});
  const attendance = attendanceSummary.totalSchoolDays ? `${attendanceSummary.attendanceRate}%` : resolveAttendanceRate(student.id, term, sessionId);
  const behavior = Object.values(behaviorRatings).some((value) => value && value !== '—')
    ? behaviorRatings
    : resolveBehaviorRating(student.id, term, sessionId);

  if (term && classInfo && isClassRankingReady(term, classInfo.id, sessionId)) {
    const rankingResult = buildClassRanking(term, classInfo.id, sessionId);
    classSize = rankingResult.size;
    const self = rankingResult.ranking.find((entry) => entry.studentId === student.id);
    classRank = self ? self.position : null;
  }

  return {
    student,
    classInfo,
    classLead,
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
    attendanceSummary,
    behavior,
    behaviorRatings,
    nextTermBegins: resolveNextTermBegins(adminStore, sessionId, term),
    classTeacherRemark: reportRemark?.classTeacherRemark || '',
    headTeacherRemark: reportRemark?.headTeacherRemark || '',
    reportSettings: getReportSettings(),
    publishState: includeUnpublished
      ? rows.every((item) => item.published)
        ? 'Published'
        : 'Pending Approval'
      : 'Published',
    rows
  };
}

function enrichResult(item) {
  const normalized = normalizeResultBreakdown(item);
  const subject = adminStore.subjects.find((subjectEntry) => subjectEntry.id === item.subjectId);
  const classItem = adminStore.classes.find((classEntry) => classEntry.id === item.classId);
  const submittedTeacher = adminStore.teachers.find((teacher) => teacher.id === item.submittedByTeacherId);
  const enteredTeacher = adminStore.teachers.find((teacher) => teacher.id === item.enteredByTeacherId);
  const teacher = submittedTeacher || enteredTeacher || null;
  return {
    ...normalized,
    subjectName: subject?.name || item.subjectId,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId,
    teacherName: teacher?.fullName || '',
    teacherEmail: teacher?.email || teacher?.portalEmail || ''
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

function buildResultReadiness({ term = '', classId = '', sessionId = '', institution = '', results = [] } = {}) {
  const scopedClasses = adminStore.classes
    .filter((classItem) => (classId ? classItem.id === classId : true))
    .filter((classItem) => (institution ? institutionEquals(classItem.institution, institution) : true));
  const classIds = new Set(scopedClasses.map((classItem) => classItem.id));
  const scopedAssignments = adminStore.teacherAssignments
    .filter((assignment) => classIds.has(assignment.classId))
    .filter((assignment) => (term ? assignment.term === term : true));

  const assignmentScopes = new Map();
  scopedAssignments.forEach((assignment) => {
    const key = `${assignment.classId}|${assignment.subjectId}|${assignment.term}`;
    if (!assignmentScopes.has(key)) {
      assignmentScopes.set(key, {
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        term: assignment.term,
        teacherIds: new Set()
      });
    }
    assignmentScopes.get(key).teacherIds.add(assignment.teacherId);
  });

  const resultMap = new Map();
  results.forEach((result) => {
    if (!(result.submittedAt || result.submittedByTeacherId || result.published)) return;
    resultMap.set(`${result.studentId}|${result.classId}|${result.subjectId}|${result.term}`, result);
  });

  const missing = [];
  let expectedRows = 0;
  let submittedRows = 0;

  for (const scope of assignmentScopes.values()) {
    const classItem = adminStore.classes.find((item) => item.id === scope.classId);
    const subject = adminStore.subjects.find((item) => item.id === scope.subjectId);
    const teacherIds = [...scope.teacherIds];
    const teacherNames = teacherIds
      .map((teacherId) => adminStore.teachers.find((teacher) => teacher.id === teacherId)?.fullName)
      .filter(Boolean);
    const students = resolveClassStudents(scope.classId, sessionId)
      .filter((student) => {
        if (!institution) return true;
        const studentInstitution = student.institution || classItem?.institution || '';
        return institutionEquals(studentInstitution, institution);
      });

    students.forEach((student) => {
      expectedRows += 1;
      const row = resultMap.get(`${student.id}|${scope.classId}|${scope.subjectId}|${scope.term}`);
      if (row) {
        submittedRows += 1;
        return;
      }
      missing.push({
        studentId: student.id,
        studentName: student.fullName,
        classId: scope.classId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : scope.classId,
        subjectId: scope.subjectId,
        subjectName: subject?.name || scope.subjectId,
        term: scope.term,
        teacherIds,
        teacherNames
      });
    });
  }

  const ready = expectedRows > 0 && missing.length === 0;
  const completionPercent = expectedRows ? Number(((submittedRows / expectedRows) * 100).toFixed(1)) : 0;
  const missingTeachers = [...new Map(
    missing.flatMap((item) =>
      item.teacherIds.map((teacherId) => {
        const teacher = adminStore.teachers.find((entry) => entry.id === teacherId);
        return [teacherId, {
          teacherId,
          teacherName: teacher?.fullName || item.teacherNames[0] || teacherId,
          teacherEmail: teacher?.email || teacher?.portalEmail || '',
          missingCount: missing.filter((missingItem) => missingItem.teacherIds.includes(teacherId)).length
        }];
      })
    )
  ).values()].sort((a, b) => b.missingCount - a.missingCount || a.teacherName.localeCompare(b.teacherName));

  return {
    ready,
    expectedRows,
    submittedRows,
    missingCount: missing.length,
    completionPercent,
    missing,
    missingTeachers,
    assignmentCount: assignmentScopes.size
  };
}

function resultReadyRecipientsForStudent(student) {
  const candidates = [
    { email: student?.parentPortalEmail, name: student?.guardianName || 'Parent', roleLabel: 'Parent' },
    { email: student?.guardianEmail, name: student?.guardianName || 'Parent', roleLabel: 'Parent' },
    { email: student?.studentEmail || student?.portalEmail, name: student?.fullName || 'Student', roleLabel: 'Student' }
  ];
  const seen = new Set();
  return candidates
    .map((item) => ({ ...item, email: String(item.email || '').trim().toLowerCase() }))
    .filter((item) => {
      if (!item.email || seen.has(item.email)) return false;
      seen.add(item.email);
      return true;
    });
}

async function notifyFamiliesResultsReady({ students = [], term = '', sessionName = '', classLabel = '' } = {}) {
  const recipients = students.flatMap((student) =>
    resultReadyRecipientsForStudent(student).map((recipient) => ({ ...recipient, student }))
  );
  if (!recipients.length) {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const title = `${term || 'Term'} results are ready`;
  const deliveryResults = await Promise.allSettled(
    recipients.map((recipient) =>
      sendAdminNotificationEmail({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        roleLabel: recipient.roleLabel,
        title,
        message: [
          `${recipient.student?.fullName || 'Your child'}'s ${term || 'term'} result has been published${classLabel ? ` for ${classLabel}` : ''}.`,
          sessionName ? `Session: ${sessionName}.` : '',
          'Please log in to the portal or visit the result checker. If you have not activated access for this term, proceed with the result token process.'
        ].filter(Boolean).join(' ')
      })
    )
  );

  return deliveryResults.reduce(
    (summary, result) => {
      if (result.status === 'fulfilled') {
        if (result.value?.status === 'sent') summary.sent += 1;
        else summary.skipped += 1;
      } else {
        summary.failed += 1;
      }
      return summary;
    },
    { attempted: recipients.length, sent: 0, skipped: 0, failed: 0 }
  );
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

resultsRouter.get('/teacher/remarks', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.query.sessionId || activeSession?.id || '').trim();

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const classAssignments = adminStore.teacherAssignments.filter(
    (item) => item.classId === classId && item.term === term
  );
  const lead = classAssignments.find((item) => isLeadTeacherAssignment(item));
  if (lead && lead.teacherId !== teacher.id) {
    return res.status(403).json({ message: 'Only the class lead teacher can manage class teacher remarks.' });
  }

  const students = resolveClassStudents(classId, sessionId);
  const remarks = students.map((student) => {
    const remark = findReportRemark({ studentId: student.id, classId, sessionId, term });
    return {
      studentId: student.id,
      studentName: student.fullName,
      strengths: remark?.strengths || '',
      weaknesses: remark?.weaknesses || '',
      classTeacherRemark: remark?.classTeacherRemark || ''
    };
  });

  return res.json({ remarks });
});

resultsRouter.post('/teacher/remarks', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const classAssignments = adminStore.teacherAssignments.filter(
    (item) => item.classId === classId && item.term === term
  );
  const lead = classAssignments.find((item) => isLeadTeacherAssignment(item));
  if (lead && lead.teacherId !== teacher.id) {
    return res.status(403).json({ message: 'Only the class lead teacher can save class teacher remarks.' });
  }

  const validStudentIds = new Set(resolveClassStudents(classId, sessionId).map((student) => student.id));
  const saved = rows
    .filter((row) => validStudentIds.has(row?.studentId))
    .map((row) => upsertReportRemark({
      studentId: row.studentId,
      classId,
      sessionId,
      term,
      strengths: String(row.strengths || '').trim(),
      weaknesses: String(row.weaknesses || '').trim(),
      classTeacherRemark: String(row.classTeacherRemark || '').trim()
    }));

  return res.json({ savedCount: saved.length, remarks: saved });
});

resultsRouter.post('/teacher/remarks/generate', requireAuth, requireRole('teacher'), async (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const preserveExisting = Boolean(req.body?.preserveExisting);

  if (!teacher) return res.status(403).json({ message: 'Teacher profile not found.' });
  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const classAssignments = adminStore.teacherAssignments.filter(
    (item) => item.classId === classId && item.term === term
  );
  const lead = classAssignments.find((item) => isLeadTeacherAssignment(item));
  if (lead && lead.teacherId !== teacher.id) {
    return res.status(403).json({ message: 'Only the class lead teacher can generate class teacher remarks.' });
  }

  const remarks = buildGeneratedRemarkRows({ classId, term, sessionId, role: 'teacher', studentId, preserveExisting });
  return res.json({ remarks });
});

resultsRouter.get('/admin/remarks', requireAuth, requireRole('admin'), async (req, res) => {
  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.query.sessionId || activeSession?.id || '').trim();

  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const students = resolveClassStudents(classId, sessionId);
  const remarks = students.map((student) => {
    const remark = findReportRemark({ studentId: student.id, classId, sessionId, term });
    return {
      studentId: student.id,
      studentName: student.fullName,
      strengths: remark?.strengths || '',
      weaknesses: remark?.weaknesses || '',
      classTeacherRemark: remark?.classTeacherRemark || '',
      headTeacherRemark: remark?.headTeacherRemark || '',
      override: normalizeReportOverride(remark?.override || {})
    };
  });

  return res.json({ remarks });
});

resultsRouter.post('/admin/remarks', requireAuth, requireRole('admin'), async (req, res) => {
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const validStudentIds = new Set(resolveClassStudents(classId, sessionId).map((student) => student.id));
  const saved = rows
    .filter((row) => validStudentIds.has(row?.studentId))
    .map((row) => upsertReportRemark({
      studentId: row.studentId,
      classId,
      sessionId,
      term,
      strengths: String(row.strengths || '').trim(),
      weaknesses: String(row.weaknesses || '').trim(),
      headTeacherRemark: String(row.headTeacherRemark || '').trim(),
      override: row.override || {}
    }));

  return res.json({ savedCount: saved.length, remarks: saved });
});

resultsRouter.get('/admin/report-settings', requireAuth, requireRole('admin'), async (_req, res) => {
  return res.json({ settings: getReportSettings() });
});

resultsRouter.put('/admin/report-settings', requireAuth, requireRole('admin'), async (req, res) => {
  adminStore.reportSettings = normalizeReportSettings({
    ...(adminStore.reportSettings || {}),
    ...req.body
  });
  return res.json({ settings: getReportSettings() });
});

resultsRouter.post('/admin/report-settings/signature', requireAuth, requireRole('admin'), publicUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No signature image uploaded.' });
  }

  try {
    const saved = await saveUploadedFile(file, {
      visibility: 'public',
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp']
    });
    const signatureImage = `/api/uploads/public/${saved.id}`;
    adminStore.reportSettings = normalizeReportSettings({
      ...(adminStore.reportSettings || {}),
      signatureImage
    });
    return res.status(200).json({ signatureImage, settings: getReportSettings() });
  } catch (error) {
    return res.status(400).json({ message: toPublicErrorMessage(error, 'We could not upload the report signature image.') });
  }
});

resultsRouter.delete('/admin/report-settings/signature', requireAuth, requireRole('admin'), async (_req, res) => {
  adminStore.reportSettings = normalizeReportSettings({
    ...(adminStore.reportSettings || {}),
    signatureImage: ''
  });
  return res.status(200).json({ signatureImage: '', settings: getReportSettings() });
});

resultsRouter.post('/admin/remarks/generate', requireAuth, requireRole('admin'), async (req, res) => {
  const classId = String(req.body?.classId || '').trim();
  const term = String(req.body?.term || '').trim();
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = String(req.body?.sessionId || activeSession?.id || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const preserveExisting = Boolean(req.body?.preserveExisting);

  if (!classId || !term || !sessionId) return res.status(400).json({ message: 'classId, term, and sessionId are required.' });

  const remarks = buildGeneratedRemarkRows({ classId, term, sessionId, role: 'admin', studentId, preserveExisting });
  return res.json({ remarks });
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
    const test1 = Number(row?.test1 ?? 0);
    const test2 = Number(row?.test2 ?? 0);
    const ca = test1 + test2;
    const exam = Number(row?.exam ?? 0);
    const caNote = String(row?.caNote || '').trim();
    const examNote = String(row?.examNote || '').trim();

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

    if (
      Number.isNaN(test1) || Number.isNaN(test2) || Number.isNaN(exam) ||
      test1 < 0 || test1 > 20 ||
      test2 < 0 || test2 > 20 ||
      exam < 0 || exam > 60
    ) {
      return res.status(400).json({ message: 'Scores must be within Test 1 0-20, Test 2 0-20, and Exam 0-60.' });
    }

    if ((ca === 0 && !caNote) || (exam === 0 && !examNote)) {
      return res.status(400).json({
        message: 'Add a short assessment or exam note when a student has 0, for example Absent, Sick, or Did not write.'
      });
    }
  }

  const upserted = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const studentId = row.studentId;
    const test1 = Number(row.test1 || 0);
    const test2 = Number(row.test2 || 0);
    const ca = test1 + test2;
    const exam = Number(row.exam || 0);
    const caNote = String(row.caNote || '').trim();
    const examNote = String(row.examNote || '').trim();
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
      test1,
      test2,
      ca,
      exam,
      caNote,
      examNote,
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
      const submittedTeacher = adminStore.teachers.find((teacherItem) => teacherItem.id === item.submittedByTeacherId);
      const enteredTeacher = adminStore.teachers.find((teacherItem) => teacherItem.id === item.enteredByTeacherId);
      const teacher = submittedTeacher || enteredTeacher || null;

      return {
        ...item,
        studentName: student?.fullName || item.studentId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId,
        subjectName: subject?.name || item.subjectId,
        institution: item.institution || institution,
        teacherName: teacher?.fullName || '',
        teacherEmail: teacher?.email || teacher?.portalEmail || ''
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

  const rawResults = await listResults({ term, classId, sessionId, institution });
  const filtered = rawResults
    .map((item) => {
      const student = adminStore.students.find((studentItem) => studentItem.id === item.studentId);
      const classItem = adminStore.classes.find((classEntry) => classEntry.id === item.classId);
      const subject = adminStore.subjects.find((subjectEntry) => subjectEntry.id === item.subjectId);
      const submittedTeacher = adminStore.teachers.find((teacherItem) => teacherItem.id === item.submittedByTeacherId);
      const enteredTeacher = adminStore.teachers.find((teacherItem) => teacherItem.id === item.enteredByTeacherId);
      const teacher = submittedTeacher || enteredTeacher || null;

      return {
        ...item,
        studentName: student?.fullName || item.studentId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : item.classId,
        institution: item.institution || classItem?.institution || '',
        subjectName: subject?.name || item.subjectId,
        teacherName: teacher?.fullName || '',
        teacherEmail: teacher?.email || teacher?.portalEmail || ''
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.subjectName.localeCompare(b.subjectName));

  const readiness = buildResultReadiness({ term, classId, sessionId, institution, results: rawResults });
  return res.json({ results: filtered, readiness });
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
  const readiness = buildResultReadiness({ term, classId, sessionId, institution, results: candidateResults });
  if (!readiness.ready) {
    return res.status(400).json({
      message: readiness.expectedRows
        ? 'Cannot publish yet. Every assigned teacher must submit every subject result for every student in the selected class scope.'
        : 'Cannot publish yet. No teacher assignments were found for this class, term, and session.',
      readiness,
      blockedCount: readiness.missingCount,
      blockedStudents: readiness.missing.slice(0, 50)
    });
  }

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

  const publishedStudents = [...resultByStudent.keys()]
    .map((studentId) => adminStore.students.find((item) => item.id === studentId))
    .filter(Boolean);
  const classInfo = classId
    ? adminStore.classes.find((item) => item.id === classId)
    : adminStore.classes.find((item) => item.id === updatedRows[0]?.classId);
  const activeSessionName = activeSession?.sessionName || sessionId;
  const familyNotification = await notifyFamiliesResultsReady({
    students: publishedStudents,
    term,
    sessionName: activeSessionName,
    classLabel: classInfo ? `${classInfo.name} ${classInfo.arm || ''}`.trim() : ''
  });

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
    compiledCount: resultByStudent.size,
    familyNotification
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
        holdReason: 'Result access has not been activated for this term. Use your result token first.',
        availableToken: await getAvailableReleasedToken(student.id, term, sessionId)
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
      holdReason: 'Result access has not been activated for this term. Use your result token first.',
      availableToken: await getAvailableReleasedToken(student.id, term, sessionId)
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
        holdReason: 'Result access has not been activated for this term. Use your result token first.',
        availableToken: await getAvailableReleasedToken(child.id, term, sessionId)
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
      holdReason: 'Result access has not been activated for this term. Use your result token first.',
      availableToken: await getAvailableReleasedToken(child.id, term, sessionId)
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
