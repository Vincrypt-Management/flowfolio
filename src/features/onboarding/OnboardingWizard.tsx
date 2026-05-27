import { useState, useCallback } from 'react';
import { Stepper } from '@flowfolio/ui';
import { invokeWithResilience } from '../../services/apiClient';
import { StepWelcome } from './steps/StepWelcome';
import { StepUniverse } from './steps/StepUniverse';
import { StepStrategy } from './steps/StepStrategy';
import { StepApiKeys } from './steps/StepApiKeys';
import './OnboardingWizard.css';

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'universe', label: 'Universe' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'api-keys', label: 'API Keys' },
];

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
        <Stepper
          steps={STEPS}
          current={step}
          onStepClick={setStep}
          aria-label="Onboarding progress"
          className="onboarding-progress"
        />

        {/* Step content */}
        {step === 0 && <StepWelcome onNext={advance} />}
        {step === 1 && <StepUniverse onNext={advance} onSkip={advance} />}
        {step === 2 && <StepStrategy onNext={advance} onSkip={advance} />}
        {step === 3 && <StepApiKeys onFinish={finish} />}
      </div>
    </div>
  );
}
