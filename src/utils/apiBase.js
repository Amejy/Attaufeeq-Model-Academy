export function resolveApiBaseUrl() {
  const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envBase) return envBase;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalhost) {
      console.error('Missing VITE_API_BASE_URL for production environment.');
      return '';
    }
  }

  return '/api';
}
