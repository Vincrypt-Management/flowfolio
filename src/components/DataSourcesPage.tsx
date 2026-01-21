import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  Trash2,
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

interface DataSourcesPageProps {
  onSyncComplete?: () => void;
}

export function DataSourcesPage({ onSyncComplete }: DataSourcesPageProps) {
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('flowfolio_last_sync');
  });
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

  const loadData = useCallback(async () => {
    try {
      // Load cache stats
      const stats = await invoke<CacheStats>('get_cache_stats');
      setCacheStats(stats);

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
    } catch (error) {
      console.error('Failed to load data source info:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const result = await invoke<ConnectionTestResult>('test_data_connection');
      setConnectionResult(result);
    } catch (error) {
      console.error('Connection test failed:', error);
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
    } finally {
      setIsTestingConnection(false);
    }
  };

  const syncData = async () => {
    setIsSyncing(true);
    try {
      // Prefetch common symbols
      const defaultSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'V', 
                             'JNJ', 'UNH', 'HD', 'PG', 'MA', 'DIS', 'ADBE', 'CRM', 'NFLX', 'PYPL'];
      await invoke('prefetch_symbols', { symbols: defaultSymbols });
      
      const now = new Date().toISOString();
      setLastSyncTime(now);
      localStorage.setItem('flowfolio_last_sync', now);
      
      // Reload stats
      await loadData();
      onSyncComplete?.();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const clearCache = async () => {
    if (!confirm('Are you sure you want to clear all cached data? This will require re-fetching market data.')) {
      return;
    }
    
    setIsClearing(true);
    try {
      await invoke('clear_all_caches');
      await loadData();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const getStatusColor = (configured: boolean) => configured ? 'var(--success)' : 'var(--text-dim)';
  const getStatusIcon = (configured: boolean) => configured ? <CheckCircle2 size={16} /> : <XCircle size={16} />;

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="data-sources-page animate-fade-in">
      <header className="page-header">
        <div className="header-content">
          <h1 className="page-title">
            <Database size={28} />
            Data Sources
          </h1>
          <p className="page-subtitle">Manage market data providers and cache</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={loadData}
            title="Refresh stats"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {/* Connection Status Banner */}
      <div className={`connection-banner ${connectionResult?.status === 'connected' ? 'connected' : connectionResult?.status === 'failed' ? 'failed' : 'unknown'}`}>
        <div className="banner-icon">
          {connectionResult?.status === 'connected' ? <Wifi size={24} /> : connectionResult?.status === 'failed' ? <WifiOff size={24} /> : <Activity size={24} />}
        </div>
        <div className="banner-content">
          <h3>
            {connectionResult?.status === 'connected' 
              ? 'All Systems Operational' 
              : connectionResult?.status === 'failed' 
                ? 'Connection Issues Detected' 
                : 'Connection Status Unknown'}
          </h3>
          <p>
            {connectionResult 
              ? `Test: ${connectionResult.test_symbol} @ $${connectionResult.price.toFixed(2)} | Signal: ${connectionResult.signal}`
              : 'Run a connection test to verify data sources'}
          </p>
        </div>
        <button 
          className="btn-primary"
          onClick={testConnection}
          disabled={isTestingConnection}
        >
          {isTestingConnection ? <RefreshCw size={16} className="spinning" /> : <Zap size={16} />}
          {isTestingConnection ? 'Testing...' : 'Test Connection'}
        </button>
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
          <div className="stat-icon"><Clock size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Never'}</span>
            <span className="stat-label">Last Sync</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Activity size={20} /></div>
          <div className="stat-content">
            <span className="stat-value">{healthReport ? `${(healthReport.cache_hit_rate * 100).toFixed(0)}%` : '--'}</span>
            <span className="stat-label">Cache Hit Rate</span>
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

        {/* Cache Management Card */}
        <div className="card cache-card">
          <h3><HardDrive size={18} /> Cache Management</h3>
          
          <div className="cache-info">
            <div className="cache-tier">
              <span className="tier-name">Memory Cache</span>
              <span className="tier-stats">
                {(cacheStats?.memory_prices ?? 0) + (cacheStats?.memory_quant ?? 0)} entries
              </span>
              <span className="tier-ttl">TTL: 2-5 minutes</span>
            </div>
            <div className="cache-tier">
              <span className="tier-name">SQLite Cache</span>
              <span className="tier-stats">
                {cacheStats?.db_stats ? `${cacheStats.db_stats[0] + cacheStats.db_stats[1] + cacheStats.db_stats[2]} entries` : 'N/A'}
              </span>
              <span className="tier-ttl">TTL: 1-24 hours</span>
            </div>
          </div>

          <div className="cache-actions">
            <button 
              className="btn-primary"
              onClick={syncData}
              disabled={isSyncing}
            >
              {isSyncing ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
              {isSyncing ? 'Syncing...' : 'Sync Data'}
            </button>
            <button 
              className="btn-secondary btn-danger"
              onClick={clearCache}
              disabled={isClearing}
            >
              <Trash2 size={16} />
              {isClearing ? 'Clearing...' : 'Clear Cache'}
            </button>
          </div>
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
