const TECHNICAL_MESSAGE_PATTERNS = [
  /\b(sql|query|relation|column|constraint|postgres|database|redis|jwt)\b/i,
  /\b(typeerror|referenceerror|syntaxerror|rangeerror|aggregateerror)\b/i,
  /\b(enoent|econnrefused|etimedout|eacces|eperm)\b/i,
  /\b(undefined|null)\b/i,
  /\/home\/|[a-z]:\\/i,
  /stack trace|exception/i,
  /duplicate key|violates|foreign key|not-null/i
];

function normalizeMessage(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function sanitizeUserMessage(message, fallback = 'We could not complete that request right now.') {
  const normalized = normalizeMessage(message);
  if (!normalized) return fallback;
  if (normalized.length > 220) return fallback;
  if (TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return fallback;
  }
  return normalized;
}

export function getRequestErrorMessage({ status = 0, message = '', fallback } = {}) {
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission to perform that action.';
  }
  if (status === 404) {
    return 'The requested information could not be found.';
  }
  if (status >= 500) {
    return fallback || 'Something went wrong on our side. Please try again shortly.';
  }
  return sanitizeUserMessage(message, fallback);
}
