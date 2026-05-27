import { useState } from 'react';
import { invokeWithResilience } from '../../../services/apiClient';
import { Key, CheckCircle } from 'lucide-react';
import { Button, Input, Alert } from '@flowfolio/ui';

interface Props { onFinish: () => void; }

const PROVIDERS = [
  { key: 'alpaca_key', label: 'Alpaca API Key', hint: 'Free tier. alpaca.markets' },
  { key: 'finnhub_key', label: 'Finnhub Key', hint: '60 calls/min free. finnhub.io' },
  { key: 'openrouter_key', label: 'OpenRouter Key', hint: 'Required for AI features. openrouter.ai' },
];

export function StepApiKeys({ onFinish }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      const filtered = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim()));
      if (Object.keys(filtered).length > 0) {
        await invokeWithResilience('save_api_keys', { keys: filtered });
      }
      setSaved(true);
      setTimeout(onFinish, 600);
    } catch { onFinish(); }
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">API Keys (Optional)</h2>
      <p className="onboarding-step-subtitle">
        Yahoo Finance works with zero setup. Add keys for higher rate limits and AI features.
      </p>

      <div className="onboarding-key-list">
        {PROVIDERS.map(({ key, label, hint }) => (
          <div key={key} className="form-group">
            <label>
              <Key size={12} /> {label}
              <span className="text-muted" style={{ fontSize: '11px', marginLeft: '6px' }}>{hint}</span>
            </label>
            <Input
              type="password"
              placeholder="Enter key… (optional)"
              value={keys[key] ?? ''}
              onChange={e => setKeys(prev => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {saved && <Alert variant="success" title="Keys saved!" />}

      <div className="onboarding-actions">
        <Button
          variant="primary"
          onClick={handleSave}
          leftIcon={saved ? <CheckCircle size={14} /> : undefined}
        >
          {Object.values(keys).some(v => v.trim()) ? 'Save & Get Started' : 'Get Started →'}
        </Button>
      </div>
    </div>
  );
}
