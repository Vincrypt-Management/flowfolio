import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import './AuthPage.css';

type AuthView = 'login' | 'register' | 'forgot-password';

export function AuthPage() {
  const { login, register } = useAuth();
  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');

  function resetForm() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setName('');
    setError('');
    setSuccess('');
    setShowPassword(false);
  }

  function switchView(v: AuthView) {
    resetForm();
    setView(v);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      setError('Username must be 3-30 characters (letters, numbers, hyphens, underscores)');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, username, name || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setSuccess('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-grid-lines" />
      </div>

      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="auth-logo-icon">F</span>
            <span className="auth-logo-text">FlowFolio</span>
          </div>
          <p className="auth-subtitle">
            {view === 'login' && 'Sign in to your account'}
            {view === 'register' && 'Create your account'}
            {view === 'forgot-password' && 'Reset your password'}
          </p>
        </div>

        {error && (
          <div className="auth-alert auth-alert-error">{error}</div>
        )}
        {success && (
          <div className="auth-alert auth-alert-success">{success}</div>
        )}

        {/* ── Login Form ───────────────────────────── */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="auth-actions-row">
              <button
                type="button"
                className="auth-link"
                onClick={() => switchView('forgot-password')}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={18} className="auth-spinner" /> : <>Sign In <ArrowRight size={16} /></>}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <div className="auth-footer-link">
              Don't have an account?{' '}
              <button type="button" className="auth-link" onClick={() => switchView('register')}>
                Create account
              </button>
            </div>
          </form>
        )}

        {/* ── Register Form ────────────────────────── */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-field-row">
              <div className="auth-field">
                <label htmlFor="reg-username">Username</label>
                <div className="auth-input-wrap">
                  <User size={16} />
                  <input
                    id="reg-username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="johndoe"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="reg-name">Display Name</label>
                <div className="auth-input-wrap">
                  <User size={16} />
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-email">Email</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="auth-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} />
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={18} className="auth-spinner" /> : <>Create Account <ArrowRight size={16} /></>}
            </button>

            <div className="auth-footer-link">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => switchView('login')}>
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* ── Forgot Password ──────────────────────── */}
        {view === 'forgot-password' && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="auth-field">
              <label htmlFor="forgot-email">Email</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={18} className="auth-spinner" /> : <>Send Reset Link <ArrowRight size={16} /></>}
            </button>

            <div className="auth-footer-link">
              Remember your password?{' '}
              <button type="button" className="auth-link" onClick={() => switchView('login')}>
                Sign in
              </button>
            </div>
          </form>
        )}

        <p className="auth-legal">
          By continuing, you agree to FlowFolio's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
