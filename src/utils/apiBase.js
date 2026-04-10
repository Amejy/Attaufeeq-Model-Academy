const FALLBACK_PROD_API = 'https://attaufeeq-model-academy.onrender.com/api';

export function resolveApiBaseUrl() {
  const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envBase) return envBase;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalhost) {
      return FALLBACK_PROD_API;
    }
  }

  return '/api';
}
