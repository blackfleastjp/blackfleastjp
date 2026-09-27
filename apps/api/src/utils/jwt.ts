import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type VerifiedRefreshToken = JwtPayload & { sub: string; jti: string; tokenType: 'refresh' };

// Refresh JWTs have high entropy, so persist a SHA-256 digest rather than the raw cookie value.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAccessToken(userId: string): string {
  return jwt.sign({ tokenType: 'access' }, env.ACCESS_TOKEN_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function createRefreshToken(userId: string): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ tokenType: 'refresh' }, env.REFRESH_TOKEN_SECRET, {
    subject: userId,
    jwtid: jti,
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token: string): VerifiedRefreshToken | null {
  try {
    const payload = jwt.verify(token, env.REFRESH_TOKEN_SECRET);
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      payload.tokenType !== 'refresh'
    ) {
      return null;
    }
    return payload as VerifiedRefreshToken;
  } catch {
    return null;
  }
}
