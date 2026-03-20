// server/src/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

export type Tier = 'free' | 'ai' | 'sync' | 'pro';

export interface TokenClaims {
  userId: string;
  email: string;
  tier: Tier;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: TokenClaims, secret: string): Promise<string> {
  return new SignJWT({ userId: claims.userId, email: claims.email, tier: claims.tier })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey(secret));
}

const VALID_TIERS: Tier[] = ['free', 'ai', 'sync', 'pro'];

export async function verifyAccessToken(token: string, secret: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  const userId = payload['userId'];
  const email = payload['email'];
  const tier = payload['tier'];
  if (typeof userId !== 'string' || typeof email !== 'string') {
    throw new Error('Invalid token: missing required claims');
  }
  return {
    userId,
    email,
    tier: VALID_TIERS.includes(tier as Tier) ? (tier as Tier) : 'free',
  };
}

export async function signRefreshToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey(secret));
}

export async function verifyRefreshToken(token: string, secret: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  const userId = payload['userId'];
  if (typeof userId !== 'string') {
    throw new Error('Invalid refresh token: missing userId');
  }
  return { userId };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
