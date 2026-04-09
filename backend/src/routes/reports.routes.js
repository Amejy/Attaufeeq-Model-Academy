import { Router } from 'express';
import { adminStore } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureActiveAcademicSession } from '../repositories/academicSessionRepository.js';
import { withCache } from '../services/cacheService.js';
import { countFullyAdmittedStudents, filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { normalizeInstitution } from '../utils/institution.js';

const reportsRouter = Router();
const INSTITUTIONS = ['ATTAUFEEQ Model Academy', 'Madrastul ATTAUFEEQ', 'Quran Memorization Academy'];
const REPORTS_CACHE_TTL_SECONDS = 30;

reportsRouter.use(requireAuth, requireRole('admin'));

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

function classMatchesInstitution(classId, institution = '') {
  if (!institution) return true;
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return normalizeInstitution(classItem?.institution || '') === normalizeInstitution(institution);
}

function studentMatchesInstitution(studentId, institution = '') {
  if (!institution) return true;
  const student = adminStore.students.find((item) => item.id === studentId);
  return normalizeInstitution(student?.institution || '') === normalizeInstitution(institution);
}

function resolveEnrollmentClassId(studentId, sessionId = '') {
  if (!studentId) return '';
  return (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && matchesSession(entry.sessionId, sessionId)
  )?.classId || '';
}

function calculateAverageTotals(term, sessionId = '', institution = '') {
  const target = term ? adminStore.results.filter((item) => item.term === term) : adminStore.results;

  const grouped = new Map();
  target
    .filter((item) => item.published)
    .filter((item) => matchesSession(item.sessionId, sessionId))
    .forEach((item) => {
      const prev = grouped.get(item.studentId) || { total: 0, count: 0 };
      grouped.set(item.studentId, {
        total: prev.total + Number(item.total || 0),
        count: prev.count + 1
      });
    });

  return [...grouped.entries()]
    .map(([studentId, data]) => {
      const student = adminStore.students.find((item) => item.id === studentId);
      const enrollment = sessionId
        ? (adminStore.studentEnrollments || []).find(
            (entry) => entry.studentId === studentId && entry.sessionId === sessionId
          )
        : null;
      const classId = enrollment?.classId || student?.classId || '';
      const classItem = adminStore.classes.find((item) => item.id === classId);
      return {
        studentId,
        studentName: student?.fullName || studentId,
        classId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : student?.level || 'Unassigned',
        institution: normalizeInstitution(student?.institution || classItem?.institution || 'Unknown'),
        average: data.count ? Number((data.total / data.count).toFixed(2)) : 0
      };
    })
    .filter((row) => (!institution ? true : normalizeInstitution(row.institution) === normalizeInstitution(institution)))
    .sort((a, b) => b.average - a.average);
}

function calculateTopPerformersByClass(term, sessionId = '', institution = '') {
  if (!term || term !== 'Third Term') return [];
  const rows = calculateAverageTotals(term, sessionId, institution);
  const grouped = new Map();

  rows.forEach((row) => {
    const student = adminStore.students.find((item) => item.id === row.studentId);
    const classItem = adminStore.classes.find((item) => item.id === row.classId);
    const institution = normalizeInstitution(student?.institution || classItem?.institution || 'Unknown');
    const classLabel = classItem ? `${classItem.name} ${classItem.arm}` : row.classId || 'Unassigned';
    const key = `${institution}|${row.classId || 'none'}`;
    const existing = grouped.get(key) || {
      institution,
      classId: row.classId || '',
      classLabel,
      rows: []
    };

    existing.rows.push(row);
    grouped.set(key, existing);
  });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => b.average - a.average).slice(0, 3)
    }))
    .sort((a, b) => a.institution.localeCompare(b.institution) || a.classLabel.localeCompare(b.classLabel));
}

function csvSafe(value) {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  const sanitized = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
  return `"${sanitized}"`;
}

async function resolveReportContext(req) {
  const term = req.query.term ? String(req.query.term) : '';
  const institution = req.query.institution ? String(req.query.institution) : '';
  const activeSession = await ensureActiveAcademicSession();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : activeSession?.id || '';
  return { term, institution, sessionId };
}

function buildReportsCacheKey(kind, { term = '', institution = '', sessionId = '' } = {}) {
  return `reports:${kind}:term=${term || 'all'}:institution=${institution || 'all'}:session=${sessionId || 'active'}`;
}

function calculateInstitutionFeeMetrics({ term = '', institution = '', sessionId = '' } = {}) {
  const scopedStudents = filterCountableActiveStudents(adminStore.students, institution);
  const scopedStudentIds = new Set(scopedStudents.map((student) => student.id));

  const feePlanTotal = scopedStudents.reduce((sum, student) => {
    const classId = resolveEnrollmentClassId(student.id, sessionId) || student.classId || '';
    if (!classId) return sum;

    const studentPlanTotal = adminStore.feePlans
      .filter((item) => item.classId === classId)
      .filter((item) => matchesSession(item.sessionId, sessionId))
      .filter((item) => (!term || item.term === term))
      .reduce((innerSum, item) => innerSum + Number(item.amount || 0), 0);

    return sum + studentPlanTotal;
  }, 0);

  const feePaidTotal = adminStore.payments
    .filter((item) => scopedStudentIds.has(item.studentId))
    .filter((item) => matchesSession(item.sessionId, sessionId))
    .filter((item) => (!term || item.term === term))
    .reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);

  return {
    feePlanTotal,
    feePaidTotal,
    outstandingFees: Math.max(0, feePlanTotal - feePaidTotal)
  };
}

