// server/src/routes/auth.ts
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, type Tier
} from '../jwt.js';

export const authRouter = new Hono();

function makeOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL ?? 'http://localhost:3001'}/auth/google/callback`
  );
}

// GET /auth/google — redirect to Google
authRouter.get('/google', (c) => {
  const client = makeOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
    prompt: 'consent',
  });
  return c.redirect(url);
});

// GET /auth/google/callback — exchange code, issue tokens
authRouter.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code' }, 400);

  const client = makeOAuth2Client();

  let googleUser: { id: string; email: string; name: string; picture: string };
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token! });
    const payload = ticket.getPayload()!;
    googleUser = {
      id: payload.sub,
      email: payload.email!,
      name: payload.name ?? payload.email!,
      picture: payload.picture ?? '',
    };
  } catch {
    return c.json({ error: 'Google auth failed' }, 400);
  }

  // Upsert user
  const result = await pool.query<{ id: string; subscription_tier: string }>(
    `INSERT INTO users (id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
     RETURNING id, subscription_tier`,
    [googleUser.id, googleUser.email, googleUser.name, googleUser.picture]
  );
  const user = result.rows[0];

  // Issue tokens
  const secret = process.env.JWT_SECRET!;
  const accessToken = await signAccessToken({
    userId: user.id,
    email: googleUser.email,
    tier: user.subscription_tier as Tier,
  }, secret);
  const refreshToken = await signRefreshToken(user.id, secret);

  // Store hashed refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const tokenId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [tokenId, user.id, hashToken(refreshToken), expiresAt]
  );

  // Redirect to app deep link
  const callbackUrl = process.env.APP_CALLBACK_URL ?? 'flowfolio://auth/callback';
  return c.redirect(`${callbackUrl}?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`);
});

// POST /auth/refresh
authRouter.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>().catch(() => ({} as { refresh_token?: string }));
  const { refresh_token } = body;
  if (!refresh_token) return c.json({ error: 'Missing refresh_token' }, 400);

  const secret = process.env.JWT_SECRET!;
  let userId: string;
  try {
    ({ userId } = await verifyRefreshToken(refresh_token, secret));
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Verify hash in DB
  const result = await pool.query<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [hashToken(refresh_token)]
  );
  const row = result.rows[0];
  if (!row || row.user_id !== userId || new Date(row.expires_at) < new Date()) {
    return c.json({ error: 'Token revoked or expired' }, 401);
  }

  // Fetch current tier
  const userResult = await pool.query<{ subscription_tier: string; email: string }>(
    `SELECT subscription_tier, email FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return c.json({ error: 'User not found' }, 401);

  const newAccessToken = await signAccessToken({
    userId,
    email: user.email,
    tier: user.subscription_tier as Tier,
  }, secret);

  return c.json({ access_token: newAccessToken });
});

// POST /auth/logout
authRouter.post('/logout', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>().catch(() => ({})) as { refresh_token?: string };
  if (body.refresh_token) {
    await pool.query(
      `DELETE FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(body.refresh_token)]
    );
  }
  return c.json({ ok: true });
});
