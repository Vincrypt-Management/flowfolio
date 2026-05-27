import { useState } from 'react';
import { invokeWithResilience } from '../../../services/apiClient';
import { Plus } from 'lucide-react';
import { Button, Input, Alert } from '@flowfolio/ui';

const PRESETS: Record<string, string[]> = {
  'S&P 500 Sample': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'UNH'],
  'Tech Growth':    ['NVDA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM'],
  'Dividend Focus': ['JNJ', 'PG', 'KO', 'MCD', 'PEP', 'MMM', 'T', 'VZ', 'XOM', 'CVX'],
};

interface Props { onNext: () => void; onSkip: () => void; }

export function StepUniverse({ onNext, onSkip }: Props) {
  const [name, setName] = useState('My First Universe');
  const [symbols, setSymbols] = useState('AAPL, MSFT, GOOGL, AMZN, NVDA');
  const [created, setCreated] = useState(false);
  const [error, setError] = useState('');

  const handlePreset = (preset: string) => {
    setSymbols(PRESETS[preset].join(', '));
  };

  const handleCreate = async () => {
    setError('');
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!name.trim() || symbolList.length === 0) {
      setError('Enter a name and at least one symbol.');
      return;
    }
    try {
      await invokeWithResilience('create_universe', { name: name.trim(), description: 'Created during onboarding', symbols: symbolList });
      setCreated(true);
      setTimeout(onNext, 800);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">Your Universe</h2>
      <p className="onboarding-step-subtitle">Create your first watchlist of stocks to track and score.</p>

      <div className="onboarding-presets">
        <span className="text-muted" style={{ fontSize: '12px' }}>Quick presets:</span>
        {Object.keys(PRESETS).map(p => (
          <Button key={p} variant="secondary" size="sm" onClick={() => handlePreset(p)}>{p}</Button>
        ))}
      </div>

      <div className="form-group">
        <label>Universe name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="My First Universe" />
      </div>
      <div className="form-group">
        <label>Tickers (comma-separated)</label>
        <Input value={symbols} onChange={e => setSymbols(e.target.value)} placeholder="AAPL, MSFT, GOOGL" />
      </div>

      {error && <Alert variant="error" title="Could not create universe" description={error} />}
      {created && <Alert variant="success" title="Universe created!" />}

      <div className="onboarding-actions">
        <Button variant="primary" onClick={handleCreate} disabled={created} leftIcon={<Plus size={14} />}>
          Create Universe
        </Button>
        <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
      </div>
    </div>
  );
}