function buildSummaryPayload({ term = '', institution = '', sessionId = '' } = {}) {
  const admissionsByStatus = ['pending', 'approved', 'rejected', 'admitted'].map((status) => ({
    status,
    count: status === 'admitted'
      ? countFullyAdmittedStudents(adminStore.students, institution)
      : status === 'approved'
        ? adminStore.admissions.filter((item) => item.status === 'approved' && !item.promotedStudentId && (!institution || normalizeInstitution(item.institution) === normalizeInstitution(institution))).length
        : adminStore.admissions.filter((item) => item.status === status && (!institution || normalizeInstitution(item.institution) === normalizeInstitution(institution))).length
  }));

  const scopedStudents = filterCountableActiveStudents(adminStore.students, institution);
  const scopedTeachers = adminStore.teachers.filter((teacher) => (!institution || normalizeInstitution(teacher.institution) === normalizeInstitution(institution)));
  const scopedClasses = adminStore.classes.filter((classItem) => (!institution || normalizeInstitution(classItem.institution) === normalizeInstitution(institution)));
  const studentsByInstitution = Object.entries(
    scopedStudents.reduce((acc, student) => {
      const key = normalizeInstitution(student.institution) || 'Unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map(([institution, count]) => ({ institution, count }));

  const gradeDistribution = Object.entries(
    adminStore.results.reduce((acc, result) => {
      if (!result.published) return acc;
      if (!matchesSession(result.sessionId, sessionId)) return acc;
      if (term && result.term !== term) return acc;
      if (!studentMatchesInstitution(result.studentId, institution) && !classMatchesInstitution(result.classId, institution)) {
        return acc;
      }
      acc[result.grade] = (acc[result.grade] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade.localeCompare(b.grade));

  const feeMetrics = calculateInstitutionFeeMetrics({ term, institution, sessionId });
  const institutions = institution ? [institution] : INSTITUTIONS;
  const institutionSummary = institutions.map((institutionName) => ({
    institution: institutionName,
    students: filterCountableActiveStudents(adminStore.students, institutionName).length,
    teachers: adminStore.teachers.filter((item) => normalizeInstitution(item.institution) === normalizeInstitution(institutionName)).length,
    classes: adminStore.classes.filter((item) => normalizeInstitution(item.institution) === normalizeInstitution(institutionName)).length,
    admissions: countFullyAdmittedStudents(adminStore.students, institutionName)
  }));

  return {
    term: term || 'All Terms',
    sessionId,
    institution,
    metrics: {
      totalStudents: scopedStudents.length,
      totalTeachers: scopedTeachers.length,
      totalClasses: scopedClasses.length,
      totalSubjects: adminStore.subjects.length,
      totalAdmissions: countFullyAdmittedStudents(adminStore.students, institution),
      feePlanTotal: feeMetrics.feePlanTotal,
      feePaidTotal: feeMetrics.feePaidTotal,
      outstandingFees: feeMetrics.outstandingFees
    },
    admissionsByStatus,
    studentsByInstitution,
    institutionSummary,
    gradeDistribution,
    topPerformers: calculateAverageTotals(term, sessionId, institution).slice(0, 10)
  };
}

function buildPerformancePayload({ term = '', institution = '', sessionId = '' } = {}) {
  const rows = calculateAverageTotals(term, sessionId, institution);
  const grouped = calculateTopPerformersByClass(term, sessionId, institution);
  return { term: term || 'All Terms', sessionId, institution, rows, grouped };
}

reportsRouter.get('/admin/summary', async (req, res) => {
  const context = await resolveReportContext(req);
  const payload = await withCache(
    buildReportsCacheKey('summary', context),
    async () => buildSummaryPayload(context),
    { ttlSeconds: REPORTS_CACHE_TTL_SECONDS }
  );
  res.setHeader('Cache-Control', `private, max-age=${REPORTS_CACHE_TTL_SECONDS}`);
  return res.json(payload);
});

reportsRouter.get('/admin/performance', async (req, res) => {
  const context = await resolveReportContext(req);
  const payload = await withCache(
    buildReportsCacheKey('performance', context),
    async () => buildPerformancePayload(context),
    { ttlSeconds: REPORTS_CACHE_TTL_SECONDS }
  );
  res.setHeader('Cache-Control', `private, max-age=${REPORTS_CACHE_TTL_SECONDS}`);
  return res.json(payload);
});

reportsRouter.get('/admin/performance.csv', async (req, res) => {
  const context = await resolveReportContext(req);
  const payload = await withCache(
    buildReportsCacheKey('performance', context),
    async () => buildPerformancePayload(context),
    { ttlSeconds: REPORTS_CACHE_TTL_SECONDS }
  );
  const rows = payload.rows || [];
  const csv = [
    'studentId,studentName,institution,classId,classLabel,average',
    ...rows.map((row) => [
      csvSafe(row.studentId),
      csvSafe(row.studentName),
      csvSafe(row.institution),
      csvSafe(row.classId),
      csvSafe(row.classLabel),
      csvSafe(row.average)
    ].join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="performance-report.csv"');
  return res.send(csv);
});

export default reportsRouter;
