/**
 * AlertsPanel Component
 * Price alert management with SQLite persistence and periodic price checking.
 * Uses get_current_prices_batch Tauri command for live price fetching.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../core/logger';
import { invoke } from '../services/tauri';

const log = createLogger('AlertsPanel');
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  Power,
  PowerOff,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  X,
  RotateCcw,
  Clock,
} from 'lucide-react';
import './AlertsPanel.css';

// --- Types ---

interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'above' | 'below' | 'percent_change_up' | 'percent_change_down';
  threshold: number;
  referencePrice?: number;
  active: boolean;
  triggered: boolean;
  triggeredAt?: string;
  createdAt: string;
  note?: string;
}

interface AlertsPanelProps {
  onAlertTriggered?: (alert: PriceAlert) => void;
  compact?: boolean;
}

// --- Constants ---

const CHECK_INTERVAL_MS = 60_000;

const CONDITION_ICONS: Record<PriceAlert['condition'], typeof TrendingUp> = {
  above: TrendingUp,
  below: TrendingDown,
  percent_change_up: ArrowUpCircle,
  percent_change_down: ArrowDownCircle,
};

// --- Helpers ---

function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function describeCondition(alert: PriceAlert): string {
  switch (alert.condition) {
    case 'above':
      return `above $${alert.threshold.toFixed(2)}`;
    case 'below':
      return `below $${alert.threshold.toFixed(2)}`;
    case 'percent_change_up':
      return `up ${alert.threshold.toFixed(1)}%`;
    case 'percent_change_down':
      return `down ${alert.threshold.toFixed(1)}%`;
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Component ---

export function AlertsPanel({ onAlertTriggered, compact = false }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAlertTriggeredRef = useRef(onAlertTriggered);

  // Form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formCondition, setFormCondition] = useState<PriceAlert['condition']>('above');
  const [formThreshold, setFormThreshold] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formError, setFormError] = useState('');

  // Desktop notifications toggle (persisted to SQLite user_settings)
  const [desktopNotifs, setDesktopNotifs] = useState<boolean>(true);
  const desktopNotifsRef = useRef(desktopNotifs);
  useEffect(() => { desktopNotifsRef.current = desktopNotifs; }, [desktopNotifs]);

  // Load desktopNotifs from SQLite on mount; migrate legacy localStorage value if present
  useEffect(() => {
    // LEGACY migration: move old localStorage key to SQLite, then remove it
    const legacyVal = localStorage.getItem('flowfolio-desktop-notifs');
    if (legacyVal !== null) {
      const migrated = legacyVal !== 'false';
      invoke('save_setting', { key: 'alerts_desktop_notifs', value: String(migrated) })
        .then(() => {
          localStorage.removeItem('flowfolio-desktop-notifs');
          setDesktopNotifs(migrated);
        })
        .catch(() => { setDesktopNotifs(migrated); });
      return;
    }
    // Normal load from SQLite
    invoke<string | null>('load_setting', { key: 'alerts_desktop_notifs' })
      .then(val => { setDesktopNotifs(val !== 'false'); })
      .catch(() => { /* default true */ });
  }, []);

  const toggleDesktopNotifs = useCallback(() => {
    setDesktopNotifs(prev => {
      const next = !prev;
      invoke('save_setting', { key: 'alerts_desktop_notifs', value: String(next) })
        .catch(() => {});
      return next;
    });
  }, []);

  // Keep callback ref current
  useEffect(() => {
    onAlertTriggeredRef.current = onAlertTriggered;
  }, [onAlertTriggered]);

  // Load alerts from SQLite on mount
  useEffect(() => {
    invoke<PriceAlert[]>('list_alerts')
      .then(setAlerts)
      .catch(() => {});
  }, []);

  // One-time migration: move any localStorage alerts into SQLite
  useEffect(() => {
    const LEGACY_KEY = 'flowfolio_price_alerts';
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try {
        const legacyAlerts: PriceAlert[] = JSON.parse(legacy);
        Promise.all(legacyAlerts.map(a => invoke('create_alert', { alert: a })))
          .then(() => {
            localStorage.removeItem(LEGACY_KEY);
            return invoke<PriceAlert[]>('list_alerts');
          })
          .then(setAlerts)
          .catch(err => log.error('Migration failed', err));
      } catch { /* ignore */ }
    }
  }, []);

  // Derived
  const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
  const triggeredAlerts = alerts.filter((a) => a.triggered);
  const triggeredCount = triggeredAlerts.length;

  // Check alerts against live prices
  const checkAlerts = useCallback(async () => {
    const toCheck = alerts.filter((a) => a.active && !a.triggered);
    if (toCheck.length === 0) return;

    const symbols = Array.from(new Set(toCheck.map((a) => a.symbol)));

    setChecking(true);
    try {
      const prices = await invoke<Record<string, number>>('get_current_prices_batch', {
        symbols,
      });

      const triggered: Array<{ symbol: string; condition: PriceAlert['condition']; threshold: number; price: number }> = [];
      const nowTriggeredAlerts: PriceAlert[] = [];

      setAlerts((prev) => {
        let changed = false;
        const next = prev.map((alert) => {
          if (!alert.active || alert.triggered) return alert;

          const price = prices[alert.symbol];
          if (price == null) return alert;

          let fired = false;

          switch (alert.condition) {
            case 'above':
              fired = price >= alert.threshold;
              break;
            case 'below':
              fired = price <= alert.threshold;
              break;
            case 'percent_change_up': {
              const ref = alert.referencePrice ?? 0;
              if (ref > 0) {
                const pctChange = ((price - ref) / ref) * 100;
                fired = pctChange >= alert.threshold;
              }
              break;
            }
            case 'percent_change_down': {
              const ref = alert.referencePrice ?? 0;
              if (ref > 0) {
                const pctChange = ((ref - price) / ref) * 100;
                fired = pctChange >= alert.threshold;
              }
              break;
            }
          }

          if (fired) {
            changed = true;
            triggered.push({ symbol: alert.symbol, condition: alert.condition, threshold: alert.threshold, price });
            const updated: PriceAlert = {
              ...alert,
              triggered: true,
              triggeredAt: new Date().toISOString(),
            };
            onAlertTriggeredRef.current?.(updated);
            nowTriggeredAlerts.push(updated);
            return updated;
          }
          return alert;
        });

        return changed ? next : prev;
      });

      // Persist triggered alerts to SQLite
      for (const a of nowTriggeredAlerts) {
        invoke('update_alert', { alert: a }).catch(() => {});
      }

      // Fire desktop notifications OUTSIDE the state updater (must be pure)
      if (desktopNotifsRef.current) {
        for (const t of triggered) {
          invoke('send_price_alert_notification', {
            symbol: t.symbol,
            message: `${t.symbol} hit ${t.threshold} — current price: ${t.price.toFixed(2)}`,
          }).catch(() => {});
        }
      }

      setLastChecked(new Date());
    } catch {
      // Silently fail - price fetch might not be available
    } finally {
      setChecking(false);
    }
  }, [alerts]);

  // Set up periodic checking
  useEffect(() => {
    checkAlerts();

    intervalRef.current = setInterval(checkAlerts, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAlerts]);

  // Create alert
  const handleCreate = useCallback(async () => {
    const symbol = formSymbol.trim().toUpperCase();
    if (!symbol) {
      setFormError('Symbol is required');
      return;
    }

    const threshold = parseFloat(formThreshold);
    if (isNaN(threshold) || threshold <= 0) {
      setFormError('Threshold must be a positive number');
      return;
    }

    let referencePrice: number | undefined;

    // For percent change alerts, fetch current price as reference
    if (formCondition === 'percent_change_up' || formCondition === 'percent_change_down') {
      try {
        const prices = await invoke<Record<string, number>>('get_current_prices_batch', {
          symbols: [symbol],
        });
        referencePrice = prices[symbol];
        if (!referencePrice) {
          setFormError(`Could not fetch current price for ${symbol}`);
          return;
        }
      } catch {
        setFormError('Failed to fetch reference price');
        return;
      }
    }

    const newAlert: PriceAlert = {
      id: generateId(),
      symbol,
      condition: formCondition,
      threshold,
      referencePrice,
      active: true,
      triggered: false,
      createdAt: new Date().toISOString(),
      note: formNote.trim() || undefined,
    };

    try {
      await invoke('create_alert', { alert: newAlert });
      const updated = await invoke<PriceAlert[]>('list_alerts');
      setAlerts(updated);
    } catch {
      setFormError('Failed to save alert');
      return;
    }
    setFormSymbol('');
    setFormThreshold('');
    setFormNote('');
    setFormError('');
    setShowForm(false);
  }, [formSymbol, formCondition, formThreshold, formNote]);

  const toggleActive = useCallback((id: string) => {
    setAlerts((prev) => {
      const updated = prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a));
      const target = updated.find((a) => a.id === id);
      if (target) {
        invoke('update_alert', { alert: target }).catch(() => {});
      }
      return updated;
    });
  }, []);

  const deleteAlert = useCallback((id: string) => {
    invoke('delete_alert', { id }).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissTriggered = useCallback((id: string) => {
    invoke('delete_alert', { id }).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const recreateAlert = useCallback((alert: PriceAlert) => {
    const recreated: PriceAlert = {
      ...alert,
      id: generateId(),
      active: true,
      triggered: false,
      triggeredAt: undefined,
      createdAt: new Date().toISOString(),
    };
    invoke('delete_alert', { id: alert.id }).catch(() => {});
    invoke('create_alert', { alert: recreated }).catch(() => {});
    setAlerts((prev) => [recreated, ...prev.filter((a) => a.id !== alert.id)]);
  }, []);

  const isPercentCondition =
    formCondition === 'percent_change_up' || formCondition === 'percent_change_down';

  return (
    <div className={`alerts-panel ${compact ? 'alerts-panel--compact' : ''}`}>
      {/* Header */}
      <div className="alerts-header">
        <div className="alerts-title">
          <Bell size={compact ? 16 : 20} />
          <h3>Price Alerts</h3>
          {triggeredCount > 0 && (
            <span className="alerts-badge">{triggeredCount}</span>
          )}
        </div>
        <div className="alerts-header-actions">
          {lastChecked && (
            <span className="text-muted alerts-last-checked">
              <Clock size={12} />
              {lastChecked.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            className="btn-small"
            onClick={toggleDesktopNotifs}
            title={desktopNotifs ? 'Disable desktop notifications' : 'Enable desktop notifications'}
          >
            {desktopNotifs ? <Bell size={14} /> : <BellOff size={14} />}
            {desktopNotifs ? ' Desktop On' : ' Desktop Off'}
          </button>
          <button
            className="btn-small btn-secondary"
            onClick={checkAlerts}
            disabled={checking}
            title="Check now"
          >
            <RefreshCw size={14} className={checking ? 'spin' : ''} />
          </button>
          <button
            className="btn-small btn-primary"
            onClick={() => setShowForm((s) => !s)}
            title="New alert"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="alerts-form">
          <div className="alerts-form-row">
            <input
              type="text"
              className="alerts-input"
              placeholder="Symbol (e.g. AAPL)"
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value)}
              maxLength={10}
            />
            <select
              className="alerts-select"
              value={formCondition}
              onChange={(e) => setFormCondition(e.target.value as PriceAlert['condition'])}
            >
              <option value="above">Price above</option>
              <option value="below">Price below</option>
              <option value="percent_change_up">% increase</option>
              <option value="percent_change_down">% decrease</option>
            </select>
          </div>
          <div className="alerts-form-row">
            <input
              type="number"
              className="alerts-input"
              placeholder={isPercentCondition ? 'Threshold %' : 'Price $'}
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              min="0"
              step={isPercentCondition ? '0.1' : '0.01'}
            />
            <input
              type="text"
              className="alerts-input alerts-input--note"
              placeholder="Note (optional)"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              maxLength={100}
            />
          </div>
          {formError && (
            <div className="alerts-form-error">
              <AlertTriangle size={12} />
              {formError}
            </div>
          )}
          <button className="btn-primary alerts-create-btn" onClick={handleCreate}>
            Create Alert
          </button>
        </div>
      )}

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="alerts-section">
          <div className="alerts-section-label alerts-section-label--triggered">
            <AlertTriangle size={14} />
            Triggered ({triggeredAlerts.length})
          </div>
          <div className="alerts-list">
            {triggeredAlerts.map((alert) => {
              const Icon = CONDITION_ICONS[alert.condition];
              return (
                <div key={alert.id} className="alert-item alert-item--triggered">
                  <div className="alert-item-main">
                    <Icon size={16} className="alert-condition-icon" />
                    <span className="alert-symbol font-mono">{alert.symbol}</span>
                    <span className="alert-condition text-muted">
                      {describeCondition(alert)}
                    </span>
                  </div>
                  {alert.triggeredAt && (
                    <span className="alert-timestamp text-muted">
                      <Clock size={11} />
                      {formatTimestamp(alert.triggeredAt)}
                    </span>
                  )}
                  {alert.note && (
                    <span className="alert-note text-muted">{alert.note}</span>
                  )}
                  <div className="alert-item-actions">
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => recreateAlert(alert)}
                      title="Recreate"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => dismissTriggered(alert.id)}
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <div className="alerts-section">
        <div className="alerts-section-label">
          Active ({activeAlerts.length})
        </div>
        {activeAlerts.length === 0 && (
          <div className="alerts-empty text-muted">
            No active alerts. Create one to get started.
          </div>
        )}
        <div className="alerts-list">
          {activeAlerts.map((alert) => {
            const Icon = CONDITION_ICONS[alert.condition];
            return (
              <div key={alert.id} className="alert-item">
                <div className="alert-item-main">
                  <Icon size={16} className="alert-condition-icon" />
                  <span className="alert-symbol font-mono">{alert.symbol}</span>
                  <span className="alert-condition text-muted">
                    {describeCondition(alert)}
                  </span>
                </div>
                {alert.note && (
                  <span className="alert-note text-muted">{alert.note}</span>
                )}
                <div className="alert-item-actions">
                  <button
                    className="btn-small btn-secondary"
                    onClick={() => toggleActive(alert.id)}
                    title={alert.active ? 'Pause' : 'Resume'}
                  >
                    {alert.active ? <PowerOff size={13} /> : <Power size={13} />}
                  </button>
                  <button
                    className="btn-small btn-secondary"
                    onClick={() => deleteAlert(alert.id)}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inactive (paused) alerts */}
      {alerts.filter((a) => !a.active && !a.triggered).length > 0 && (
        <div className="alerts-section">
          <div className="alerts-section-label text-muted">
            Paused ({alerts.filter((a) => !a.active && !a.triggered).length})
          </div>
          <div className="alerts-list">
            {alerts
              .filter((a) => !a.active && !a.triggered)
              .map((alert) => {
                const Icon = CONDITION_ICONS[alert.condition];
                return (
                  <div key={alert.id} className="alert-item alert-item--paused">
                    <div className="alert-item-main">
                      <Icon size={16} className="alert-condition-icon" />
                      <span className="alert-symbol font-mono">{alert.symbol}</span>
                      <span className="alert-condition text-muted">
                        {describeCondition(alert)}
                      </span>
                    </div>
                    <div className="alert-item-actions">
                      <button
                        className="btn-small btn-secondary"
                        onClick={() => toggleActive(alert.id)}
                        title="Resume"
                      >
                        <Power size={13} />
                      </button>
                      <button
                        className="btn-small btn-secondary"
                        onClick={() => deleteAlert(alert.id)}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
