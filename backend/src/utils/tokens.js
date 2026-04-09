import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function createRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      type: 'refresh'
    },
    env.refreshSecret,
    { expiresIn: env.refreshExpiresIn }
  );
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.refreshSecret);
  if (payload?.type !== 'refresh') {
    throw new Error('Invalid refresh token.');
  }
  return payload;
}
