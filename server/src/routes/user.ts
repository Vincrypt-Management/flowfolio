// server/src/routes/user.ts
import { Hono } from 'hono';
import { pool } from '../db.js';
import { verifyAccessToken } from '../jwt.js';

export const userRouter = new Hono();

// Middleware: verify Bearer token
userRouter.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const secret = process.env.JWT_SECRET!;
  try {
    const claims = await verifyAccessToken(token, secret);
    c.set('userId' as never, claims.userId);
    c.set('tier' as never, claims.tier);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// GET /user/me
userRouter.get('/me', async (c) => {
  const userId = c.get('userId' as never) as string;
  const result = await pool.query(
    `SELECT id, email, name, avatar_url, subscription_tier, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(result.rows[0]);
});

// PATCH /user/me
userRouter.patch('/me', async (c) => {
  const userId = c.get('userId' as never) as string;
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const result = await pool.query(
    `UPDATE users SET name = COALESCE($1, name) WHERE id = $2
     RETURNING id, email, name, avatar_url, subscription_tier`,
    [body.name ?? null, userId]
  );
  return c.json(result.rows[0]);
});
