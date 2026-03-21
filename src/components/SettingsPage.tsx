import { useState, useRef, useCallback, useEffect } from 'react';
import { useUserProfile, AccountType } from '../contexts/UserProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency, SUPPORTED_CURRENCIES } from '../contexts/CurrencyContext';
import { invoke } from '../services/tauri';
import { createLogger } from '../core/logger';
import { User, Camera, Briefcase, MapPin, Globe, Mail, Shield, Trash2, Save, CheckCircle, Eye, EyeOff, CheckCircle2, LogIn, LogOut, User as UserIcon, Crown, Lock, Unlock, KeyRound } from 'lucide-react';

const log = createLogger('SettingsPage');

const API_KEY_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'alpaca_key',        label: 'Alpaca API Key',    placeholder: 'Enter key…' },
  { key: 'alpaca_secret',     label: 'Alpaca Secret',     placeholder: 'Enter secret…' },
  { key: 'finnhub_key',       label: 'Finnhub Key',       placeholder: 'Enter key…' },
  { key: 'fmp_key',           label: 'FMP Key',           placeholder: 'Enter key…' },
  { key: 'tiingo_key',        label: 'Tiingo Key',        placeholder: 'Enter key…' },
  { key: 'twelve_data_key',   label: 'Twelve Data Key',   placeholder: 'Enter key…' },
  { key: 'polygon_key',       label: 'Polygon Key',       placeholder: 'Enter key…' },
  { key: 'alpha_vantage_key', label: 'Alpha Vantage Key', placeholder: 'Enter key…' },
  { key: 'openrouter_key',    label: 'OpenRouter Key',    placeholder: 'Enter key…' },
];
import './SettingsPage.css';

