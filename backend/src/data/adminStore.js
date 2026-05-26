import crypto from 'node:crypto';
import { loadAppState, getAppStateMetadata, saveAppState } from '../repositories/appStateRepository.js';
import { persistActivityLog } from '../repositories/activityLogRepository.js';
import { normalizeAdmissionPeriod } from '../utils/admissionPeriod.js';
import { normalizeAcademicCalendarEntry } from '../utils/academicCalendar.js';
import { logger } from '../utils/logger.js';
import { normalizeReportOverride, normalizeReportSettings } from '../utils/reportConfig.js';

const APP_STATE_KEY = 'admin_store';
const SAVE_DEBOUNCE_MS = 750;
const REMOTE_REFRESH_MS = 5_000;

const initialStore = {
  teachers: [],
  students: [],
  classes: [],
  subjects: [],
  teacherAssignments: [],
  academicSessions: [],
  studentEnrollments: [],
  admissionPeriod: {
    enabled: false,
    startDate: '',
    endDate: '',
    programs: {
      modern: { enabled: false, startDate: '', endDate: '' },
      madrasa: { enabled: false, startDate: '', endDate: '' },
      memorization: { enabled: false, startDate: '', endDate: '' }
    }
  },
  admissions: [],
  admissionArchive: [],
  newsEvents: [],
  upcomingItems: [],
  resultsAccess: [],
  results: [],
  reportRemarks: [],
  feePlans: [],
  payments: [],
  paymentRequests: [],
  tokenSalesControls: [],
  notifications: [],
  madrasaRecords: [],
  messageThreads: [],
  messages: [],
  activityLogs: [],
  reportSettings: {
    headName: '',
    headTitle: 'Head Teacher',
    signatureImage: '',
    parentAcknowledgementText: 'I have received and read this report.',
    footerNote: ''
  },
  libraryBooks: [],
  libraryIssues: [],
  timetableEntries: [],
  attendanceRecords: [],
  promotionBatches: [],
  promotionRecommendations: [],
  termClosures: [],
  academicCalendar: []
};

const adminStore = structuredClone(initialStore);
let initialized = false;
let saveTimer = null;
let refreshTimer = null;
let lastPersistedSnapshot = JSON.stringify(adminStore);
let lastPersistedAt = '';
let isFlushing = false;
let flushPromise = Promise.resolve();

function normalizeStore(store) {
  const normalized = { ...structuredClone(initialStore), ...(store || {}) };
  const activeSessionId =
    (normalized.academicSessions || []).find((session) => session?.isActive)?.id ||
    normalized.academicSessions?.[0]?.id ||
    '';
  normalized.admissionPeriod = normalizeAdmissionPeriod(normalized.admissionPeriod);
  normalized.resultsAccess = Array.isArray(normalized.resultsAccess) ? normalized.resultsAccess : [];
  normalized.reportRemarks = Array.isArray(normalized.reportRemarks)
      ? normalized.reportRemarks.map((remark) => ({
        id: remark.id || '',
        studentId: remark.studentId || '',
        classId: remark.classId || '',
        sessionId: remark.sessionId || activeSessionId,
        term: remark.term || 'First Term',
        strengths: remark.strengths || '',
        weaknesses: remark.weaknesses || '',
        classTeacherRemark: remark.classTeacherRemark || '',
        headTeacherRemark: remark.headTeacherRemark || '',
        override: normalizeReportOverride(remark.override || {}),
        updatedAt: remark.updatedAt || ''
      }))
    : [];
  normalized.reportSettings = normalizeReportSettings(normalized.reportSettings);
  normalized.promotionBatches = Array.isArray(normalized.promotionBatches) ? normalized.promotionBatches : [];
  normalized.promotionRecommendations = Array.isArray(normalized.promotionRecommendations) ? normalized.promotionRecommendations : [];
  normalized.termClosures = Array.isArray(normalized.termClosures) ? normalized.termClosures : [];
  normalized.academicCalendar = Array.isArray(normalized.academicCalendar)
    ? normalized.academicCalendar.map((entry) => normalizeAcademicCalendarEntry(entry))
    : [];

  normalized.admissions = (normalized.admissions || []).map((admission) => ({
    ...admission,
    trackingCode: admission.trackingCode || crypto.randomUUID()
  }));

  normalized.libraryBooks = (normalized.libraryBooks || []).map((book) => ({
    ...book,
    classId: book.classId || ''
  }));

  normalized.feePlans = (normalized.feePlans || []).map((plan) => ({
    ...plan,
    sessionId: plan.sessionId || activeSessionId,
    published: plan.published !== false,
    publishedAt: plan.publishedAt || '',
    publishedByUserId: plan.publishedByUserId || '',
    publishedByEmail: plan.publishedByEmail || ''
  }));

  normalized.payments = (normalized.payments || []).map((payment) => ({
    ...payment,
    sessionId: payment.sessionId || activeSessionId,
    paymentType: payment.paymentType || 'school_fee'
  }));

  normalized.paymentRequests = (normalized.paymentRequests || []).map((request) => ({
    ...request,
    sessionId: request.sessionId || activeSessionId,
    status: request.status || 'pending',
    requestType: request.requestType || 'scratch_card'
  }));

  normalized.tokenSalesControls = Array.isArray(normalized.tokenSalesControls)
    ? normalized.tokenSalesControls.map((control) => ({
        sessionId: control?.sessionId || activeSessionId,
        term: control?.term || 'First Term',
        enabled: Boolean(control?.enabled),
        enabledAt: control?.enabledAt || '',
        enabledByUserId: control?.enabledByUserId || '',
        enabledByEmail: control?.enabledByEmail || ''
      }))
    : [];

  normalized.teachers = (normalized.teachers || []).map((teacher) => ({
    ...teacher,
    signatureImage: teacher.signatureImage || ''
  }));

  normalized.attendanceRecords = (normalized.attendanceRecords || []).map((record) => ({
    ...record,
    sessionId: record.sessionId || activeSessionId,
    term: record.term || 'First Term',
    status: record.status || (record.present ? 'present' : 'absent'),
    present: record.present !== undefined ? Boolean(record.present) : record.status !== 'absent',
    late: Boolean(record.late || record.status === 'late'),
    behavior: {
      discipline: record.behavior?.discipline || '',
      responsibility: record.behavior?.responsibility || '',
      cooperation: record.behavior?.cooperation || '',
      respect: record.behavior?.respect || '',
      initiative: record.behavior?.initiative || ''
    }
  }));

  normalized.madrasaRecords = (normalized.madrasaRecords || []).map((record) => ({
    ...record,
    sessionId: record.sessionId || activeSessionId,
    term: record.term || 'First Term'
  }));

  return normalized;
}

