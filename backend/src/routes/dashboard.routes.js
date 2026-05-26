import { Router } from 'express';
import { adminStore } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { countFullyAdmittedStudents, filterCountableActiveStudents } from '../utils/studentLifecycle.js';
import { buildUserScope, findChildForParent, findChildrenForParent, findClassLead, findStudentByUser, findTeacherByUser } from '../utils/portalScope.js';
import { toPublicErrorMessage } from '../utils/publicError.js';

const dashboardRouter = Router();
const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0] || null;
  return active?.id || '';
}

function matchesSession(recordSessionId, sessionId) {
  if (!sessionId) return true;
  return String(recordSessionId || '').trim() === sessionId;
}

function resolveLatestTerm(values = []) {
  return values.reduce((latest, value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return latest;
    if (!latest) return normalized;
    return TERM_ORDER.indexOf(normalized) > TERM_ORDER.indexOf(latest) ? normalized : latest;
  }, '');
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

function buildTokenSalesControlOptions(sessionId = '') {
  return TERM_ORDER.map((term) => ({
    term,
    enabled: Boolean(getTokenSalesControl(sessionId, term)?.enabled)
  }));
}

function resolveTokenSalesMetrics() {
  const activeSessionId = getActiveSessionId();
  const latestTerm = resolveCurrentTokenTerm(activeSessionId);
  const requests = (adminStore.paymentRequests || []).filter((item) => matchesSession(item.sessionId, activeSessionId));
  const approvedRequests = requests.filter((item) => String(item.status || '').trim().toLowerCase() === 'approved');
  const paidRequests = approvedRequests.filter((item) => Number(item.amountPaid || 0) > 0);
  const tokenSalesControl = getTokenSalesControl(activeSessionId, latestTerm);

  const activeTermApproved = latestTerm
    ? paidRequests.filter((item) => String(item.term || '').trim() === latestTerm)
    : paidRequests;
  const activeTermPending = latestTerm
    ? requests.filter(
        (item) => String(item.term || '').trim() === latestTerm && String(item.status || 'pending').trim().toLowerCase() === 'pending'
      )
    : requests.filter((item) => String(item.status || 'pending').trim().toLowerCase() === 'pending');

  return {
    tokenSalesTerm: latestTerm,
    tokenSalesEnabled: Boolean(tokenSalesControl?.enabled),
    tokenSalesControls: buildTokenSalesControlOptions(activeSessionId),
    tokenSalesCount: activeTermApproved.length,
    tokenSalesRevenue: activeTermApproved.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0),
    tokenSalesReleasedCount: activeTermApproved.filter((item) => item.releasedTokenId).length,
    tokenSalesPendingCount: activeTermPending.length
  };
}

function isActiveUpcomingItem(item) {
  const teacherId = String(item?.teacherId || '').trim();
  const classId = String(item?.classId || '').trim();
  if (!teacherId || !classId) return false;

  const teacherExists = adminStore.teachers.some((teacher) => teacher.id === teacherId);
  if (!teacherExists) return false;

  return adminStore.teacherAssignments.some(
    (assignment) => assignment.teacherId === teacherId && assignment.classId === classId
  );
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function tokenizeSearch(value) {
  return normalizeSearch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function paginateRows(rows, page, pageSize) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.min(50, Math.max(5, Number(pageSize || 10)));
  const start = (safePage - 1) * safePageSize;
  return {
    items: rows.slice(start, start + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / safePageSize))
    }
  };
}

function compareValues(a, b, direction = 'desc') {
  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  const result = left.localeCompare(right);
  return direction === 'asc' ? result : result * -1;
}

