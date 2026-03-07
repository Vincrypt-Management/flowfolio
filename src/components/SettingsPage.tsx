import { useState, useRef, useCallback } from 'react';
import { useUserProfile, AccountType } from '../contexts/UserProfileContext';
import { User, Camera, Briefcase, MapPin, Globe, Mail, Shield, Trash2, Save, CheckCircle } from 'lucide-react';
import './SettingsPage.css';

export function SettingsPage() {
  const { profile, updateProfile, resetProfile } = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

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
