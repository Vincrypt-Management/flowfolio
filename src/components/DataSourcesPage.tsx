import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../core/logger';

const log = createLogger('data-sources');
import { 
  Database, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
  HardDrive,
  Zap,
  Clock,
  TrendingUp,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './DataSourcesPage.css';

interface ProviderStatus {
  name: string;
  configured: boolean;
  tier: 'free' | 'premium';
  rateLimit: string;
  description: string;
}

interface ConnectionTestResult {
  status: 'connected' | 'failed';
  test_symbol: string;
  price: number;
  metrics_ok: boolean;
  signal: string;
  cache_stats: {
    memory_prices: number;
    memory_quant: number;
  };
  providers: {
    alpaca: boolean;
    finnhub: boolean;
    fmp: boolean;
    polygon: boolean;
    alphavantage: boolean;
    yahoo: boolean;
    tiingo?: boolean;
    twelvedata?: boolean;
  };
}

interface CacheStats {
  memory_prices: number;
  memory_quant: number;
  db_stats: [number, number, number, number, number] | null;
  provider_health: Record<string, [number, number]>;
}

interface HealthReport {
  status: string;
  uptime_seconds: number;
  total_requests: number;
  cache_hit_rate: number;
  avg_response_time_ms: number;
  error_rate: number;
}

export function DataSourcesPage() {
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [alpacaConfigured, setAlpacaConfigured] = useState(false);

  // Provider definitions
  const providers: ProviderStatus[] = [
    { name: 'Yahoo Finance', configured: true, tier: 'free', rateLimit: 'Unlimited', description: 'Free, no API key required. Primary fallback source.' },
    { name: 'Alpaca', configured: connectionResult?.providers?.alpaca ?? false, tier: 'free', rateLimit: 'Unlimited', description: 'Free trading API with market data. Priority Tier 1.' },
    { name: 'Finnhub', configured: connectionResult?.providers?.finnhub ?? false, tier: 'free', rateLimit: '60/min', description: 'Stock fundamentals and real-time quotes.' },
    { name: 'FMP', configured: connectionResult?.providers?.fmp ?? false, tier: 'free', rateLimit: '250/day', description: 'Financial Modeling Prep - Company financials.' },
    { name: 'Polygon', configured: connectionResult?.providers?.polygon ?? false, tier: 'premium', rateLimit: '5/min', description: 'Premium market data (free tier limited).' },
    { name: 'Alpha Vantage', configured: connectionResult?.providers?.alphavantage ?? false, tier: 'free', rateLimit: '5/min', description: 'Technical indicators and fundamentals.' },
  ];

  // Test connection and load all data
  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Test connection first (this also returns provider status)
      try {
        const result = await invoke<ConnectionTestResult>('test_data_connection');
        setConnectionResult(result);
      } catch (error) {
        log.error('Connection test failed', error);
        setConnectionResult({
          status: 'failed',
          test_symbol: 'AAPL',
          price: 0,
          metrics_ok: false,
          signal: 'FAILED',
          cache_stats: { memory_prices: 0, memory_quant: 0 },
          providers: {
            alpaca: false,
            finnhub: false,
            fmp: false,
            polygon: false,
            alphavantage: false,
            yahoo: false,
          }
        });
      }

      // Load cache stats
      try {
        const stats = await invoke<CacheStats>('get_cache_stats');
        setCacheStats(stats);
      } catch {
        // Cache stats may not be available
      }

      // Load health report
      try {
        const health = await invoke<HealthReport>('get_health_report');
        setHealthReport(health);
      } catch {
        // Health report may not be available
      }

      // Check AI configuration
      try {
        const aiOk = await invoke<boolean>('ai_is_configured');
        setAiConfigured(aiOk);
      } catch {
        setAiConfigured(false);
      }

      // Check Alpaca configuration
      try {
        const alpacaOk = await invoke<boolean>('alpaca_is_configured');
        setAlpacaConfigured(alpacaOk);
      } catch {
        setAlpacaConfigured(false);
      }

      setLastRefresh(new Date());
    } catch (error) {
      log.error('Failed to load data source info', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load on mount and refresh every 30 seconds
  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000);
    return () => clearInterval(interval);
  }, [loadAllData]);

  const getStatusColor = (configured: boolean) => configured ? 'var(--success)' : 'var(--text-dim)';
  const getStatusIcon = (configured: boolean) => configured ? <CheckCircle2 size={16} /> : <XCircle size={16} />;

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatLastRefresh = () => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastRefresh.toLocaleTimeString();
  };

  return (
    <div className="data-sources-page animate-fade-in">
      <header className="page-header">
        <div className="header-content">
          <h1 className="page-title">
            <Database size={28} />
            Data Sources
          </h1>
          <p className="page-subtitle">Market data providers and system status</p>
        </div>
        <div className="header-meta">
          {isLoading ? (
            <span className="refresh-indicator">
              <RefreshCw size={14} className="spinning" />
              Refreshing...
            </span>
          ) : (
            <span className="refresh-indicator">
              <Clock size={14} />
              Updated {formatLastRefresh()}
            </span>
          )}
        </div>
      </header>

      {/* Connection Status Banner */}
      <div className={`connection-banner ${connectionResult?.status === 'connected' ? 'connected' : connectionResult?.status === 'failed' ? 'failed' : 'unknown'}`}>
        <div className="banner-icon">
          {isLoading ? (
            <RefreshCw size={24} className="spinning" />
          ) : connectionResult?.status === 'connected' ? (
            <Wifi size={24} />
          ) : connectionResult?.status === 'failed' ? (
            <WifiOff size={24} />
          ) : (
            <Activity size={24} />
          )}
        </div>
        <div className="banner-content">
          <h3>
            {isLoading 
              ? 'Checking Connection...'
              : connectionResult?.status === 'connected' 
                ? 'All Systems Operational' 
                : connectionResult?.status === 'failed' 
                  ? 'Connection Issues Detected' 
                  : 'Initializing...'}
          </h3>
          <p>
            {connectionResult 
              ? `${connectionResult.test_symbol} @ $${connectionResult.price.toFixed(2)} | Signal: ${connectionResult.signal}`
              : 'Verifying data source connections...'}
          </p>
        </div>
        <div className="banner-status">
          <span className={`status-pill ${connectionResult?.status === 'connected' ? 'online' : 'offline'}`}>
            {connectionResult?.status === 'connected' ? 'Online' : 'Checking'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><HardDrive size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{cacheStats?.memory_prices ?? 0}</span>
            <span className="stat-label">Cached Prices</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{cacheStats?.memory_quant ?? 0}</span>
            <span className="stat-label">Quant Metrics</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Activity size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{healthReport ? `${(healthReport.cache_hit_rate * 100).toFixed(0)}%` : '--'}</span>
            <span className="stat-label">Cache Hit Rate</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{healthReport ? `${healthReport.avg_response_time_ms.toFixed(0)}ms` : '--'}</span>
            <span className="stat-label">Avg Response</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="data-sources-grid">
        {/* Data Providers Card */}
        <div className="card providers-card">
          <h3><Server size={18} /> Market Data Providers</h3>
          <p className="card-description">
            FlowFolio uses multiple data sources with intelligent failover. Configure API keys in your <code>.env</code> file.
          </p>
          
          <div className="providers-list">
            {providers.map((provider) => (
              <div key={provider.name} className={`provider-item ${provider.configured ? 'configured' : 'not-configured'}`}>
                <div className="provider-status" style={{ color: getStatusColor(provider.configured) }}>
                  {getStatusIcon(provider.configured)}
                </div>
                <div className="provider-info">
                  <div className="provider-name">
                    {provider.name}
                    <span className={`tier-badge ${provider.tier}`}>{provider.tier}</span>
                  </div>
                  <div className="provider-details">
                    <span className="rate-limit">{provider.rateLimit}</span>
                    <span className="provider-desc">{provider.description}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="provider-summary">
            <span className="summary-item">
              <CheckCircle2 size={14} />
              {providers.filter(p => p.configured).length} Active
            </span>
            <span className="summary-item inactive">
              <XCircle size={14} />
              {providers.filter(p => !p.configured).length} Not Configured
            </span>
          </div>
        </div>

        {/* AI & Trading Card */}
        <div className="card integrations-card">
          <h3><Zap size={18} /> AI & Trading Integrations</h3>
          
          <div className="integration-item">
            <div className="integration-header">
              <span className="integration-name">OpenRouter AI</span>
              <span className={`integration-status ${aiConfigured ? 'active' : 'inactive'}`}>
                {aiConfigured ? 'Connected' : 'Not Configured'}
              </span>
            </div>
            <p className="integration-desc">
              Powers AI plan compilation and portfolio insights. Set <code>VITE_OPENROUTER_API_KEY</code> to enable.
            </p>
          </div>

          <div className="integration-item">
            <div className="integration-header">
              <span className="integration-name">Alpaca Trading</span>
              <span className={`integration-status ${alpacaConfigured ? 'active' : 'inactive'}`}>
                {alpacaConfigured ? 'Connected' : 'Not Configured'}
              </span>
            </div>
            <p className="integration-desc">
              Paper/live trading integration. Set <code>VITE_ALPACA_API_KEY</code> and <code>VITE_ALPACA_API_SECRET</code>.
            </p>
          </div>
        </div>

        {/* Cache Info Card */}
        <div className="card cache-card">
          <h3><HardDrive size={18} /> Cache Status</h3>
          
          <div className="cache-info">
            <div className="cache-tier">
              <span className="tier-name">Memory Cache</span>
              <span className="tier-stats">
                {(cacheStats?.memory_prices ?? 0) + (cacheStats?.memory_quant ?? 0)} entries
              </span>
              <span className="tier-ttl">TTL: 2-5 min</span>
            </div>
            <div className="cache-tier">
              <span className="tier-name">SQLite Cache</span>
              <span className="tier-stats">
                {cacheStats?.db_stats ? `${cacheStats.db_stats[0] + cacheStats.db_stats[1] + cacheStats.db_stats[2]} entries` : 'N/A'}
              </span>
              <span className="tier-ttl">TTL: 1-24 hr</span>
            </div>
          </div>

          <p className="cache-note">
            Data is automatically cached and refreshed. No manual sync required.
          </p>
        </div>
      </div>

      {/* Advanced Section */}
      <div className="advanced-section">
        <button 
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Settings size={16} />
          Advanced Configuration
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAdvanced && (
          <div className="advanced-content">
            <div className="config-instructions">
              <h4>Environment Variables</h4>
              <p>Add these to your <code>.env</code> file in the project root:</p>
              <pre className="env-example">
{`# Market Data (at least one recommended)
VITE_ALPACA_API_KEY=your_key
VITE_ALPACA_API_SECRET=your_secret
VITE_FINNHUB_API_KEY=your_key
VITE_FMP_API_KEY=your_key
VITE_ALPHAVANTAGE_API_KEY=your_key
VITE_POLYGON_API_KEY=your_key

# AI Features
VITE_OPENROUTER_API_KEY=your_key

# Trading Mode
VITE_ALPACA_PAPER_TRADING=true`}
              </pre>
            </div>

            {healthReport && (
              <div className="health-details">
                <h4>System Health</h4>
                <div className="health-grid">
                  <div className="health-item">
                    <span className="health-label">Uptime</span>
                    <span className="health-value">{formatUptime(healthReport.uptime_seconds)}</span>
                  </div>
                  <div className="health-item">
                    <span className="health-label">Total Requests</span>
                    <span className="health-value">{healthReport.total_requests.toLocaleString()}</span>
                  </div>
                  <div className="health-item">
                    <span className="health-label">Avg Response</span>
                    <span className="health-value">{healthReport.avg_response_time_ms.toFixed(0)}ms</span>
                  </div>
                  <div className="health-item">
                    <span className="health-label">Error Rate</span>
                    <span className={`health-value ${healthReport.error_rate > 0.1 ? 'warning' : ''}`}>
                      {(healthReport.error_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {cacheStats?.provider_health && Object.keys(cacheStats.provider_health).length > 0 && (
              <div className="provider-health">
                <h4>Provider Health</h4>
                <div className="health-list">
                  {Object.entries(cacheStats.provider_health).map(([provider, [success, total]]) => (
                    <div key={provider} className="provider-health-item">
                      <span className="provider-name">{provider}</span>
                      <div className="health-bar">
                        <div 
                          className="health-fill" 
                          style={{ width: `${total > 0 ? (success / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="health-ratio">{success}/{total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
