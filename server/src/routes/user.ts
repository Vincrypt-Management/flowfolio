// server/src/routes/user.ts
import { Hono } from 'hono';
import { pool } from '../db.js';
import { verifyAccessToken } from '../jwt.js';

const JWT_SECRET = process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET env var is required'); })();

type Variables = { userId: string; tier: string };
export const userRouter = new Hono<{ Variables: Variables }>();

// Middleware: verify Bearer token
userRouter.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const claims = await verifyAccessToken(token, JWT_SECRET);
    c.set('userId', claims.userId);
    c.set('tier', claims.tier);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// GET /user/me
userRouter.get('/me', async (c) => {
  const userId = c.get('userId');
  const result = await pool.query(
    `SELECT id, email, name, avatar_url, subscription_tier, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(result.rows[0]);
});

// PATCH /user/me
userRouter.patch('/me', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name?: string }>().catch((): { name?: string } => ({}));
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100)) {
    return c.json({ error: 'Invalid name' }, 400);
  }
  const result = await pool.query(
    `UPDATE users SET name = COALESCE($1, name) WHERE id = $2
     RETURNING id, email, name, avatar_url, subscription_tier`,
    [body.name ?? null, userId]
  );
  return c.json(result.rows[0]);
});
