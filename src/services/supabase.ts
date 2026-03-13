import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string;
          name: string | null;
          avatar_url: string | null;
          is_active: boolean;
          is_email_verified: boolean;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          tier: 'free' | 'starter' | 'pro' | 'enterprise';
          credits: number;
          monthly_credits: number;
          max_portfolios: number;
          max_watchlist_items: number;
          backtest_limit: number;
          ai_queries_limit: number;
          expires_at: string | null;
          renews_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'purchase' | 'usage' | 'bonus' | 'refund' | 'expiry';
          amount: number;
          balance: number;
          description: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          status: 'active' | 'archived' | 'deleted';
          initial_capital: string;
          currency: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      watchlist_items: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          notes: string | null;
          target_price: string | null;
          created_at: string;
        };
      };
      vibe_plans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          plan_data: Record<string, unknown>;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
};
