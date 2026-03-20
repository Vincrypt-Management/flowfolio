import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PremiumGate } from '../../components/PremiumGate';

// Mock useSubscription
vi.mock('../../contexts/SubscriptionContext', () => ({
  useSubscription: vi.fn(),
}));

import { useSubscription } from '../../contexts/SubscriptionContext';

describe('PremiumGate', () => {
  it('renders children when user has required tier', () => {
    vi.mocked(useSubscription).mockReturnValue({ tier: 'ai', hasTier: () => true });
    render(
      <PremiumGate tier="ai">
        <span data-testid="protected">Secret Content</span>
      </PremiumGate>
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
  });

  it('renders upgrade prompt when user lacks required tier', () => {
    vi.mocked(useSubscription).mockReturnValue({ tier: 'free', hasTier: () => false });
    render(
      <PremiumGate tier="ai">
        <span data-testid="protected">Secret Content</span>
      </PremiumGate>
    );
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText(/AI Suite/i)).toBeInTheDocument();
  });
});
