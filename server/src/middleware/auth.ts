// server/src/middleware/auth.ts
// JWT verification middleware for Hono routes.
// Reads a Bearer token from the Authorization header, verifies it with
// JWT_SECRET, and sets `userId` and `tier` on the Hono context.
import type { Context, Next } from 'hono';
import { verifyAccessToken } from '../jwt.js';
import type { Tier } from '../jwt.js';

export type AuthVariables = {
  userId: string;
  tier: Tier;
};

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  throw new Error('JWT_SECRET env var is required');
})();

export async function authMiddleware(
  c: Context<{ Variables: AuthVariables }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const claims = await verifyAccessToken(token, JWT_SECRET);
    c.set('userId', claims.userId);
    c.set('tier', claims.tier);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
