import { useState, useEffect } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { ShieldAlert } from 'lucide-react';
import './PrivacyDisclosure.css';

interface Props {
  featureName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function PrivacyDisclosure({ featureName, onAccept, onDecline }: Props) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    invokeWithResilience<string | null>('load_setting', { key: `privacy_accepted_${featureName}` })
      .then((value: string | null) => {
        if (cancelled) return;
        if (value === 'true') {
          onAccept();
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  // onAccept is intentionally excluded — it's a callback and should not re-trigger the check
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureName]);

  const handleAccept = () => {
    invokeWithResilience<void>('save_setting', {
      key: `privacy_accepted_${featureName}`,
      value: 'true',
    }).catch(() => {
      // Non-fatal: proceed even if persistence fails
    });
    onAccept();
  };

  if (!checked) return null;

  return (
    <div className="privacy-disclosure-overlay" role="dialog" aria-modal="true" aria-labelledby="privacy-disclosure-heading">
      <div className="privacy-disclosure-modal">
        <div className="privacy-disclosure-icon">
          <ShieldAlert size={40} />
        </div>

        <h2 id="privacy-disclosure-heading">Privacy Notice</h2>

        <div className="privacy-disclosure-body">
          <p>
            This feature uses an AI model via{' '}
            <a
              href="https://openrouter.ai/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="privacy-disclosure-link"
            >
              OpenRouter's API
            </a>
            . Before continuing, please be aware:
          </p>

          <ul className="privacy-disclosure-list">
            <li>Your portfolio context and prompts are sent to OpenRouter over HTTPS (encrypted in transit).</li>
            <li>FlowFolio does not store your data on any server — this is a local-only app.</li>
            <li>OpenRouter processes your request according to their{' '}
              <a
                href="https://openrouter.ai/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="privacy-disclosure-link"
              >
                privacy policy
              </a>.
            </li>
            <li>No personally identifiable information is included unless you type it yourself.</li>
          </ul>

          <p className="privacy-disclosure-consent-note">
            No data leaves your device without this explicit consent. You can decline and continue using FlowFolio in manual mode.
          </p>
        </div>

        <div className="privacy-disclosure-actions">
          <button className="btn-secondary" onClick={onDecline}>
            Decline
          </button>
          <button className="btn-primary" onClick={handleAccept}>
            I Understand, Continue
          </button>
        </div>
      </div>
    </div>
  );
}
