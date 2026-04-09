import crypto from 'node:crypto';
import { loadAppState, getAppStateMetadata, saveAppState } from '../repositories/appStateRepository.js';
import { persistActivityLog } from '../repositories/activityLogRepository.js';
import { normalizeAdmissionPeriod } from '../utils/admissionPeriod.js';

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
  feePlans: [],
  payments: [],
  notifications: [],
  madrasaRecords: [],
  messageThreads: [],
  messages: [],
  activityLogs: [],
  libraryBooks: [],
  libraryIssues: [],
  timetableEntries: [],
  attendanceRecords: [],
  promotionBatches: [],
  promotionRecommendations: [],
  termClosures: []
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
  normalized.promotionBatches = Array.isArray(normalized.promotionBatches) ? normalized.promotionBatches : [];
  normalized.promotionRecommendations = Array.isArray(normalized.promotionRecommendations) ? normalized.promotionRecommendations : [];
  normalized.termClosures = Array.isArray(normalized.termClosures) ? normalized.termClosures : [];

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
    sessionId: plan.sessionId || activeSessionId
  }));

  normalized.payments = (normalized.payments || []).map((payment) => ({
    ...payment,
    sessionId: payment.sessionId || activeSessionId
  }));

  normalized.attendanceRecords = (normalized.attendanceRecords || []).map((record) => ({
    ...record,
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
      console.error('Failed to persist admin store:', error.message || error);
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
      console.error('Failed to refresh admin store:', error.message || error);
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
