import { createContext, useContext, ReactNode } from 'react';
import { useAuth, type Tier } from './AuthContext';

type PremiumTier = 'ai' | 'sync' | 'pro';

/** Pure function — export for unit testing. */
export function hasTierAccess(userTier: Tier, required: PremiumTier): boolean {
  if (userTier === 'pro') return true;
  return userTier === required;
}

interface SubscriptionContextType {
  tier: Tier;
  hasTier: (required: PremiumTier) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { tier } = useAuth();

  return (
    <SubscriptionContext.Provider value={{
      tier,
      hasTier: (required) => hasTierAccess(tier, required),
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextType {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
