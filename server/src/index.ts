// server/src/index.ts
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';
import { checkoutRoutes } from './routes/checkout.js';
import { webhookRoutes } from './routes/webhook.js';
import { initSchema } from './db.js';

// Validate required env vars at startup
const required = ['JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DATABASE_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:1420',
}));

app.route('/auth', authRouter);
app.route('/user', userRouter);
app.route('/checkout', checkoutRoutes);
app.route('/webhooks', webhookRoutes);

app.get('/health', (c) => c.json({ ok: true }));

initSchema()
  .then(() => {
    const port = Number(process.env.PORT ?? 3001);
    serve({ fetch: app.fetch, port });
    console.log(`Server running on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
