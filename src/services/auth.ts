import { supabase } from './supabase';
import { createLogger } from '../core/logger';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

const log = createLogger('auth');

export interface User {
  id: string;
  email: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  is_email_verified: boolean;
  created_at: string;
}

export interface Subscription {
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  credits: number;
  monthly_credits: number;
  max_portfolios: number;
  max_watchlist_items: number;
  backtest_limit: number;
  ai_queries_limit: number;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  created_at: string;
}

export interface AuthResult {
  user: User;
  subscription: Subscription;
}

// ── Helpers ─────────────────────────────────────────────

async function ensureUserRow(supabaseUser: SupabaseUser, username?: string): Promise<void> {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', supabaseUser.id)
    .single();

  if (existing) return;

  // Create user row on first login
  const baseUsername = username
    || supabaseUser.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_-]/g, '')
    || `user_${supabaseUser.id.slice(0, 8)}`;

  const { error } = await supabase.from('users').insert({
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    username: baseUsername.toLowerCase(),
    name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || baseUsername,
    avatar_url: supabaseUser.user_metadata?.avatar_url || null,
    is_email_verified: !!supabaseUser.email_confirmed_at,
    is_active: true,
  });

  if (error) {
    log.error('Failed to create user row', error);
    throw new Error(error.message);
  }

  // Create free subscription with welcome credits
  await supabase.from('subscriptions').insert({
    user_id: supabaseUser.id,
    tier: 'free',
    credits: 100,
    monthly_credits: 100,
    max_portfolios: 3,
    max_watchlist_items: 20,
    backtest_limit: 5,
    ai_queries_limit: 10,
  });

  await supabase.from('credit_transactions').insert({
    user_id: supabaseUser.id,
    type: 'bonus',
    amount: 100,
    balance: 100,
    description: 'Welcome bonus credits',
  });
}

async function fetchUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, username, name, avatar_url, is_email_verified, created_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as User;
}

async function fetchSubscription(userId: string): Promise<Subscription> {
  const { data } = await supabase
    .from('subscriptions')
    .select('tier, credits, monthly_credits, max_portfolios, max_watchlist_items, backtest_limit, ai_queries_limit')
    .eq('user_id', userId)
    .single();

  if (!data) {
    return {
      tier: 'free',
      credits: 0,
      monthly_credits: 0,
      max_portfolios: 1,
      max_watchlist_items: 5,
      backtest_limit: 1,
      ai_queries_limit: 2,
    };
  }

  return data as Subscription;
}

// ── Auth API ────────────────────────────────────────────

export const auth = {
  /**
   * Register with email, password, and username.
   * Uses Supabase Auth for the credential, then creates our custom user row.
   */
  async register(email: string, password: string, username: string, name?: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          full_name: name || username,
        },
      },
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration failed');

    await ensureUserRow(data.user, username);

    const user = await fetchUserProfile(data.user.id);
    if (!user) throw new Error('Failed to fetch user profile');

    const subscription = await fetchSubscription(data.user.id);

    return { user, subscription };
  },

  /**
   * Login with email and password via Supabase Auth.
   */
  async login(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Login failed');

    // Ensure user row exists (first-time OAuth users, etc.)
    await ensureUserRow(data.user);

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', data.user.id);

    const user = await fetchUserProfile(data.user.id);
    if (!user) throw new Error('Failed to fetch user profile');

    const subscription = await fetchSubscription(data.user.id);

    return { user, subscription };
  },

  /**
   * Login with OAuth provider (Google, GitHub, etc.)
   */
  async loginWithProvider(provider: 'google' | 'github') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Get current session and user profile.
   */
  async getUser(): Promise<AuthResult | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    await ensureUserRow(session.user);

    const user = await fetchUserProfile(session.user.id);
    if (!user) return null;

    const subscription = await fetchSubscription(session.user.id);

    return { user, subscription };
  },

  /**
   * Get the current Supabase session (for passing token to Rust backend).
   */
  async getSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /**
   * Get the current user ID for Rust backend calls.
   */
  async getUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  },

  /**
   * Update user profile fields.
   */
  async updateProfile(data: { name?: string; username?: string; avatar_url?: string }): Promise<User | null> {
    const session = await this.getSession();
    if (!session) return null;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.username !== undefined) updates.username = data.username.toLowerCase();
    if (data.avatar_url !== undefined) updates.avatar_url = data.avatar_url;

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    return fetchUserProfile(session.user.id);
  },

  /**
   * Change password via Supabase Auth.
   */
  async changePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  /**
   * Get subscription info.
   */
  async getSubscription(): Promise<Subscription | null> {
    const session = await this.getSession();
    if (!session) return null;
    return fetchSubscription(session.user.id);
  },

  /**
   * Deduct credits for an action.
   */
  async deductCredits(amount: number, description: string): Promise<number> {
    const session = await this.getSession();
    if (!session) throw new Error('Not logged in');

    const sub = await fetchSubscription(session.user.id);
    if (sub.credits < amount) throw new Error('Insufficient credits');

    const newBalance = sub.credits - amount;

    await supabase
      .from('subscriptions')
      .update({ credits: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id);

    await supabase.from('credit_transactions').insert({
      user_id: session.user.id,
      type: 'usage',
      amount: -amount,
      balance: newBalance,
      description,
    });

    return newBalance;
  },

  /**
   * Get credit balance and transaction history.
   */
  async getCredits(): Promise<{
    balance: number;
    tier: string;
    monthly_credits: number;
    transactions: CreditTransaction[];
  } | null> {
    const session = await this.getSession();
    if (!session) return null;

    const sub = await fetchSubscription(session.user.id);

    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('id, type, amount, balance, description, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      balance: sub.credits,
      tier: sub.tier,
      monthly_credits: sub.monthly_credits,
      transactions: (transactions || []) as CreditTransaction[],
    };
  },

  /**
   * Logout via Supabase Auth.
   */
  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) log.error('Logout error', error);
  },

  /**
   * Check if user is logged in.
   */
  isLoggedIn(): boolean {
    // Synchronous check — relies on Supabase persisted session
    // For accurate check, use getSession() which is async
    return !!localStorage.getItem('sb-' + (import.meta.env.VITE_SUPABASE_URL || '').split('//')[1]?.split('.')[0] + '-auth-token');
  },

  /**
   * Listen for auth state changes.
   */
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
