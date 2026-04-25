const STUDENT_ID_PATTERN = /^AMA-\d{4}-\d{4}$/i;

function normalizeInstitution(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'ATTAUFEEQ Model Academy';
  if (normalized.includes('madrastul')) return 'Madrastul ATTAUFEEQ';
  if (normalized.includes('quran') && normalized.includes('memor')) return 'Quran Memorization Academy';
  return 'ATTAUFEEQ Model Academy';
}

function safeText(value) {
  return String(value || '').trim();
}

function isFinalStudentId(value = '') {
  return STUDENT_ID_PATTERN.test(safeText(value));
}

function extractYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function normalizeSuffix(value) {
  const clean = safeText(value).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!clean) return '0000';
  const numeric = clean.replace(/\D/g, '');
  return (numeric || clean).slice(-4).padStart(4, '0');
}

export function buildStudentCode(student, overrides = {}) {
  const payload = typeof student === 'object' && student !== null ? student : { id: student };
  const rawId =
    payload.id || payload.studentId || payload.student_id || payload.portalId || payload.portal_id;
  const normalizedId = safeText(rawId).toUpperCase();
  if (isFinalStudentId(normalizedId)) {
    return normalizedId;
  }

  const institution = safeText(overrides.institution || payload.institution) || 'ATTAUFEEQ Model Academy';
  normalizeInstitution(institution);
  const year =
    extractYear(overrides.createdAt || payload.createdAt || payload.created_at || payload.enrolledAt) ||
    new Date().getFullYear();

  return `AMA-${year}-${normalizeSuffix(rawId)}`;
}

export function resolveStudentByIdentifier(students = [], identifier = '') {
  const normalized = safeText(identifier).toUpperCase();
  if (!normalized) return null;

  const direct = students.find((student) => safeText(student.id).toUpperCase() === normalized);
  if (direct) return direct;

  return (
    students.find((student) => buildStudentCode(student).toUpperCase() === normalized) ||
    null
  );
}
