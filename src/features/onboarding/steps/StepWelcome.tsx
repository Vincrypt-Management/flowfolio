import { useUserMode } from '../../../contexts/UserModeContext';
import { Shield, Wifi } from 'lucide-react';
import { Button } from '@flowfolio/ui';

interface Props { onNext: () => void; }

export function StepWelcome({ onNext }: Props) {
  const { isAdvanced, toggleMode } = useUserMode();
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon">🌊</div>
      <h1 className="onboarding-step-title">Welcome to FlowFolio</h1>
      <p className="onboarding-step-subtitle">
        Your privacy-first investment planning workspace.
      </p>

      <div className="onboarding-feature-list">
        <div className="onboarding-feature">
          <Shield size={18} />
          <div>
            <strong>100% offline by default</strong>
            <p>All data stays on your device. No account needed for core features.</p>
          </div>
        </div>
        <div className="onboarding-feature">
          <Wifi size={18} />
          <div>
            <strong>Market data from free APIs</strong>
            <p>Yahoo Finance works with zero setup. Add more providers for higher limits.</p>
          </div>
        </div>
      </div>

      <div className="onboarding-mode-toggle">
        <span>Experience mode:</span>
        <button className="mode-toggle-btn" onClick={toggleMode}>
          {isAdvanced ? 'Advanced' : 'Simple'} ↕
        </button>
        <p className="text-muted onboarding-mode-hint">
          {isAdvanced
            ? 'Full access to quant tools, risk metrics, and scoring engine.'
            : 'Simplified view — essentials only. Switch anytime in Settings.'}
        </p>
      </div>

      <Button variant="primary" className="onboarding-next-btn" onClick={onNext}>
        Next →
      </Button>
    </div>
  );
}
