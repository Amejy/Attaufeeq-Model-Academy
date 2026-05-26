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
    {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn
    }
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
    {
      algorithm: 'HS256',
      expiresIn: env.refreshExpiresIn
    }
  );
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.refreshSecret, { algorithms: ['HS256'] });
  if (payload?.type !== 'refresh') {
    throw new Error('Invalid refresh token.');
  }
  return payload;
}
