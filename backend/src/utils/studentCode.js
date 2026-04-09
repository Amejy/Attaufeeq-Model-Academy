const INSTITUTION_CODES = {
  'ATTAUFEEQ Model Academy': 'AMA',
  'Madrastul ATTAUFEEQ': 'MAD',
  'Quran Memorization Academy': 'QMA'
};

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

function extractYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function normalizeSuffix(value) {
  const clean = safeText(value).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!clean) return 'XXXXXX';
  return clean.slice(-6).padStart(6, '0');
}

export function buildStudentCode(student, overrides = {}) {
  const payload = typeof student === 'object' && student !== null ? student : { id: student };
  const institution = safeText(overrides.institution || payload.institution) || 'ATTAUFEEQ Model Academy';
  const normalizedInstitution = normalizeInstitution(institution);
  const prefix = INSTITUTION_CODES[normalizedInstitution] || 'AMA';
  const year =
    extractYear(overrides.createdAt || payload.createdAt || payload.created_at || payload.enrolledAt) ||
    new Date().getFullYear();
  const id =
    payload.id || payload.studentId || payload.student_id || payload.portalId || payload.portal_id;

  return `${prefix}-${year}-${normalizeSuffix(id)}`;
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
