import { useState, useCallback } from 'react';
import { invokeWithResilience } from '../../services/apiClient';
import { StepWelcome } from './steps/StepWelcome';
import { StepUniverse } from './steps/StepUniverse';
import { StepStrategy } from './steps/StepStrategy';
import { StepApiKeys } from './steps/StepApiKeys';
import './OnboardingWizard.css';

const STEP_LABELS = ['Welcome', 'Universe', 'Strategy', 'API Keys'];

interface Props { onComplete: () => void; }

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  const advance = useCallback(() => setStep(s => Math.min(s + 1, 3)), []);

  const finish = useCallback(async () => {
    await invokeWithResilience('save_setting', { key: 'onboarding_complete', value: 'true' }).catch(() => {});
    onComplete();
  }, [onComplete]);

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {/* Progress dots */}
        <div className="onboarding-progress">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <span className="onboarding-dot-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 0 && <StepWelcome onNext={advance} />}
        {step === 1 && <StepUniverse onNext={advance} onSkip={advance} />}
        {step === 2 && <StepStrategy onNext={advance} onSkip={advance} />}
        {step === 3 && <StepApiKeys onFinish={finish} />}
      </div>
    </div>
  );
}
