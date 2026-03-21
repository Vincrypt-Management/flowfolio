// server/src/routes/checkout.ts
// Stripe checkout session and billing portal routes.
// All routes require a valid JWT (via authMiddleware).
import { Hono } from 'hono';
import Stripe from 'stripe';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { pool } from '../db.js';

type Variables = AuthVariables;

const checkout = new Hono<{ Variables: Variables }>();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY env var is required');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

const PLAN_PRICE_ID_MAP: Record<string, string> = {
  ai_monthly:   'STRIPE_AI_MONTHLY_PRICE_ID',
  ai_annual:    'STRIPE_AI_ANNUAL_PRICE_ID',
  sync_monthly: 'STRIPE_SYNC_MONTHLY_PRICE_ID',
  sync_annual:  'STRIPE_SYNC_ANNUAL_PRICE_ID',
  pro_monthly:  'STRIPE_PRO_MONTHLY_PRICE_ID',
  pro_annual:   'STRIPE_PRO_ANNUAL_PRICE_ID',
} as const;

const VALID_PLANS = Object.keys(PLAN_PRICE_ID_MAP);

function getPriceId(plan: string): string {
  const envKey = PLAN_PRICE_ID_MAP[plan];
  if (!envKey) throw new Error(`Unknown plan: ${plan}`);
  const priceId = process.env[envKey];
  if (!priceId) throw new Error(`${envKey} env var is required`);
  return priceId;
}

function getAppUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:1420';
}

// POST /checkout/create-session
// Body: { plan: string }
// Returns: { url: string }
checkout.post('/create-session', authMiddleware, async (c) => {
  const userId = c.get('userId');

  let body: { plan?: unknown };
  try {
    body = await c.req.json<{ plan?: unknown }>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const plan = body.plan;
  if (typeof plan !== 'string' || !VALID_PLANS.includes(plan)) {
    return c.json(
      { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
      400
    );
  }

  let priceId: string;
  try {
    priceId = getPriceId(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error';
    return c.json({ error: message }, 500);
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();

  // Look up existing Stripe customer ID for this user, if any.
  const userResult = await pool.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  const existingCustomerId = userResult.rows[0]?.stripe_customer_id ?? undefined;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    ...(existingCustomerId ? { customer: existingCustomerId } : {}),
    success_url: `${appUrl}/settings?checkout=success`,
    cancel_url: `${appUrl}/settings?checkout=cancel`,
  });

  if (!session.url) {
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }

  return c.json({ url: session.url });
});

// GET /checkout/portal
// Returns: { url: string }
checkout.get('/portal', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const userResult = await pool.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  const customerId = userResult.rows[0]?.stripe_customer_id;

  if (!customerId) {
    return c.json({ error: 'No billing account found for this user' }, 404);
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings`,
  });

  return c.json({ url: portalSession.url });
});

export { checkout as checkoutRoutes };
