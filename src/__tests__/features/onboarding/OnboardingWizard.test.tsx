import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from '../../../features/onboarding/OnboardingWizard';

// Mock invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

// Mock invokeWithResilience (used by OnboardingWizard for save_setting)
vi.mock('../../../services/apiClient', () => ({
  invokeWithResilience: vi.fn().mockResolvedValue(null),
}));

// Mock UserModeContext
vi.mock('../../../contexts/UserModeContext', () => ({
  useUserMode: () => ({
    isAdvanced: false,
    toggleMode: vi.fn(),
    mode: 'simple',
    setMode: vi.fn(),
  }),
}));

describe('OnboardingWizard', () => {
  const onComplete = vi.fn();

  beforeEach(() => { onComplete.mockClear(); });

  it('shows step 1 (Welcome) first', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    expect(screen.getByText(/Welcome to FlowFolio/i)).toBeInTheDocument();
  });

  it('advances to step 2 when Next is clicked on step 1', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Your Universe/i)).toBeInTheDocument();
  });

  it('allows skipping step 2', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // → step 2
    fireEvent.click(screen.getByRole('button', { name: /skip/i })); // skip step 2
    expect(screen.getByText(/Your Strategy/i)).toBeInTheDocument();
  });

  it('calls onComplete after step 4', async () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));  // → 2
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));  // skip 2 → 3
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));  // skip 3 → 4
    fireEvent.click(screen.getByRole('button', { name: /get started|finish|done/i })); // complete
    // onComplete may be async
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
