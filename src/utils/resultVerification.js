function normalizeValue(value) {
  return String(value || '').trim();
}

export function buildResultCheckerUrl({
  studentIdentifier = '',
  term = '',
  sessionId = '',
  token = '',
  origin = ''
} = {}) {
  const params = new URLSearchParams();
  const normalizedStudentIdentifier = normalizeValue(studentIdentifier);
  const normalizedTerm = normalizeValue(term);
  const normalizedSessionId = normalizeValue(sessionId);
  const normalizedToken = normalizeValue(token);

  if (normalizedStudentIdentifier) params.set('studentIdentifier', normalizedStudentIdentifier);
  if (normalizedTerm) params.set('term', normalizedTerm);
  if (normalizedSessionId) params.set('sessionId', normalizedSessionId);
  if (normalizedToken) params.set('token', normalizedToken);

  const basePath = `/result-checker${params.toString() ? `?${params.toString()}` : ''}`;
  if (!normalizeValue(origin)) return basePath;
  return `${String(origin).replace(/\/+$/, '')}${basePath}`;
}

export function buildVerificationCode({
  studentIdentifier = '',
  term = '',
  sessionId = ''
} = {}) {
  const seed = `${normalizeValue(studentIdentifier)}|${normalizeValue(term)}|${normalizeValue(sessionId)}`.toUpperCase();
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return `VR-${hash.toString(36).toUpperCase().padStart(8, '0').slice(0, 8)}`;
}

export function buildQrCodeUrl(value, size = 180) {
  const normalizedValue = normalizeValue(value);
  if (!normalizedValue) return '';
  const normalizedSize = Number.isFinite(Number(size)) ? Math.max(120, Math.min(320, Number(size))) : 180;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${normalizedSize}x${normalizedSize}&margin=0&data=${encodeURIComponent(normalizedValue)}`;
}