function replaceStoreContents(nextStore) {
  const normalized = normalizeStore(nextStore);

  Object.keys(adminStore).forEach((key) => {
    if (!(key in normalized)) {
      delete adminStore[key];
    }
  });

  Object.entries(normalized).forEach(([key, value]) => {
    adminStore[key] = value;
  });
}

function currentSnapshot() {
  return JSON.stringify(adminStore);
}

async function persistSnapshot(force = false) {
  if (!initialized) return;
  if (isFlushing) {
    await flushPromise;
    if (!force) return;
  }

  const snapshot = currentSnapshot();
  if (!force && snapshot === lastPersistedSnapshot) return;

  isFlushing = true;
  flushPromise = (async () => {
    const row = await saveAppState(APP_STATE_KEY, normalizeStore(adminStore));
    lastPersistedSnapshot = currentSnapshot();
    lastPersistedAt = row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString();
  })();

  try {
    await flushPromise;
  } finally {
    isFlushing = false;
  }
}

function schedulePersist() {
  if (!initialized) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistSnapshot().catch((error) => {
      logger.error('Failed to persist admin store.', { error });
    });
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

async function refreshFromDatabase() {
  if (!initialized || isFlushing) return;
  if (currentSnapshot() !== lastPersistedSnapshot) return;

  const metadata = await getAppStateMetadata(APP_STATE_KEY);
  const updatedAt = metadata?.updated_at ? new Date(metadata.updated_at).toISOString() : '';
  if (!updatedAt || updatedAt === lastPersistedAt) return;

  const row = await loadAppState(APP_STATE_KEY);
  if (!row?.payload) return;

  replaceStoreContents(row.payload);
  lastPersistedSnapshot = currentSnapshot();
  lastPersistedAt = updatedAt;
}

function startRefreshLoop() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const work = currentSnapshot() !== lastPersistedSnapshot
      ? persistSnapshot()
      : refreshFromDatabase();

    void work.catch((error) => {
      logger.error('Failed to refresh admin store.', { error });
    });
  }, REMOTE_REFRESH_MS);
  refreshTimer.unref?.();
}

export async function initializeAdminStore() {
  const row = await loadAppState(APP_STATE_KEY);
  if (row?.payload) {
    replaceStoreContents(row.payload);
    lastPersistedSnapshot = currentSnapshot();
    lastPersistedAt = row.updated_at ? new Date(row.updated_at).toISOString() : '';
  } else {
    replaceStoreContents(initialStore);
    const saved = await saveAppState(APP_STATE_KEY, normalizeStore(adminStore));
    lastPersistedSnapshot = currentSnapshot();
    lastPersistedAt = saved?.updated_at ? new Date(saved.updated_at).toISOString() : new Date().toISOString();
  }

  initialized = true;
  startRefreshLoop();
}

export async function saveStoreToDatabase({ force = false } = {}) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await persistSnapshot(force);
}

export async function saveStoreToDatabaseWithExecutor({ force = false, executor } = {}) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const snapshot = currentSnapshot();
  if (!force && snapshot === lastPersistedSnapshot) return;

  const row = await saveAppState(APP_STATE_KEY, normalizeStore(adminStore), { executor });
  lastPersistedSnapshot = currentSnapshot();
  lastPersistedAt = row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString();
}

export async function reloadAdminStoreFromDatabase({ executor, force = false } = {}) {
  if (!initialized && !force) return;
  const row = await loadAppState(APP_STATE_KEY, { executor });
  if (!row?.payload) return;

  replaceStoreContents(row.payload);
  lastPersistedSnapshot = currentSnapshot();
  lastPersistedAt = row.updated_at ? new Date(row.updated_at).toISOString() : lastPersistedAt;
}

export async function shutdownAdminStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  await persistSnapshot(true);
}

export function markAdminStoreDirty() {
  schedulePersist();
}

export function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function addActivityLog(entry) {
  const log = {
    id: makeId('log'),
    action: entry.action || 'request',
    method: entry.method || 'GET',
    path: entry.path || '/',
    actorRole: entry.actorRole || 'anonymous',
    actorEmail: entry.actorEmail || 'anonymous',
    statusCode: Number(entry.statusCode || 0),
    ip: entry.ip || 'unknown',
    timestamp: entry.timestamp || new Date().toISOString(),
    details: entry.details && typeof entry.details === 'object' ? entry.details : {}
  };

  void persistActivityLog(log).catch(() => {
    // Logging failures must not break the request path.
  });

  return log;
}

export { adminStore };