function sortRows(rows, sortBy, sortDir) {
  const direction = String(sortDir || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
  const key = String(sortBy || '').trim() || 'updatedAt';
  return [...rows].sort((a, b) => compareValues(a[key], b[key], direction));
}

function coerceDateValue(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseDatePreset(value) {
  const preset = String(value || '').trim().toLowerCase();
  if (!preset) return 0;
  if (preset === 'today') return Date.now() - 24 * 60 * 60 * 1000;
  const days = Number(preset.replace(/[^0-9]/g, ''));
  if (!days) return 0;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function normalizeKeyword(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function keywordsFromValues(...values) {
  return [...new Set(values
    .flat()
    .map((value) => normalizeKeyword(value))
    .filter(Boolean)
    .flatMap((value) => value.split(/\s+/))
    .filter(Boolean))];
}

function computeSearchScore(item, query, tokens) {
  if (!query && !tokens.length) return 0;

  const title = normalizeKeyword(item.title);
  const subtitle = normalizeKeyword(item.subtitle);
  const keywords = keywordsFromValues(item.searchTokens, item.searchKeywords, item.status, item.entity, item.classLabel, item.roleLabel, item.categoryLabel, item.activityTypeLabel);
  const haystack = `${title} ${subtitle} ${keywords.join(' ')}`.trim();

  let score = 0;
  if (title === query) score += 240;
  else if (title.startsWith(query)) score += 150;
  else if (title.includes(query)) score += 110;

  if (subtitle.includes(query) && query) score += 55;
  if (haystack.includes(query) && query) score += 35;

  tokens.forEach((token) => {
    if (title.startsWith(token)) score += 30;
    else if (title.includes(token)) score += 20;
    if (subtitle.includes(token)) score += 10;
    if (keywords.includes(token)) score += 14;
    else if (haystack.includes(token)) score += 6;
  });

  return score;
}

function compareSmartRows(a, b) {
  if ((b.matchScore || 0) !== (a.matchScore || 0)) return (b.matchScore || 0) - (a.matchScore || 0);
  return compareValues(a.updatedAtTimestamp || 0, b.updatedAtTimestamp || 0, 'desc');
}

function sortSearchRows(rows, sortBy, sortDir) {
  if (!sortBy || sortBy === 'smart') {
    return [...rows].sort(compareSmartRows);
  }
  return sortRows(rows, sortBy, sortDir);
}

function optionLabel(value = '') {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSuggestionPool(items = []) {
  const pool = new Map();
  const push = (type, value, label = value) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    const key = `${type}:${normalizedValue.toLowerCase()}`;
    const existing = pool.get(key);
    pool.set(key, {
      type,
      value: normalizedValue,
      label: String(label || normalizedValue).trim(),
      count: (existing?.count || 0) + 1
    });
  };

  items.forEach((item) => {
    push('query', item.title, item.title);
    push('entity', item.entity, item.entityLabel || optionLabel(item.entity));
    push('status', item.status, optionLabel(item.status));
    push('class', item.classId, item.classLabel || classLabelFromId(item.classId));
    push('role', item.roleKey, item.roleLabel);
    push('category', item.category, item.categoryLabel);
    push('activity', item.activityType, item.activityTypeLabel);
  });

  return [...pool.values()]
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
    .slice(0, 12);
}

function buildAvailableFilters(items = []) {
  const collect = (key, labelKey) => {
    const map = new Map();
    items.forEach((item) => {
      const value = String(item[key] || '').trim();
      if (!value) return;
      if (!map.has(value)) {
        map.set(value, {
          value,
          label: String(item[labelKey] || optionLabel(value)).trim()
        });
      }
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  };

  return {
    statuses: collect('status', 'statusLabel'),
    roles: collect('roleKey', 'roleLabel'),
    categories: collect('category', 'categoryLabel'),
    activityTypes: collect('activityType', 'activityTypeLabel'),
    classes: collect('classId', 'classLabel')
  };
}

function matchesSearch(item, query, tokens) {
  if (!query && !tokens.length) return true;
  const score = computeSearchScore(item, query, tokens);
  item.matchScore = score;
  item.matchLabel = score >= 180 ? 'Strong match' : score >= 90 ? 'Quick match' : score > 0 ? 'Related' : '';
  return score > 0;
}

function buildSearchItem(base = {}) {
  const updatedAt = base.updatedAt || base.createdAt || '';
  return {
    ...base,
    entityLabel: base.entityLabel || optionLabel(base.entity),
    statusLabel: base.statusLabel || optionLabel(base.status),
    classLabel: base.classLabel || classLabelFromId(base.classId),
    updatedAt,
    createdAt: base.createdAt || '',
    updatedAtTimestamp: coerceDateValue(updatedAt),
    createdAtTimestamp: coerceDateValue(base.createdAt || ''),
    searchTokens: keywordsFromValues(
      base.id,
      base.title,
      base.subtitle,
      base.status,
      base.classLabel,
      base.institution,
      base.roleLabel,
      base.categoryLabel,
      base.activityTypeLabel,
      base.searchKeywords
    ),
    matchScore: 0,
    matchLabel: ''
  };
}

function getSessionClassId(studentId, sessionId = '') {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function classLabelFromId(classId = '') {
  const classItem = (adminStore.classes || []).find((entry) => entry.id === classId);
  return classItem ? `${classItem.name} ${classItem.arm}`.trim() : classId;
}

function buildDashboardSearchResults(req) {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const q = normalizeSearch(req.query.q);
  const tokens = tokenizeSearch(req.query.q);
  const entity = String(req.query.entity || 'all').trim().toLowerCase();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const sortBy = String(req.query.sortBy || '').trim();
  const sortDir = String(req.query.sortDir || 'desc').trim().toLowerCase();
  const classIdFilter = String(req.query.classId || '').trim();
  const statusFilter = String(req.query.status || '').trim().toLowerCase();
  const institutionFilter = String(req.query.institution || '').trim().toLowerCase();
  const termFilter = String(req.query.term || '').trim();
  const categoryFilter = String(req.query.category || '').trim().toLowerCase();
  const activityTypeFilter = String(req.query.activityType || '').trim().toLowerCase();
  const roleFilter = String(req.query.role || '').trim().toLowerCase();
  const datePreset = String(req.query.datePreset || '').trim().toLowerCase();
  const dateThreshold = parseDatePreset(datePreset);

  const teacher = role === 'teacher' ? findTeacherByUser(req.user) : null;
  const teacherAssignments = teacher
    ? (adminStore.teacherAssignments || []).filter((item) => item.teacherId === teacher.id)
    : [];
  const teacherClassIds = new Set(teacherAssignments.map((item) => item.classId));
  const teacherSubjectIds = new Set(teacherAssignments.map((item) => item.subjectId));

  const allowedEntitiesByRole = {
    admin: ['all', 'students', 'teachers', 'parents', 'applications', 'receipts', 'classes', 'results'],
    admissions: ['all', 'applications', 'students', 'parents', 'receipts', 'tokens'],
    teacher: ['all', 'students', 'parents', 'results', 'classes', 'tasks']
  };

  if (!allowedEntitiesByRole[role]?.includes(entity)) {
    return {
      entity,
      items: [],
      filters: {},
      suggestions: [],
      availableFilters: {
        statuses: [],
        roles: [],
        categories: [],
        activityTypes: [],
        classes: []
      },
      pagination: { page: 1, pageSize, total: 0, totalPages: 1 }
    };
  }

  const items = [];
  const pushIf = (condition, item) => {
    if (!condition) return;
    if (statusFilter && item.status !== statusFilter) return;
    if (classIdFilter && item.classId !== classIdFilter) return;
    if (institutionFilter && !String(item.institution || '').toLowerCase().includes(institutionFilter)) return;
    if (termFilter && String(item.term || '').trim() !== termFilter) return;
    if (categoryFilter && String(item.category || '').toLowerCase() !== categoryFilter) return;
    if (activityTypeFilter && String(item.activityType || '').toLowerCase() !== activityTypeFilter) return;
    if (roleFilter && String(item.roleKey || '').toLowerCase() !== roleFilter) return;
    if (dateThreshold && (item.updatedAtTimestamp || item.createdAtTimestamp || 0) < dateThreshold) return;
    if (!matchesSearch(item, q, tokens)) return;
    items.push(item);
  };

  if (role === 'admin' || role === 'admissions') {
    const admissionRows = (adminStore.admissions || []).map((entry) => buildSearchItem({
      id: entry.id,
      entity: 'applications',
      title: entry.fullName || 'Unnamed applicant',
      subtitle: `${entry.institution || 'Institution'}${entry.classId ? ` • ${classLabelFromId(entry.classId)}` : ''}`,
      status: String(entry.status || 'pending').toLowerCase(),
      classId: entry.classId || '',
      classLabel: classLabelFromId(entry.classId),
      institution: String(entry.institution || ''),
      roleKey: 'student',
      roleLabel: 'Student',
      category: 'admissions',
      categoryLabel: 'Admissions',
      activityType: 'application-review',
      activityTypeLabel: 'Application Review',
      term: '',
      updatedAt: entry.updatedAt || entry.createdAt || '',
      createdAt: entry.createdAt || '',
      searchKeywords: [entry.phone, entry.guardianName, entry.guardianEmail, entry.trackingCode]
    }));
    admissionRows.forEach((item) => {
      pushIf(entity === 'all' || entity === 'applications', item);
    });

    const receiptRows = (adminStore.paymentRequests || []).map((entry) => {
      const student = (adminStore.students || []).find((record) => record.id === entry.studentId);
      return buildSearchItem({
        id: entry.id,
        entity: 'receipts',
        title: student?.fullName || entry.studentId,
        subtitle: `${entry.term || 'Term'} • ${entry.method || 'Receipt upload'}`,
        status: String(entry.status || 'pending').toLowerCase(),
        classId: getSessionClassId(entry.studentId, entry.sessionId) || student?.classId || '',
        classLabel: classLabelFromId(getSessionClassId(entry.studentId, entry.sessionId) || student?.classId || ''),
        institution: String(student?.institution || ''),
        roleKey: 'student',
        roleLabel: 'Student',
        category: 'finance',
        categoryLabel: 'Finance',
        activityType: 'receipt-review',
        activityTypeLabel: 'Receipt Review',
        term: entry.term || '',
        updatedAt: entry.reviewedAt || entry.createdAt || '',
        createdAt: entry.createdAt || '',
        amountPaid: Number(entry.amountPaid || 0),
        searchKeywords: [entry.method, entry.sessionId, student?.guardianName, student?.parentPortalEmail, student?.guardianEmail]
      });
    });
    receiptRows.forEach((item) => {
      pushIf(entity === 'all' || entity === 'receipts', item);
    });

    const studentRows = filterCountableActiveStudents(adminStore.students || []).map((student) => buildSearchItem({
      id: student.id,
      entity: 'students',
      title: student.fullName || student.id,
      subtitle: `${student.institution || 'Institution'} • ${student.classLabel || classLabelFromId(student.classId)}`,
      status: String(student.accountStatus || 'active').toLowerCase(),
      classId: student.classId || '',
      classLabel: student.classLabel || classLabelFromId(student.classId),
      institution: String(student.institution || ''),
      roleKey: 'student',
      roleLabel: 'Student',
      category: 'people',
      categoryLabel: 'People',
      activityType: 'student-record',
      activityTypeLabel: 'Student Record',
      term: '',
      updatedAt: student.updatedAt || student.createdAt || '',
      createdAt: student.createdAt || '',
      searchKeywords: [student.studentEmail, student.portalEmail, student.guardianName, student.guardianEmail, student.parentPortalEmail, student.level]
    }));
    studentRows.forEach((item) => {
      pushIf(entity === 'all' || entity === 'students', item);
    });

    const parentRows = filterCountableActiveStudents(adminStore.students || [])
      .filter((student) => student.guardianName || student.guardianEmail || student.parentPortalEmail)
      .map((student) => buildSearchItem({
        id: `parent:${student.id}`,
        entity: 'parents',
        title: student.guardianName || student.parentPortalEmail || student.guardianEmail || `Parent of ${student.fullName || student.id}`,
        subtitle: `${student.fullName || student.id}${student.classId ? ` • ${student.classLabel || classLabelFromId(student.classId)}` : ''}`,
        status: 'linked',
        classId: student.classId || '',
        classLabel: student.classLabel || classLabelFromId(student.classId),
        institution: String(student.institution || ''),
        roleKey: 'parent',
        roleLabel: 'Parent',
        category: 'people',
        categoryLabel: 'People',
        activityType: 'guardian-contact',
        activityTypeLabel: 'Guardian Contact',
        term: '',
        updatedAt: student.updatedAt || student.createdAt || '',
        createdAt: student.createdAt || '',
        searchKeywords: [student.fullName, student.guardianEmail, student.parentPortalEmail, student.guardianPhone]
      }));
    parentRows.forEach((item) => {
      pushIf(entity === 'all' || entity === 'parents', item);
    });
  }

  if (role === 'admin') {
    (adminStore.teachers || []).forEach((teacherRow) => {
      const item = buildSearchItem({
        id: teacherRow.id,
        entity: 'teachers',
        title: teacherRow.fullName || teacherRow.id,
        subtitle: `${teacherRow.institution || 'Institution'} • ${teacherRow.email || 'No email'}`,
        status: String(teacherRow.accountStatus || 'active').toLowerCase(),
        classId: '',
        classLabel: '',
        institution: String(teacherRow.institution || ''),
        roleKey: 'teacher',
        roleLabel: 'Teacher',
        category: 'people',
        categoryLabel: 'People',
        activityType: 'teacher-record',
        activityTypeLabel: 'Teacher Record',
        term: '',
        updatedAt: teacherRow.updatedAt || teacherRow.createdAt || '',
        createdAt: teacherRow.createdAt || '',
        searchKeywords: [teacherRow.email, teacherRow.phone, teacherRow.assignmentRole]
      });
      pushIf(entity === 'all' || entity === 'teachers', item);
    });

    (adminStore.classes || []).forEach((classRow) => {
      const item = buildSearchItem({
        id: classRow.id,
        entity: 'classes',
        title: `${classRow.name} ${classRow.arm}`.trim(),
        subtitle: classRow.institution || 'Institution',
        status: 'active',
        classId: classRow.id,
        classLabel: `${classRow.name} ${classRow.arm}`.trim(),
        institution: String(classRow.institution || ''),
        roleKey: 'admin',
        roleLabel: 'Admin',
        category: 'academics',
        categoryLabel: 'Academics',
        activityType: 'class-management',
        activityTypeLabel: 'Class Management',
        term: '',
        updatedAt: classRow.updatedAt || classRow.createdAt || '',
        createdAt: classRow.createdAt || '',
        searchKeywords: [classRow.name, classRow.arm]
      });
      pushIf(entity === 'all' || entity === 'classes', item);
    });

    (adminStore.results || []).forEach((result) => {
      const student = (adminStore.students || []).find((item) => item.id === result.studentId);
      const subject = (adminStore.subjects || []).find((item) => item.id === result.subjectId);
      const item = buildSearchItem({
        id: result.id,
        entity: 'results',
        title: student?.fullName || result.studentId,
        subtitle: `${subject?.name || result.subjectId} • ${classLabelFromId(result.classId)} • ${result.term || 'Term'}`,
        status: result.published ? 'published' : result.submittedAt ? 'submitted' : 'draft',
        classId: result.classId || '',
        classLabel: classLabelFromId(result.classId),
        institution: String(result.institution || student?.institution || ''),
        roleKey: 'student',
        roleLabel: 'Student',
        category: 'academics',
        categoryLabel: 'Academics',
        activityType: 'result-processing',
        activityTypeLabel: 'Result Processing',
        term: result.term || '',
        updatedAt: result.updatedAt || result.createdAt || '',
        createdAt: result.createdAt || '',
        searchKeywords: [subject?.name, result.subjectId]
      });
      pushIf(entity === 'all' || entity === 'results', item);
    });
  }

  if (role === 'admissions') {
    (adminStore.paymentRequests || [])
      .filter((entry) => entry.releasedTokenId)
      .forEach((entry) => {
        const student = (adminStore.students || []).find((item) => item.id === entry.studentId);
        const item = buildSearchItem({
          id: entry.releasedTokenId,
          entity: 'tokens',
          title: student?.fullName || entry.studentId,
          subtitle: `${entry.term || 'Term'} • ${entry.status || 'approved'} • token released`,
          status: entry.releasedTokenId ? 'released' : 'pending',
          classId: getSessionClassId(entry.studentId, entry.sessionId) || student?.classId || '',
          classLabel: classLabelFromId(getSessionClassId(entry.studentId, entry.sessionId) || student?.classId || ''),
          institution: String(student?.institution || ''),
          roleKey: 'student',
          roleLabel: 'Student',
          category: 'finance',
          categoryLabel: 'Finance',
          activityType: 'token-release',
          activityTypeLabel: 'Token Release',
          term: entry.term || '',
          updatedAt: entry.tokenReleasedAt || entry.reviewedAt || entry.createdAt || '',
          createdAt: entry.createdAt || '',
          searchKeywords: [student?.guardianName, student?.parentPortalEmail]
        });
        pushIf(entity === 'all' || entity === 'tokens', item);
      });
  }

  if (role === 'teacher' && teacher) {
    const scopedStudents = filterCountableActiveStudents(adminStore.students || []).filter((student) => {
      if (!teacherClassIds.has(student.classId)) return false;
      return !classIdFilter || student.classId === classIdFilter;
    });

    scopedStudents.forEach((student) => {
      const item = buildSearchItem({
        id: student.id,
        entity: 'students',
        title: student.fullName || student.id,
        subtitle: `${classLabelFromId(student.classId)} • ${student.institution || 'Institution'}`,
        status: String(student.accountStatus || 'active').toLowerCase(),
        classId: student.classId || '',
        classLabel: classLabelFromId(student.classId),
        institution: String(student.institution || ''),
        roleKey: 'student',
        roleLabel: 'Student',
        category: 'people',
        categoryLabel: 'People',
        activityType: 'student-record',
        activityTypeLabel: 'Student Record',
        term: '',
        updatedAt: student.updatedAt || student.createdAt || '',
        createdAt: student.createdAt || '',
        searchKeywords: [student.guardianName, student.guardianEmail, student.parentPortalEmail]
      });
      pushIf(entity === 'all' || entity === 'students', item);
    });

    scopedStudents
      .filter((student) => student.guardianName || student.guardianEmail || student.parentPortalEmail)
      .forEach((student) => {
        const item = buildSearchItem({
          id: `parent:${student.id}`,
          entity: 'parents',
          title: student.guardianName || student.parentPortalEmail || student.guardianEmail || `Parent of ${student.fullName || student.id}`,
          subtitle: `${student.fullName || student.id} • ${classLabelFromId(student.classId)}`,
          status: 'linked',
          classId: student.classId || '',
          classLabel: classLabelFromId(student.classId),
          institution: String(student.institution || ''),
          roleKey: 'parent',
          roleLabel: 'Parent',
          category: 'people',
          categoryLabel: 'People',
          activityType: 'guardian-contact',
          activityTypeLabel: 'Guardian Contact',
          term: '',
          updatedAt: student.updatedAt || student.createdAt || '',
          createdAt: student.createdAt || '',
          searchKeywords: [student.fullName, student.guardianEmail, student.parentPortalEmail, student.guardianPhone]
        });
        pushIf(entity === 'all' || entity === 'parents', item);
      });

    (adminStore.results || []).forEach((result) => {
      if (!teacherClassIds.has(result.classId) || !teacherSubjectIds.has(result.subjectId)) return;
      const student = (adminStore.students || []).find((item) => item.id === result.studentId);
      const subject = (adminStore.subjects || []).find((item) => item.id === result.subjectId);
      const item = buildSearchItem({
        id: result.id,
        entity: 'results',
        title: student?.fullName || result.studentId,
        subtitle: `${subject?.name || result.subjectId} • ${classLabelFromId(result.classId)} • ${result.term || 'Term'}`,
        status: result.published ? 'published' : result.submittedAt ? 'submitted' : 'draft',
        classId: result.classId || '',
        classLabel: classLabelFromId(result.classId),
        institution: String(result.institution || teacher.institution || ''),
        roleKey: 'student',
        roleLabel: 'Student',
        category: 'academics',
        categoryLabel: 'Academics',
        activityType: 'result-entry',
        activityTypeLabel: 'Result Entry',
        term: result.term || '',
        updatedAt: result.updatedAt || result.createdAt || '',
        createdAt: result.createdAt || '',
        searchKeywords: [subject?.name]
      });
      pushIf(entity === 'all' || entity === 'results', item);
    });

    [...teacherClassIds].forEach((assignedClassId) => {
      const item = buildSearchItem({
        id: assignedClassId,
        entity: 'classes',
        title: classLabelFromId(assignedClassId),
        subtitle: teacher.institution || 'Institution',
        status: 'assigned',
        classId: assignedClassId,
        classLabel: classLabelFromId(assignedClassId),
        institution: String(teacher.institution || ''),
        roleKey: 'teacher',
        roleLabel: 'Teacher',
        category: 'academics',
        categoryLabel: 'Academics',
        activityType: 'class-load',
        activityTypeLabel: 'Class Load',
        term: '',
        updatedAt: '',
        createdAt: '',
        searchKeywords: [teacher.fullName]
      });
      pushIf(entity === 'all' || entity === 'classes', item);
    });

    (adminStore.upcomingItems || [])
      .filter((item) => item.teacherId === teacher.id)
      .forEach((task) => {
        const item = buildSearchItem({
          id: task.id,
          entity: 'tasks',
          title: task.title || 'Upcoming item',
          subtitle: `${classLabelFromId(task.classId)}${task.dueDate ? ` • due ${task.dueDate}` : ''}`,
          status: 'open',
          classId: task.classId || '',
          classLabel: classLabelFromId(task.classId),
          institution: String(teacher.institution || ''),
          roleKey: 'teacher',
          roleLabel: 'Teacher',
          category: 'workflow',
          categoryLabel: 'Workflow',
          activityType: 'upcoming-task',
          activityTypeLabel: 'Upcoming Task',
          term: '',
          updatedAt: task.updatedAt || task.createdAt || task.dueDate || '',
          createdAt: task.createdAt || '',
          searchKeywords: [task.description, task.dueDate]
        });
        pushIf(entity === 'all' || entity === 'tasks', item);
      });
  }

  const sorted = sortSearchRows(items, sortBy, sortDir);
  return {
    entity,
    filters: {
      classId: classIdFilter,
      status: statusFilter,
      institution: institutionFilter,
      term: termFilter,
      category: categoryFilter,
      activityType: activityTypeFilter,
      role: roleFilter,
      datePreset
    },
    suggestions: buildSuggestionPool(sorted),
    availableFilters: buildAvailableFilters(sorted),
    ...paginateRows(sorted, page, pageSize)
  };
}

dashboardRouter.get('/me', requireAuth, (req, res) => {
  const scope = buildUserScope(req.user);
  return res.json({
    user: {
      ...req.user,
      scope
    },
    scope,
    profile: scope.profile || null,
    message: 'Authenticated user profile.'
  });
});

dashboardRouter.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  const activeStudents = filterCountableActiveStudents(adminStore.students);
  const modernEnrolled = filterCountableActiveStudents(activeStudents, 'ATTAUFEEQ Model Academy').length;
  const madrasaEnrolled = filterCountableActiveStudents(activeStudents, 'Madrastul ATTAUFEEQ').length;
  const memorizationEnrolled = filterCountableActiveStudents(activeStudents, 'Quran Memorization Academy').length;
  const modernAdmitted = countFullyAdmittedStudents(adminStore.students, 'ATTAUFEEQ Model Academy');
  const madrasaAdmitted = countFullyAdmittedStudents(adminStore.students, 'Madrastul ATTAUFEEQ');
  const memorizationAdmitted = countFullyAdmittedStudents(adminStore.students, 'Quran Memorization Academy');
  const tokenSalesMetrics = resolveTokenSalesMetrics();

  return res.json({
    dashboard: 'admin',
    metrics: {
      modernEnrolled,
      madrasaEnrolled,
      memorizationEnrolled,
      modernAdmitted,
      madrasaAdmitted,
      memorizationAdmitted,
      totalStudents: activeStudents.length,
      pendingReceiptUploads: (adminStore.paymentRequests || []).filter((item) => String(item.status || 'pending').toLowerCase() === 'pending').length,
      releasedTokens: (adminStore.paymentRequests || []).filter((item) => item.releasedTokenId).length,
      ...tokenSalesMetrics
    }
  });
});

dashboardRouter.get('/admissions', requireAuth, requireRole('admissions'), (_req, res) => {
  const tokenSalesMetrics = resolveTokenSalesMetrics();
  return res.json({
    dashboard: 'admissions',
    metrics: {
      modernPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'ATTAUFEEQ Model Academy'
      ).length,
      madrasaPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'Madrastul ATTAUFEEQ'
      ).length,
      memorizationPending: adminStore.admissions.filter(
        (item) => item.status === 'pending' && item.institution === 'Quran Memorization Academy'
      ).length,
      modernAdmitted: countFullyAdmittedStudents(adminStore.students, 'ATTAUFEEQ Model Academy'),
      madrasaAdmitted: countFullyAdmittedStudents(adminStore.students, 'Madrastul ATTAUFEEQ'),
      memorizationAdmitted: countFullyAdmittedStudents(adminStore.students, 'Quran Memorization Academy'),
      totalApprovedAdmissions: countFullyAdmittedStudents(adminStore.students),
      pendingReceiptUploads: (adminStore.paymentRequests || []).filter((item) => String(item.status || 'pending').toLowerCase() === 'pending').length,
      tokenReadyCount: (adminStore.paymentRequests || []).filter((item) => item.releasedTokenId).length,
      ...tokenSalesMetrics
    }
  });
});

dashboardRouter.get('/teacher', requireAuth, requireRole('teacher'), (req, res) => {
  const teacher = findTeacherByUser(req.user);
  const assignments = teacher
    ? adminStore.teacherAssignments.filter((item) => item.teacherId === teacher.id)
    : [];
  const institution = teacher?.institution || '';

  const classNames = [...new Set(assignments
    .map((assignment) => adminStore.classes.find((item) => item.id === assignment.classId))
    .filter(Boolean)
    .map((classItem) => `${classItem.name} ${classItem.arm}`))];

  const subjectNames = [...new Set(assignments
    .map((assignment) => adminStore.subjects.find((item) => item.id === assignment.subjectId))
    .filter(Boolean)
    .map((subject) => subject.name))];

  const classLoads = [...new Set(assignments.map((assignment) => assignment.classId))]
    .map((classId) => {
      const classItem = adminStore.classes.find((item) => item.id === classId);
      const studentCount = filterCountableActiveStudents(adminStore.students).filter((student) => student.classId === classId).length;
      const lead = findClassLead(classId);

      return {
        classId,
        classLabel: classItem ? `${classItem.name} ${classItem.arm}` : classId,
        studentCount,
        isLead: lead?.id === teacher?.id
      };
    })
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel));

  return res.json({
    dashboard: 'teacher',
    institution,
    assignedClasses: classNames,
    assignedSubjects: subjectNames,
    classLoads,
    totalStudents: classLoads.reduce((sum, item) => sum + item.studentCount, 0),
    pendingTasks:
      institution === 'ATTAUFEEQ Model Academy'
        ? ['Upload CA scores', 'Take attendance']
        : ['Track attendance', 'Review timetable']
  });
});

dashboardRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  const institution = student?.institution || '';
  const classLead = findClassLead(student?.classId || '');
  const sessionId = String(req.query.sessionId || '').trim() || getActiveSessionId();
  const sessionName = (adminStore.academicSessions || []).find((session) => session.id === sessionId)?.sessionName || sessionId;
  const allAttendance = student
    ? adminStore.attendanceRecords.filter((record) => record.studentId === student.id && matchesSession(record.sessionId, sessionId))
    : [];
  const attendanceTerm = resolveLatestTerm(allAttendance.map((record) => record.term));
  const attendance = attendanceTerm
    ? allAttendance.filter((record) => String(record.term || '').trim() === attendanceTerm)
    : allAttendance;
  const present = attendance.filter((record) => record.present).length;
  const attendanceRate = attendance.length ? `${Number(((present / attendance.length) * 100).toFixed(1))}%` : 'N/A';
  const upcomingItems = (adminStore.upcomingItems || [])
    .filter((item) => item.classId && item.classId === student?.classId)
    .filter((item) => isActiveUpcomingItem(item))
    .sort((a, b) => {
      const aDate = a.dueDate || a.createdAt;
      const bDate = b.dueDate || b.createdAt;
      return new Date(aDate) - new Date(bDate);
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      details: item.details || '',
      dueDate: item.dueDate || '',
      teacherName: item.teacherName || ''
    }));
  return res.json({
    dashboard: 'student',
    student,
    institution,
    classLead,
    sessionId,
    sessionName,
    attendance: attendanceRate,
    attendanceTerm: attendanceTerm || 'All Terms',
    upcomingItems
  });
});

dashboardRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  const classLead = findClassLead(child?.classId || '');
  const termQuery = String(req.query.term || '').trim();
  const sessionId = String(req.query.sessionId || '').trim() || getActiveSessionId();
  const sessionName = (adminStore.academicSessions || []).find((session) => session.id === sessionId)?.sessionName || sessionId;

  const plans = child
    ? adminStore.feePlans.filter((plan) => plan.classId === child.classId && matchesSession(plan.sessionId, sessionId))
    : [];
  const payments = child
    ? adminStore.payments.filter((payment) => payment.studentId === child.id && matchesSession(payment.sessionId, sessionId))
    : [];
  const allAttendance = child
    ? adminStore.attendanceRecords.filter((record) => record.studentId === child.id && matchesSession(record.sessionId, sessionId))
    : [];
  const activeTerm = termQuery || resolveLatestTerm([
    ...plans.map((plan) => plan.term),
    ...payments.map((payment) => payment.term),
    ...allAttendance.map((record) => record.term)
  ]);
  const scopedPlans = activeTerm ? plans.filter((plan) => String(plan.term || '').trim() === activeTerm) : plans;
  const scopedPayments = activeTerm ? payments.filter((payment) => String(payment.term || '').trim() === activeTerm) : payments;
  const planTotal = scopedPlans.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidTotal = scopedPayments.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
  const attendanceTerm = activeTerm || '';

  const attendance = attendanceTerm
    ? allAttendance.filter((record) => String(record.term || '').trim() === attendanceTerm)
    : allAttendance;

  const present = attendance.filter((record) => record.present).length;
  const attendanceRate = attendance.length ? `${Number(((present / attendance.length) * 100).toFixed(1))}%` : 'N/A';

  return res.json({
    dashboard: 'parent',
    child,
    children,
    classLead,
    sessionId,
    sessionName,
    attendance: attendanceRate,
    attendanceTerm: attendanceTerm || 'All Terms',
    paymentStatus: child ? (planTotal - paidTotal > 0 ? 'Outstanding Balance' : 'Paid Up') : 'No linked child',
    linkedChildrenCount: children.length
  });
});

dashboardRouter.get('/search', requireAuth, requireRole('admin', 'admissions', 'teacher'), (req, res) => {
  try {
    return res.json(buildDashboardSearchResults(req));
  } catch (error) {
    return res.status(500).json({ message: toPublicErrorMessage(error, 'We could not complete the dashboard search right now.') });
  }
});

export default dashboardRouter;
