import { useState, useEffect } from 'react';
import { invokeWithResilience } from '../../../services/apiClient';
import { Sparkles } from 'lucide-react';

interface Props { onNext: () => void; onSkip: () => void; }

export function StepStrategy({ onNext, onSkip }: Props) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    invokeWithResilience<string[]>('list_templates', {}).then(setTemplates).catch(() => {});
  }, []);

  const handleLoad = async () => {
    if (!selected) { onSkip(); return; }
    try {
      await invokeWithResilience('get_template', { name: selected });
    } catch { /* ignore */ }
    onNext();
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">Your Strategy</h2>
      <p className="onboarding-step-subtitle">
        Start with a pre-built Vibe Plan template or explore Vibe Studio to build your own.
      </p>

      <div className="onboarding-template-list">
        {templates.length === 0 && <p className="text-muted">Loading templates…</p>}
        {templates.slice(0, 6).map(t => (
          <button
            key={t}
            className={`onboarding-template-item ${selected === t ? 'selected' : ''}`}
            onClick={() => setSelected(t)}
          >
            <Sparkles size={14} />
            {t}
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleLoad}>
          {selected ? `Load "${selected}"` : 'Continue'}
        </button>
        <button className="btn-ghost" onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  );
}
