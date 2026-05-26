const TECHNICAL_MESSAGE_PATTERNS = [
  /\b(sql|query|relation|column|constraint|postgres|database|redis|jwt|token|typeorm|sequelize)\b/i,
  /\b(typeerror|referenceerror|syntaxerror|rangeerror|aggregateerror)\b/i,
  /\b(enoent|econnrefused|etimedout|eacces|eperm|ecancelled)\b/i,
  /\b(undefined|null)\b/i,
  /\/home\/|[a-z]:\\/i,
  /stack trace|exception|internal server error/i,
  /duplicate key|violates|foreign key|not-null/i
];

function normalizeMessage(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function looksTechnicalMessage(message = '') {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  if (normalized.length > 220) return true;
  return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function toPublicErrorMessage(error, fallback = 'We could not complete that request right now.', status = 500) {
  const preferred = normalizeMessage(error?.publicMessage || error?.message || '');
  if (preferred && !looksTechnicalMessage(preferred)) {
    return preferred;
  }

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform that action.';
  if (status === 404) return 'The requested record could not be found.';
  if (status >= 500) return 'Something went wrong on our side. Please try again shortly.';
  return fallback;
}

export function toPublicBulkError(message, fallback = 'This row could not be processed.') {
  const normalized = normalizeMessage(message);
  if (normalized && !looksTechnicalMessage(normalized)) {
    return normalized;
  }
  return fallback;
}
