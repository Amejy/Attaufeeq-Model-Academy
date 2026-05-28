function getRequestOrigin(req) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req?.secure ? 'https' : 'http') || 'https';
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req?.headers?.host || '').trim();
  if (!host) return '';
  return `${protocol}://${host}`;
}

export function resolveAbsoluteAssetUrl(value, req = null) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  if (normalized.startsWith('data:') || normalized.startsWith('blob:') || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('//')) {
    return `https:${normalized}`;
  }

  if (!normalized.startsWith('/')) {
    return `/${normalized.replace(/^\/+/, '')}`;
  }

  if (!req) return normalized;
  const origin = getRequestOrigin(req);
  if (!origin) return normalized;
  return `${origin}${normalized}`;
}
