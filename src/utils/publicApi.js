import { resolveApiBaseUrl } from './apiBase';

const API_BASE_URL = resolveApiBaseUrl();

async function parseJsonSafely(response) {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

export async function apiFetch(path, options = {}) {
  const { headers, credentials = 'same-origin', ...rest } = options;
  return fetch(path.startsWith('http') ? path : `${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials
  });
}

export async function apiJson(path, options = {}) {
  const requestOptions = { ...options };

  if (
    requestOptions.body &&
    !(requestOptions.body instanceof FormData) &&
    typeof requestOptions.body !== 'string'
  ) {
    const nextHeaders = new Headers(requestOptions.headers || {});
    if (!nextHeaders.has('Content-Type')) {
      nextHeaders.set('Content-Type', 'application/json');
    }
    requestOptions.headers = nextHeaders;
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await apiFetch(path, requestOptions);
  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}
