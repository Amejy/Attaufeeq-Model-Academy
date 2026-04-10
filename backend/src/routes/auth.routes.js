import { Router } from 'express';
import crypto from 'node:crypto';
import { addActivityLog, makeId } from '../data/adminStore.js';
import { requireAuth } from '../middleware/auth.js';
import { findUserByEmail, findUserById, updateUserPassword } from '../repositories/userRepository.js';
import {
  deleteExpiredPasswordResetRequests,
  deletePasswordResetRequest,
  findPasswordResetRequest,
  upsertPasswordResetRequest
} from '../repositories/passwordResetRepository.js';
import {
  createRefreshSession,
  deleteRefreshSessionByToken,
  deleteRefreshSessionsByUserId,
  deleteExpiredRefreshSessions,
  findRefreshSessionByToken
} from '../repositories/sessionRepository.js';
import { env } from '../config/env.js';
import { queuePasswordResetCodeDelivery } from '../services/credentialDeliveryService.js';
import { resolvePortalAccessState } from '../utils/authAccessPolicy.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

const authRouter = Router();
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  return header
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separatorIndex = item.indexOf('=');
      if (separatorIndex === -1) return cookies;
      const key = item.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(item.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function buildRefreshCookieOptions(expiresAt) {
  const options = {
    httpOnly: true,
    sameSite: env.authCookieSameSite,
    secure: env.authCookieSecure,
    path: env.authCookiePath
  };

  if (env.authCookieDomain) {
    options.domain = env.authCookieDomain;
  }
  if (expiresAt) {
    options.expires = expiresAt;
  }

  return options;
}

function setRefreshCookie(res, refreshToken, expiresAt) {
  res.cookie(env.authCookieName, refreshToken, buildRefreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res) {
  res.clearCookie(env.authCookieName, buildRefreshCookieOptions());
}

function getSessionUserId(session) {
  return session?.userId || session?.user_id || '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function validatePasswordStrength(password) {
  const normalized = String(password || '');
  return normalized.length >= 10;
}

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function issueSession(user) {
  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  const payload = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(payload.exp * 1000);

  await createRefreshSession({
    id: makeId('sess'),
    userId: user.id,
    token: refreshToken,
    expiresAt: expiresAt.toISOString()
  });

  return { token, refreshToken, expiresAt };
}

function serializeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    avatarUrl: user.avatarUrl || ''
  };
}

function resolveSerializedPortalAccess(user) {
  return resolvePortalAccessState(serializeUser(user));
}

