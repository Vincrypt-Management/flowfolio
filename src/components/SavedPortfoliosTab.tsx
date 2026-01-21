/**
 * Saved Portfolios Tab Component
 * Displays all saved portfolios with options to load, view, and delete
 */

import { useState, useEffect, useRef } from 'react';
import { invoke } from '../services/tauri';
import { GeneratedPortfolio } from '../services/portfolioAgent';
import {
  FolderOpen,
  Trash2,
  Eye,
  RefreshCw,
  Loader2,
  Calendar,
  PieChart,
  TrendingUp,
  AlertTriangle,
  Download,
  Search,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import './SavedPortfoliosTab.css';
import { saveFile } from '../shared/utils/fileSystem';

interface SavedPortfolioInfo {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface SavedPortfoliosTabProps {
  onLoadPortfolio?: (portfolio: GeneratedPortfolio) => void;
}

export function SavedPortfoliosTab({ onLoadPortfolio }: SavedPortfoliosTabProps) {
  const [portfolios, setPortfolios] = useState<SavedPortfolioInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [selectedPortfolio, setSelectedPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadPortfolios();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function loadPortfolios() {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await invoke<SavedPortfolioInfo[]>('list_saved_portfolios');
      if (isMountedRef.current) {
        setPortfolios(result);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load portfolios');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function handleLoadPortfolio(id: string) {
    setIsLoadingDetails(true);
    
    try {
      const portfolio = await invoke<GeneratedPortfolio>('load_generated_portfolio', { id });
      if (isMountedRef.current) {
        setSelectedPortfolio(portfolio);
        if (onLoadPortfolio) {
          onLoadPortfolio(portfolio);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        alert('Failed to load portfolio: ' + err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDetails(false);
      }
    }
  }

  async function handleDeletePortfolio(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      await invoke('delete_saved_portfolio', { id });
      if (isMountedRef.current) {
        setPortfolios(prev => prev.filter(p => p.id !== id));
        if (selectedPortfolio && selectedPortfolio.title === name) {
          setSelectedPortfolio(null);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        alert('Failed to delete portfolio: ' + err);
      }
    }
  }

  async function handleExportPortfolio(id: string) {
    try {
      const portfolio = await invoke<GeneratedPortfolio>('load_generated_portfolio', { id });
      const filename = `${portfolio.title?.replace(/\s+/g, '_') || 'portfolio'}_${new Date().toISOString().split('T')[0]}.json`;
      
      await saveFile(
        JSON.stringify(portfolio, null, 2),
        filename,
        'application/json'
      );
    } catch (err) {
      alert('Failed to export portfolio: ' + err);
    }
  }

  // Filter and sort portfolios
  const filteredPortfolios = portfolios
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      switch (sortOrder) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  return (
    <div className="saved-portfolios-tab animate-fade-in">
      <header className="page-header">
        <div className="header-content">
          <h1 className="page-title">
            <FolderOpen size={28} />
            Saved Portfolios
          </h1>
          <p className="page-subtitle">
            View and manage your saved AI-generated portfolios
          </p>
        </div>
        <button className="btn-refresh" onClick={loadPortfolios} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
          Refresh
        </button>
      </header>

      {/* Search and Sort Bar */}
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search portfolios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="sort-options">
          <button 
            className={`sort-btn ${sortOrder === 'newest' ? 'active' : ''}`}
            onClick={() => setSortOrder('newest')}
          >
            <SortDesc size={14} /> Newest
          </button>
          <button 
            className={`sort-btn ${sortOrder === 'oldest' ? 'active' : ''}`}
            onClick={() => setSortOrder('oldest')}
          >
            <SortAsc size={14} /> Oldest
          </button>
          <button 
            className={`sort-btn ${sortOrder === 'name' ? 'active' : ''}`}
            onClick={() => setSortOrder('name')}
          >
            Name
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={loadPortfolios}>Retry</button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="loading-state">
          <Loader2 size={32} className="spinning" />
          <span>Loading portfolios...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && portfolios.length === 0 && (
        <div className="empty-state">
          <FolderOpen size={48} />
          <h3>No Saved Portfolios</h3>
          <p>Generate a portfolio in Vibe Studio and click "Save" to save it here.</p>
        </div>
      )}

      {/* Portfolio List */}
      {!isLoading && filteredPortfolios.length > 0 && (
        <div className="portfolios-grid">
          {filteredPortfolios.map((portfolio) => (
            <div 
              key={portfolio.id} 
              className={`portfolio-card ${selectedPortfolio?.title === portfolio.name ? 'selected' : ''}`}
            >
              <div className="card-header">
                <div className="card-icon">
                  <PieChart size={20} />
                </div>
                <div className="card-title">
                  <h3>{portfolio.name}</h3>
                  <span className="card-date">
                    <Calendar size={12} />
                    {new Date(portfolio.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              <div className="card-actions">
                <button 
                  className="btn-action primary"
                  onClick={() => handleLoadPortfolio(portfolio.id)}
                  disabled={isLoadingDetails}
                  title="Load Portfolio"
                >
                  <Eye size={14} />
                  Load
                </button>
                <button 
                  className="btn-action"
                  onClick={() => handleExportPortfolio(portfolio.id)}
                  title="Export as JSON"
                >
                  <Download size={14} />
                </button>
                <button 
                  className="btn-action danger"
                  onClick={() => handleDeletePortfolio(portfolio.id, portfolio.name)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {!isLoading && portfolios.length > 0 && filteredPortfolios.length === 0 && (
        <div className="no-results">
          <Search size={24} />
          <p>No portfolios match "{searchQuery}"</p>
        </div>
      )}

      {/* Portfolio Preview */}
      {selectedPortfolio && (
        <div className="portfolio-preview">
          <div className="preview-header">
            <h3><TrendingUp size={18} /> {selectedPortfolio.title}</h3>
            <button onClick={() => setSelectedPortfolio(null)}>×</button>
          </div>
          <div className="preview-content">
            <p className="preview-description">{selectedPortfolio.description}</p>
            <div className="preview-meta">
              <span>Risk: {selectedPortfolio.riskLevel}</span>
              <span>Horizon: {selectedPortfolio.timeHorizon}</span>
              <span>Assets: {selectedPortfolio.assets?.length || 0}</span>
            </div>
            {selectedPortfolio.assets && selectedPortfolio.assets.length > 0 && (
              <div className="preview-assets">
                <h4>Top Holdings</h4>
                <div className="assets-list">
                  {selectedPortfolio.assets.slice(0, 5).map((asset, idx) => (
                    <div key={idx} className="asset-row">
                      <span className="asset-symbol">{asset.symbol}</span>
                      <span className="asset-allocation">{asset.allocation.toFixed(1)}%</span>
                    </div>
                  ))}
                  {selectedPortfolio.assets.length > 5 && (
                    <span className="more-assets">+{selectedPortfolio.assets.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Footer */}
      <div className="stats-footer">
        <span>Total: {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''}</span>
        {searchQuery && <span>Showing: {filteredPortfolios.length} result{filteredPortfolios.length !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

export default SavedPortfoliosTab;
