import { addActivityLog } from '../data/adminStore.js';

function resolveIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export function auditRequests(req, res, next) {
  const shouldLog =
    req.method === 'POST' ||
    req.method === 'PUT' ||
    req.method === 'PATCH' ||
    req.method === 'DELETE';

  if (!shouldLog) return next();

  const startedAt = Date.now();
  res.on('finish', () => {
    addActivityLog({
      action: `${req.method.toLowerCase()} ${req.path}`,
      method: req.method,
      path: req.originalUrl || req.path,
      actorRole: req.user?.role || 'anonymous',
      actorEmail: req.user?.email || 'anonymous',
      statusCode: res.statusCode,
      ip: resolveIp(req),
      durationMs: Date.now() - startedAt
    });
  });

  return next();
}
