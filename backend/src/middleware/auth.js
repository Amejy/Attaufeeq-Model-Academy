import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findUserById } from '../repositories/userRepository.js';
import { resolvePortalAccessState } from '../utils/authAccessPolicy.js';

async function resolveAuthenticatedUser(req, strict) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    if (strict) {
      return { status: 401, message: 'Missing or invalid authorization token.' };
    }
    return { user: null };
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await findUserById(payload.sub);
    if (!user) {
      return { status: 401, message: 'User not found or inactive.' };
    }

    const resolvedUser = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      mustChangePassword: Boolean(user.mustChangePassword),
      avatarUrl: user.avatarUrl || ''
    };
    const access = resolvePortalAccessState(resolvedUser);
    if (!access.allowed) {
      return { status: 403, message: access.message || 'Portal access is not available for this account.' };
    }

    return {
      user: resolvedUser
    };
  } catch {
    return { status: 401, message: 'Token expired or invalid.' };
  }
}

export async function requireAuth(req, res, next) {
  try {
    const resolved = await resolveAuthenticatedUser(req, true);
    if (!resolved.user) {
      return res.status(resolved.status || 401).json({ message: resolved.message || 'Unauthorized.' });
    }
    req.user = resolved.user;
    return next();
  } catch {
    return res.status(503).json({ message: 'Authentication service unavailable.' });
  }
}

export async function attachUserIfPresent(req, _res, next) {
  try {
    const resolved = await resolveAuthenticatedUser(req, false);
    if (resolved.user) {
      req.user = resolved.user;
    }
  } catch {
    // Ignore invalid token here; protected routes still enforce requireAuth.
  }

  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions.' });
    }

    return next();
  };
}