authRouter.post('/signup', async (_req, res) => {
  return res.status(410).json({
    message: 'Parent accounts are created during admission registration. Use the issued parent login or contact admin.'
  });
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }

    await deleteExpiredPasswordResetRequests();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.json({ message: 'If the account exists, a reset code has been sent.' });
    }

    const code = generateResetCode();
    const codeHash = hashResetCode(code);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();

    await upsertPasswordResetRequest({
      email: normalizedEmail,
      userId: user.id,
      codeHash,
      requestIp: ip,
      expiresAt,
    });

    const delivery = await queuePasswordResetCodeDelivery({
      recipientName: user.fullName,
      recipientEmail: user.email,
      resetCode: code,
      institution: user.institution || ''
    }, { forceInlineDelivery: true });

    addActivityLog({
      action: 'auth.password.reset.requested',
      method: 'POST',
      path: '/api/auth/forgot-password',
      actorRole: user.role,
      actorEmail: user.email,
      statusCode: 200,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    return res.json({
      message: 'If the account exists, a reset code has been sent.',
      resetCode: env.isDevelopment ? code : undefined,
      deliveryStatus: delivery?.status || '',
      expiresAt
    });
  } catch (error) {
    console.error('Forgot password request failed:', error.message || error);
    return res.status(500).json({ message: 'Unable to process reset request.' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword, confirmPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'email, code, newPassword, and confirmPassword are required.' });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirmation do not match.' });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 10 characters long.' });
    }

    await deleteExpiredPasswordResetRequests();
    const request = await findPasswordResetRequest(normalizedEmail, hashResetCode(normalizedCode));

    if (!request) {
      return res.status(400).json({ message: 'Reset code is invalid or has expired.' });
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    const updatedUser = await updateUserPassword(user.id, {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false
    });

    await deleteRefreshSessionsByUserId(user.id);
    await deletePasswordResetRequest(normalizedEmail);

    addActivityLog({
      action: 'auth.password.reset.completed',
      method: 'POST',
      path: '/api/auth/reset-password',
      actorRole: user.role,
      actorEmail: user.email,
      statusCode: 200,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    return res.json({
      message: 'Password reset successfully. You can log in now.',
      user: serializeUser(updatedUser || { ...user, mustChangePassword: false })
    });
  } catch (error) {
    console.error('Reset password failed:', error.message || error);
    return res.status(500).json({ message: 'Unable to reset password.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    await deleteExpiredRefreshSessions();

    const user = await findUserByEmail(normalizedEmail);
    const validUser = user && await verifyPassword(password, user.passwordHash);

    if (!validUser) {
      addActivityLog({
        action: 'auth.login.failed',
        method: 'POST',
        path: '/api/auth/login',
        actorRole: 'anonymous',
        actorEmail: normalizedEmail || 'unknown',
        statusCode: 401,
        ip
      });
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const access = resolveSerializedPortalAccess(user);
    if (!access.allowed) {
      addActivityLog({
        action: 'auth.login.denied',
        method: 'POST',
        path: '/api/auth/login',
        actorRole: user.role,
        actorEmail: user.email,
        statusCode: 403,
        ip
      });
      return res.status(403).json({ message: access.message || 'Portal access is not available for this account.' });
    }

    const { token, refreshToken, expiresAt } = await issueSession(user);
    setRefreshCookie(res, refreshToken, expiresAt);

    addActivityLog({
      action: 'auth.login.success',
      method: 'POST',
      path: '/api/auth/login',
      actorRole: user.role,
      actorEmail: user.email,
      statusCode: 200,
      ip
    });

    return res.json({
      token,
      user: serializeUser(user)
    });
  } catch {
    return res.status(500).json({ message: 'Login failed.' });
  }
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies[env.authCookieName] || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh session is missing.' });
    }

    const payload = verifyRefreshToken(refreshToken);
    const session = await findRefreshSessionByToken(refreshToken);

    if (!session || getSessionUserId(session) !== payload.sub) {
      return res.status(401).json({ message: 'Refresh session not found or expired.' });
    }

    // Rotate refresh token on each refresh.
    await deleteRefreshSessionByToken(refreshToken);

    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    const access = resolveSerializedPortalAccess(user);
    if (!access.allowed) {
      clearRefreshCookie(res);
      await deleteRefreshSessionsByUserId(user.id);
      return res.status(403).json({ message: access.message || 'Portal access is not available for this account.' });
    }

    const next = await issueSession(user);
    setRefreshCookie(res, next.refreshToken, next.expiresAt);

    addActivityLog({
      action: 'auth.refresh.success',
      method: 'POST',
      path: '/api/auth/refresh',
      actorRole: user.role,
      actorEmail: user.email,
      statusCode: 200,
      ip
    });

    return res.json({
      token: next.token,
      user: serializeUser(user)
    });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Refresh token expired or invalid.' });
  }
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    const normalizedCurrent = String(currentPassword ?? '');
    const normalizedNew = String(newPassword ?? '');
    const normalizedConfirm = String(confirmPassword ?? '');

    if (!normalizedCurrent || !normalizedNew || !normalizedConfirm) {
      return res.status(400).json({ message: 'currentPassword, newPassword, and confirmPassword are required.' });
    }

    if (normalizedNew !== normalizedConfirm) {
      return res.status(400).json({ message: 'New password and confirmation do not match.' });
    }

    if (normalizedNew === normalizedCurrent) {
      return res.status(400).json({ message: 'New password must be different from the current password.' });
    }

    if (!validatePasswordStrength(normalizedNew)) {
      return res.status(400).json({ message: 'New password must be at least 10 characters long.' });
    }

    const user = await findUserById(req.user?.sub);
    if (!user || !user.passwordHash || !await verifyPassword(normalizedCurrent, user.passwordHash)) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    if (await verifyPassword(normalizedNew, user.passwordHash)) {
      return res.status(400).json({ message: 'Choose a new password different from the temporary password.' });
    }

    const updatedUser = await updateUserPassword(user.id, {
      passwordHash: await hashPassword(normalizedNew),
      mustChangePassword: false
    });

    await deleteRefreshSessionsByUserId(user.id);
    const nextSessionUser = updatedUser || { ...user, mustChangePassword: false };
    const next = await issueSession(nextSessionUser);
    setRefreshCookie(res, next.refreshToken, next.expiresAt);

    addActivityLog({
      action: 'auth.password.changed',
      method: 'POST',
      path: '/api/auth/change-password',
      actorRole: updatedUser?.role || user.role,
      actorEmail: updatedUser?.email || user.email,
      statusCode: 200,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });

    return res.json({
      message: 'Password changed successfully.',
      token: next.token,
      user: serializeUser(nextSessionUser)
    });
  } catch {
    return res.status(500).json({ message: 'Password change failed.' });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies[env.authCookieName] || '';
    if (refreshToken) {
      await deleteRefreshSessionByToken(refreshToken);
    }
    clearRefreshCookie(res);
    return res.json({ message: 'Logged out successfully.' });
  } catch {
    return res.status(500).json({ message: 'Logout failed.' });
  }
});

export default authRouter;