export function SettingsPage() {
  const { profile, updateProfile, resetProfile } = useUserProfile();
  const { user, isAuthenticated, tier, loginWithGoogle, logout, loading: authLoading } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [apiKeysSaved, setApiKeysSaved] = useState(false);

  // Stronghold vault state
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultConfirm, setVaultConfirm] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [vaultLoading, setVaultLoading] = useState(false);

  useEffect(() => {
    invoke<Record<string, boolean>>('get_api_key_statuses')
      .then(setApiKeyStatuses)
      .catch(() => {});
    invoke<boolean>('vault_exists').then(setVaultExists).catch(() => {});
    invoke<boolean>('vault_is_unlocked').then(setVaultUnlocked).catch(() => {});
  }, []);

  const [form, setForm] = useState({ ...profile });

  const handleChange = useCallback((field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    updateProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [form, updateProfile]);

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return; // Max 2MB
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setForm(prev => ({ ...prev, avatarUrl: result }));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    setForm(prev => ({ ...prev, avatarUrl: '' }));
  }, []);

  const handleSaveApiKeys = useCallback(async () => {
    try {
      await invoke('save_api_keys', { keys: apiKeys });
      const updated = await invoke<Record<string, boolean>>('get_api_key_statuses');
      setApiKeyStatuses(updated);
      setApiKeys({});
      setApiKeysSaved(true);
      setTimeout(() => setApiKeysSaved(false), 2000);
    } catch {
      // silent
    }
  }, [apiKeys]);

  const handleVaultSetup = useCallback(async () => {
    setVaultError('');
    if (vaultPassword.length < 8) {
      setVaultError('Password must be at least 8 characters');
      return;
    }
    if (vaultPassword !== vaultConfirm) {
      setVaultError('Passwords do not match');
      return;
    }
    setVaultLoading(true);
    try {
      // Get vault path and initialize Stronghold via JS API
      const vaultPath = await invoke<string>('vault_get_path');
      const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
      const stronghold = await Stronghold.load(vaultPath, vaultPassword);

      // Migrate existing keys from JSON store
      const existingKeys = await invoke<Record<string, string>>('vault_migrate_keys');
      const client = await stronghold.createClient('api-keys').catch(() => stronghold.loadClient('api-keys'));
      const store = client.getStore();
      for (const [key, value] of Object.entries(existingKeys)) {
        await store.insert(key, Array.from(new TextEncoder().encode(value)));
      }
      await stronghold.save();
      await invoke('vault_set_unlocked');

      setVaultExists(true);
      setVaultUnlocked(true);
      setVaultPassword('');
      setVaultConfirm('');
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : String(e));
    } finally {
      setVaultLoading(false);
    }
  }, [vaultPassword, vaultConfirm]);

  const handleVaultUnlock = useCallback(async () => {
    setVaultError('');
    setVaultLoading(true);
    try {
      const vaultPath = await invoke<string>('vault_get_path');
      const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
      await Stronghold.load(vaultPath, vaultPassword);
      await invoke('vault_set_unlocked');
      setVaultUnlocked(true);
      setVaultPassword('');
    } catch (e) {
      setVaultError('Wrong password or corrupt vault');
      log.error('Vault unlock failed', e);
    } finally {
      setVaultLoading(false);
    }
  }, [vaultPassword]);

  const handleVaultLock = useCallback(async () => {
    try {
      const vaultPath = await invoke<string>('vault_get_path');
      const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
      const stronghold = await Stronghold.load(vaultPath, '');
      await stronghold.unload();
      await invoke('vault_set_locked');
      setVaultUnlocked(false);
    } catch {
      await invoke('vault_set_locked');
      setVaultUnlocked(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    resetProfile();
    setForm({
      displayName: 'Investor',
      email: '',
      avatarUrl: '',
      accountType: 'personal' as AccountType,
      bio: '',
      company: '',
      location: '',
      website: '',
    });
  }, [resetProfile]);

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1 className="page-title">Account Settings</h1>
        <p className="page-subtitle">Manage your profile, preferences, and account type</p>
      </header>

      <div className="settings-grid">
        {/* Profile Photo Section */}
        <div className="card settings-card">
          <h3><Camera size={20} /> Profile Photo</h3>
          <div className="avatar-section">
            <div className="avatar-preview" onClick={handleAvatarClick}>
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="Profile" className="avatar-preview-img" />
              ) : (
                <div className="avatar-preview-placeholder">
                  <User size={40} />
                  <span>Click to upload</span>
                </div>
              )}
              <div className="avatar-overlay">
                <Camera size={20} />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="sr-only"
              aria-label="Upload profile photo"
            />
            <div className="avatar-actions">
              <button className="btn-secondary btn-small" onClick={handleAvatarClick}>
                Upload Photo
              </button>
              {form.avatarUrl && (
                <button className="btn-secondary btn-small btn-danger" onClick={handleRemoveAvatar}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <p className="text-muted text-small">Max 2MB. JPG, PNG, or GIF.</p>
          </div>
        </div>

        {/* Personal Info */}
        <div className="card settings-card">
          <h3><User size={20} /> Personal Information</h3>
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={form.displayName}
                onChange={e => handleChange('displayName', e.target.value)}
                placeholder="Your name"
                maxLength={50}
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">
                <Mail size={14} /> Email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={e => handleChange('bio', e.target.value)}
                placeholder="A short bio about your investment style..."
                rows={3}
                maxLength={200}
              />
              <span className="char-count">{form.bio.length}/200</span>
            </div>
          </div>
        </div>

        {/* Professional Details */}
        <div className="card settings-card">
          <h3><Briefcase size={20} /> Professional Details</h3>
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="company">
                <Briefcase size={14} /> Company / Organization
              </label>
              <input
                id="company"
                type="text"
                value={form.company}
                onChange={e => handleChange('company', e.target.value)}
                placeholder="Your company"
              />
            </div>
            <div className="form-group">
              <label htmlFor="location">
                <MapPin size={14} /> Location
              </label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={e => handleChange('location', e.target.value)}
                placeholder="City, Country"
              />
            </div>
            <div className="form-group">
              <label htmlFor="website">
                <Globe size={14} /> Website
              </label>
              <input
                id="website"
                type="url"
                value={form.website}
                onChange={e => handleChange('website', e.target.value)}
                placeholder="https://your-website.com"
              />
            </div>
          </div>
        </div>

        {/* Account Type */}
        <div className="card settings-card">
          <h3><Shield size={20} /> Account Type</h3>
          <div className="account-type-selector">
            <button
              className={`account-type-option ${form.accountType === 'personal' ? 'active' : ''}`}
              onClick={() => handleChange('accountType', 'personal')}
            >
              <User size={24} />
              <div className="account-type-info">
                <span className="account-type-name">Personal</span>
                <span className="account-type-desc">
                  For individual investors managing personal portfolios
                </span>
              </div>
            </button>
            <button
              className={`account-type-option ${form.accountType === 'professional' ? 'active' : ''}`}
              onClick={() => handleChange('accountType', 'professional')}
            >
              <Briefcase size={24} />
              <div className="account-type-info">
                <span className="account-type-name">Professional</span>
                <span className="account-type-desc">
                  For financial advisors and portfolio managers
                </span>
              </div>
              <span className="pro-tag">PRO</span>
            </button>
          </div>
        </div>

        {/* Currency Preference */}
        <div className="card settings-card">
          <h3><Globe size={20} /> Currency</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>
            Display all monetary values in your preferred currency.
          </p>
          <div className="form-group">
            <label htmlFor="currency">Display Currency</label>
            <select
              id="currency"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              style={{ width: '200px' }}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Account Section */}
        <div className="card settings-card">
          <h3><UserIcon size={20} /> Account</h3>
          {authLoading ? (
            <div className="text-muted">Loading...</div>
          ) : isAuthenticated && user ? (
            <div className="account-card">
              <div className="account-info">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="Avatar" className="account-avatar" />
                )}
                <div>
                  <div className="account-name">{user.name ?? user.email}</div>
                  <div className="account-email text-muted">{user.email}</div>
                  <div className="account-tier">
                    <Crown size={12} />
                    <span>{tier === 'free' ? 'Free' : tier === 'ai' ? 'AI Suite' : tier === 'sync' ? 'Cloud Sync' : 'Pro'}</span>
                  </div>
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={() => logout().catch((e) => log.error('Logout failed', e))}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : (
            <div className="account-login-prompt">
              <p className="text-muted">Sign in to unlock AI Suite and Cloud Sync premium features.</p>
              <button
                className="btn-primary"
                onClick={() => loginWithGoogle().catch((e) => log.error('Login failed', e))}
              >
                <LogIn size={14} /> Sign in with Google
              </button>
            </div>
          )}
        </div>

        {/* Stronghold Vault Section */}
        <div className="card settings-card">
          <h3><KeyRound size={20} /> Encrypted Vault</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>
            Encrypt your API keys with a vault password using IOTA Stronghold.
            {vaultUnlocked && ' Vault is unlocked — keys are encrypted at rest.'}
          </p>

          {vaultUnlocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success, #22c55e)' }}>
                <Unlock size={16} />
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Vault unlocked</span>
              </div>
              <button className="btn-secondary btn-small" onClick={handleVaultLock}>
                <Lock size={14} /> Lock
              </button>
            </div>
          ) : vaultExists ? (
            <div>
              <div className="form-group">
                <label htmlFor="vaultUnlockPw">Vault Password</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="vaultUnlockPw"
                    type="password"
                    value={vaultPassword}
                    onChange={e => setVaultPassword(e.target.value)}
                    placeholder="Enter vault password"
                    style={{ flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && handleVaultUnlock()}
                  />
                  <button className="btn-primary btn-small" onClick={handleVaultUnlock} disabled={vaultLoading}>
                    {vaultLoading ? 'Unlocking...' : <><Unlock size={14} /> Unlock</>}
                  </button>
                </div>
              </div>
              {vaultError && <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.8rem', marginTop: '4px' }}>{vaultError}</p>}
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label htmlFor="vaultNewPw">New Vault Password</label>
                <input
                  id="vaultNewPw"
                  type="password"
                  value={vaultPassword}
                  onChange={e => setVaultPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="form-group">
                <label htmlFor="vaultConfirmPw">Confirm Password</label>
                <input
                  id="vaultConfirmPw"
                  type="password"
                  value={vaultConfirm}
                  onChange={e => setVaultConfirm(e.target.value)}
                  placeholder="Confirm password"
                  onKeyDown={e => e.key === 'Enter' && handleVaultSetup()}
                />
              </div>
              <button className="btn-primary" onClick={handleVaultSetup} disabled={vaultLoading} style={{ marginTop: '4px' }}>
                {vaultLoading ? 'Setting up...' : <><Lock size={14} /> Set Up Encrypted Vault</>}
              </button>
              {vaultError && <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.8rem', marginTop: '4px' }}>{vaultError}</p>}
            </div>
          )}
        </div>

        {/* API Keys Section */}
        <div className="card settings-card" style={{ marginTop: '2rem' }}>
          <h3>API Keys</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
            Configure market data providers. Values are stored locally and never sent to any server.
            Leave a field blank to keep the existing key.
          </p>
          {API_KEY_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="form-group" style={{ position: 'relative' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {label}
                {apiKeyStatuses[key] && (
                  <CheckCircle2 size={14} style={{ color: 'var(--color-success, #22c55e)' }} />
                )}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showKeys[key] ? 'text' : 'password'}
                  value={apiKeys[key] ?? ''}
                  onChange={e => setApiKeys(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={apiKeyStatuses[key] ? '●●●●●●●● (configured)' : placeholder}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))}
                  aria-label={showKeys[key] ? 'Hide' : 'Show'}
                >
                  {showKeys[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
          <button className="btn-primary" onClick={handleSaveApiKeys} style={{ marginTop: '8px' }}>
            {apiKeysSaved ? <><CheckCircle2 size={16} /> Saved!</> : <><Save size={16} /> Save API Keys</>}
          </button>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>
            {saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
          <button className="btn-secondary btn-danger" onClick={handleReset}>
            <Trash2 size={16} /> Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
