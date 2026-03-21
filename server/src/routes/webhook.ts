// server/src/routes/webhook.ts
// Stripe webhook handler. Verifies the Stripe-Signature header and processes
// subscription lifecycle events to keep user tiers in sync.
import { Hono } from 'hono';
import Stripe from 'stripe';
import { pool } from '../db.js';
import type { Tier } from '../jwt.js';

const webhook = new Hono();

// ── Env helpers ───────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY env var is required');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET env var is required');
  return secret;
}

// ── Tier resolution ───────────────────────────────────────────────────────────

/** Maps a Stripe price ID to a FlowFolio subscription tier. */
function tierFromPriceId(priceId: string): Tier {
  const aiMonthly   = process.env.STRIPE_AI_MONTHLY_PRICE_ID;
  const aiAnnual    = process.env.STRIPE_AI_ANNUAL_PRICE_ID;
  const syncMonthly = process.env.STRIPE_SYNC_MONTHLY_PRICE_ID;
  const syncAnnual  = process.env.STRIPE_SYNC_ANNUAL_PRICE_ID;
  const proMonthly  = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual   = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  if (priceId === aiMonthly || priceId === aiAnnual)     return 'ai';
  if (priceId === syncMonthly || priceId === syncAnnual) return 'sync';
  if (priceId === proMonthly || priceId === proAnnual)   return 'pro';

  // Unknown price — default to free to avoid granting unintended access.
  console.warn(`[webhook] Unknown price ID: ${priceId}, defaulting tier to free`);
  return 'free';
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function updateUserTierById(userId: string, tier: Tier): Promise<void> {
  await pool.query(
    `UPDATE users SET subscription_tier = $1, updated_at = now() WHERE id = $2`,
    [tier, userId]
  );
}

async function updateUserTierByCustomerId(customerId: string, tier: Tier): Promise<void> {
  await pool.query(
    `UPDATE users SET subscription_tier = $1, updated_at = now() WHERE stripe_customer_id = $2`,
    [tier, customerId]
  );
}

async function saveCustomerIdForUser(userId: string, customerId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET stripe_customer_id = $1, updated_at = now() WHERE id = $2`,
    [customerId, userId]
  );
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[webhook] checkout.session.completed: missing client_reference_id');
    return;
  }

  // Persist the Stripe customer ID so portal/subscription events can look up
  // the user without a client_reference_id.
  if (typeof session.customer === 'string') {
    await saveCustomerIdForUser(userId, session.customer);
  }

  // Resolve tier from the subscription's price.
  const stripe = getStripe();
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.warn('[webhook] checkout.session.completed: no subscription on session');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.warn('[webhook] checkout.session.completed: could not resolve price ID');
    return;
  }

  const tier = tierFromPriceId(priceId);
  await updateUserTierById(userId, tier);
  console.log(`[webhook] User ${userId} upgraded to tier: ${tier}`);
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  await updateUserTierByCustomerId(customerId, 'free');
  console.log(`[webhook] Stripe customer ${customerId} subscription deleted — tier set to free`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Active/trialing → keep or update tier. Anything else → free.
  const isActive =
    subscription.status === 'active' || subscription.status === 'trialing';

  if (!isActive) {
    await updateUserTierByCustomerId(customerId, 'free');
    console.log(
      `[webhook] Stripe customer ${customerId} subscription status: ${subscription.status} — tier set to free`
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.warn('[webhook] customer.subscription.updated: could not resolve price ID');
    return;
  }

  const tier = tierFromPriceId(priceId);
  await updateUserTierByCustomerId(customerId, tier);
  console.log(`[webhook] Stripe customer ${customerId} subscription updated — tier set to: ${tier}`);
}

// ── Route ─────────────────────────────────────────────────────────────────────

// POST /webhooks/stripe
webhook.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  let webhookSecret: string;
  try {
    webhookSecret = getWebhookSecret();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error';
    console.error('[webhook] Config error:', message);
    return c.json({ error: message }, 500);
  }

  // Read raw body for signature verification.
  const rawBody = await c.req.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[webhook] Signature verification failed:', message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      default:
        // Unhandled event type — acknowledge receipt without acting.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error(`[webhook] Error handling event ${event.type}:`, message);
    // Return 500 so Stripe retries the event.
    return c.json({ error: 'Internal server error' }, 500);
  }

  return c.json({ received: true });
});

export { webhook as webhookRoutes };
