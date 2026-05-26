import { resolveApiBaseUrl } from './apiBase.js';

const API_BASE_URL = resolveApiBaseUrl();

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function toCanonicalUploadPath(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const uploadMatch = normalized.match(
    /(?:https?:\/\/[^/]+)?\/?(?:api\/)?(?:api\/)?uploads\/(public|private)\/([a-z0-9-]+)/i
  );

  if (!uploadMatch) return '';

  return `/api/uploads/${String(uploadMatch[1] || '').toLowerCase()}/${uploadMatch[2]}`;
}

function resolveAgainstApiBase(pathname) {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL);
  if (!normalizedBase || normalizedBase === '/api') {
    return pathname;
  }
  return /^https?:\/\//i.test(normalizedBase)
    ? `${normalizedBase}${pathname}`
    : `${normalizedBase}${pathname}`;
}

export function resolveAssetUrl(src) {
  const value = String(src || '').trim();
  if (!value) return '';

  if (value.startsWith('//')) {
    return `https:${value}`;
  }

  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  const canonicalUploadPath = toCanonicalUploadPath(value);
  if (canonicalUploadPath) {
    return resolveAgainstApiBase(canonicalUploadPath);
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return value.startsWith('/') ? value : `/${value.replace(/^\/+/, '')}`;
}

export function isCanonicalUploadPath(value) {
  return Boolean(toCanonicalUploadPath(value));
}
