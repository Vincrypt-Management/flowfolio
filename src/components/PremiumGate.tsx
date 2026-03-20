import { ReactNode, useState, useEffect } from 'react';
import { Sparkles, X, Lock } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import './PremiumGate.css';

type PremiumTier = 'ai' | 'sync' | 'pro';

const TIER_INFO: Record<PremiumTier, { name: string; description: string; price: string; features: string[] }> = {
  ai: {
    name: 'AI Suite',
    description: 'Unlock AI-powered portfolio analysis, natural language strategy building, and journal insights.',
    price: '$9/mo or $79/yr',
    features: [
      'Portfolio Agent — ask questions about your holdings',
      'NL Plan Builder — describe strategy in plain English',
      'AI Journal Insights — behavioral pattern analysis',
    ],
  },
  sync: {
    name: 'Cloud Sync',
    description: 'Sync your portfolios, plans, and journal across all your devices.',
    price: '$4/mo or $35/yr',
    features: [
      'Multi-device sync',
      'Automatic cloud backup',
      'Restore on new device in seconds',
    ],
  },
  pro: {
    name: 'Pro Bundle',
    description: 'Everything in AI Suite and Cloud Sync at a discounted bundle price.',
    price: '$12/mo or $99/yr',
    features: [
      'All AI Suite features',
      'All Cloud Sync features',
      'Best value',
    ],
  },
};

interface PremiumGateProps {
  tier: PremiumTier;
  children: ReactNode;
  /** If true, show a locked preview instead of hiding content entirely. Default: false */
  preview?: boolean;
}

export function PremiumGate({ tier, children, preview = false }: PremiumGateProps) {
  const { hasTier } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  if (hasTier(tier)) {
    return <>{children}</>;
  }

  const info = TIER_INFO[tier];

  return (
    <>
      {/* Locked placeholder / preview */}
      <div
        className="premium-gate-locked"
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
      >
        {preview && (
          <div className="premium-gate-preview-blur" aria-hidden="true">
            <div className="premium-gate-preview-placeholder">
              <span>Preview unavailable</span>
            </div>
          </div>
        )}
        <div className="premium-gate-overlay">
          <Lock size={24} />
          <span>{info.name}</span>
          <span className="premium-gate-cta">Upgrade to unlock</span>
        </div>
      </div>

      {/* Upgrade modal */}
      {modalOpen && (
        <div className="premium-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="premium-modal" onClick={(e) => e.stopPropagation()}>
            <button className="premium-modal-close" onClick={() => setModalOpen(false)}>
              <X size={16} />
            </button>
            <div className="premium-modal-header">
              <Sparkles size={28} className="premium-modal-icon" />
              <h2>{info.name}</h2>
              <p className="premium-modal-price">{info.price}</p>
            </div>
            <p className="premium-modal-description">{info.description}</p>
            <ul className="premium-modal-features">
              {info.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="premium-modal-actions">
              <button className="btn-primary" disabled>
                Upgrade — Coming Soon
              </button>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Maybe later
              </button>
            </div>
            <p className="premium-modal-note">
              Stripe integration coming in the next update.
              Sign in to be notified when it launches.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
