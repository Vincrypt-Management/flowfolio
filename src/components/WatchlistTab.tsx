/**
 * Watchlist Tab Component
 * Manages watchlists (universes) with symbol tracking, price display, and quick actions
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '../services/tauri';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  BarChart3,
  TrendingUp,
  Search,
  ListFilter,
  Star,
  Ban,
  Clock,
} from 'lucide-react';
import './WatchlistTab.css';

const log = createLogger('WatchlistTab');

interface Universe {
  id: string;
  name: string;
  description: string;
  symbols: string[];
  tags: Record<string, string[]>;
  exclude_list: string[];
  created_at: string;
  updated_at: string;
}

interface WatchlistTabProps {
  onNavigate?: (tab: string, data?: Record<string, unknown>) => void;
}

interface SymbolPriceData {
  price: number;
  loading: boolean;
}

export function WatchlistTab({ onNavigate }: WatchlistTabProps) {
  const { addToast } = useToast();
  const isMountedRef = useRef(true);

  // Universe list state
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showExcludeListIds, setShowExcludeListIds] = useState<Set<string>>(new Set());

  // Price data keyed by symbol
  const [prices, setPrices] = useState<Record<string, SymbolPriceData>>({});

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSymbols, setCreateSymbols] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Add symbols state per universe
  const [addSymbolsInput, setAddSymbolsInput] = useState<Record<string, string>>({});
  const [addingSymbolsId, setAddingSymbolsId] = useState<string | null>(null);

  // Exclude list add input per universe
  const [excludeInput, setExcludeInput] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Total symbol count across all universes
  const totalSymbolCount = useMemo(() => {
    return universes.reduce((sum, u) => sum + u.symbols.length, 0);
  }, [universes]);

  useEffect(() => {
    isMountedRef.current = true;
    loadUniverses();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function loadUniverses() {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<Universe[]>('list_universes');
      if (isMountedRef.current) {
        setUniverses(result);
      }
    } catch (err) {
      log.error('Failed to load universes', err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load watchlists');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  const fetchPricesForUniverse = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;

    // Mark symbols as loading
    const loadingUpdate: Record<string, SymbolPriceData> = {};
    for (const sym of symbols) {
      if (!prices[sym]) {
        loadingUpdate[sym] = { price: 0, loading: true };
      }
    }
    if (Object.keys(loadingUpdate).length > 0) {
      setPrices(prev => ({ ...prev, ...loadingUpdate }));
    }

    try {
      const result = await invoke<Record<string, number>>('get_current_prices_batch', { symbols });
      if (isMountedRef.current) {
        const priceUpdate: Record<string, SymbolPriceData> = {};
        for (const [sym, price] of Object.entries(result)) {
          priceUpdate[sym] = { price, loading: false };
        }
        setPrices(prev => ({ ...prev, ...priceUpdate }));
      }
    } catch (err) {
      log.error('Failed to fetch prices', err);
      if (isMountedRef.current) {
        const errorUpdate: Record<string, SymbolPriceData> = {};
        for (const sym of symbols) {
          errorUpdate[sym] = { price: 0, loading: false };
        }
        setPrices(prev => ({ ...prev, ...errorUpdate }));
      }
    }
  }, [prices]);

  function toggleExpanded(id: string, symbols: string[]) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch prices when expanding
        fetchPricesForUniverse(symbols);
      }
      return next;
    });
  }

  function toggleExcludeList(id: string) {
    setShowExcludeListIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function parseSymbols(input: string): string[] {
    return input
      .toUpperCase()
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^[A-Z.]{1,10}$/.test(s));
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name) {
      addToast('Please enter a watchlist name', 'warning');
      return;
    }

    const symbols = parseSymbols(createSymbols);

    setIsCreating(true);
    try {
      await invoke<Universe>('create_universe', {
        name,
        description: createDescription.trim(),
        symbols,
      });
      addToast(`Watchlist "${name}" created`, 'success');
      setCreateName('');
      setCreateDescription('');
      setCreateSymbols('');
      setShowCreateForm(false);
      await loadUniverses();
    } catch (err) {
      log.error('Failed to create universe', err);
      addToast(err instanceof Error ? err.message : 'Failed to create watchlist', 'error');
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  }

  async function handleAddSymbols(universe: Universe) {
    const input = addSymbolsInput[universe.id] || '';
    const newSymbols = parseSymbols(input);
    if (newSymbols.length === 0) {
      addToast('Enter at least one valid symbol', 'warning');
      return;
    }

    const uniqueNew = newSymbols.filter(s => !universe.symbols.includes(s));
    if (uniqueNew.length === 0) {
      addToast('All symbols already in this watchlist', 'info');
      return;
    }

    setAddingSymbolsId(universe.id);
    try {
      const updatedSymbols = [...universe.symbols, ...uniqueNew];
      await invoke('update_universe_symbols', { id: universe.id, symbols: updatedSymbols });
      addToast(`Added ${uniqueNew.length} symbol(s) to "${universe.name}"`, 'success');
      setAddSymbolsInput(prev => ({ ...prev, [universe.id]: '' }));
      await loadUniverses();
      fetchPricesForUniverse(uniqueNew);
    } catch (err) {
      log.error('Failed to add symbols', err);
      addToast('Failed to add symbols', 'error');
    } finally {
      if (isMountedRef.current) {
        setAddingSymbolsId(null);
      }
    }
  }

  async function handleRemoveSymbol(universe: Universe, symbol: string) {
    const updatedSymbols = universe.symbols.filter(s => s !== symbol);
    try {
      await invoke('update_universe_symbols', { id: universe.id, symbols: updatedSymbols });
      addToast(`Removed ${symbol} from "${universe.name}"`, 'success');
      await loadUniverses();
    } catch (err) {
      log.error('Failed to remove symbol', err);
      addToast('Failed to remove symbol', 'error');
    }
  }

  async function handleAddToExcludeList(universe: Universe) {
    const input = excludeInput[universe.id] || '';
    const symbols = parseSymbols(input);
    if (symbols.length === 0) return;

    try {
      await invoke('add_to_exclude_list', { id: universe.id, symbols });
      addToast(`Added ${symbols.length} symbol(s) to exclude list`, 'success');
      setExcludeInput(prev => ({ ...prev, [universe.id]: '' }));
      await loadUniverses();
    } catch (err) {
      log.error('Failed to update exclude list', err);
      addToast('Failed to update exclude list', 'error');
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await invoke('delete_universe', { id });
      addToast(`Deleted watchlist "${name}"`, 'success');
      setDeletingId(null);
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadUniverses();
    } catch (err) {
      log.error('Failed to delete universe', err);
      addToast('Failed to delete watchlist', 'error');
    }
  }

  function handleCopySymbols(symbols: string[]) {
    navigator.clipboard.writeText(symbols.join(', ')).then(() => {
      addToast('Symbols copied to clipboard', 'success');
    }).catch(() => {
      addToast('Failed to copy symbols', 'error');
    });
  }

  function handleUseInRankings(universe: Universe) {
    onNavigate?.('vibe-studio', { symbols: universe.symbols, universeName: universe.name });
  }

  function handleRunScoring(universe: Universe) {
    onNavigate?.('vibe-studio', { symbols: universe.symbols, universeName: universe.name, autoScore: true });
  }

  function handleAnalyzeSymbol(symbol: string) {
    onNavigate?.('ticker-analysis', { symbol });
  }

  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function formatPrice(price: number): string {
    if (price === 0) return '--';
    return price.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  }

  // ── Render ──

  if (isLoading) {
    return (
      <div className="watchlist-tab">
        <div className="watchlist-loading">
          <Loader2 className="spin" size={32} />
          <span>Loading watchlists...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-tab">
      {/* Page Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <Star size={22} />
            Watchlists
          </h1>
          <p className="page-subtitle">
            Track symbol universes and monitor prices across your watchlists
          </p>
        </div>
        <div className="page-header-actions">
          <span className="tier-limit-badge">
            {totalSymbolCount} symbols
          </span>
          <button
            className="btn-icon"
            onClick={loadUniverses}
            title="Refresh watchlists"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus size={16} />
            New Watchlist
          </button>
        </div>
      </header>

      {/* Create Form */}
      {showCreateForm && (
        <div className="card watchlist-create-form">
          <h3 className="watchlist-create-title">Create New Watchlist</h3>
          <div className="watchlist-create-fields">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Tech Growth Picks"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-input"
                placeholder="Optional description"
                value={createDescription}
                onChange={e => setCreateDescription(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Symbols (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                placeholder="AAPL, MSFT, GOOGL, TSLA"
                value={createSymbols}
                onChange={e => setCreateSymbols(e.target.value)}
              />
            </div>
          </div>
          <div className="watchlist-create-actions">
            <button
              className="btn-secondary"
              onClick={() => setShowCreateForm(false)}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={isCreating || !createName.trim()}
            >
              {isCreating ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              Create Watchlist
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="watchlist-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={loadUniverses}>Retry</button>
        </div>
      )}

      {/* Empty State */}
      {!error && universes.length === 0 && (
        <div className="watchlist-empty">
          <ListFilter size={48} />
          <h3>No watchlists yet</h3>
          <p>Create your first watchlist to start tracking symbols and prices.</p>
          <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
            <Plus size={16} />
            Create Watchlist
          </button>
        </div>
      )}

      {/* Watchlist Grid */}
      {universes.length > 0 && (
        <div className="watchlist-grid">
          {universes.map(universe => {
            const isExpanded = expandedIds.has(universe.id);
            const showExclude = showExcludeListIds.has(universe.id);
            const isDeleting = deletingId === universe.id;

            return (
              <div key={universe.id} className={`card watchlist-card ${isExpanded ? 'expanded' : ''}`}>
                {/* Card Header */}
                <div
                  className="watchlist-card-header"
                  onClick={() => toggleExpanded(universe.id, universe.symbols)}
                >
                  <div className="watchlist-card-header-left">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <div className="watchlist-card-info">
                      <span className="watchlist-card-name">{universe.name}</span>
                      {universe.description && (
                        <span className="watchlist-card-desc">{universe.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="watchlist-card-header-right">
                    <span className="watchlist-card-count">
                      {universe.symbols.length} symbol{universe.symbols.length !== 1 ? 's' : ''}
                    </span>
                    <span className="watchlist-card-date">
                      <Clock size={12} />
                      {formatDate(universe.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Card Body (expanded) */}
                <div className={`watchlist-card-body ${isExpanded ? 'open' : ''}`}>
                  {isExpanded && (
                    <>
                      {/* Quick Actions */}
                      <div className="watchlist-quick-actions">
                        <button
                          className="btn-action"
                          onClick={() => handleUseInRankings(universe)}
                          title="Use in Rankings"
                        >
                          <BarChart3 size={14} />
                          Use in Rankings
                        </button>
                        <button
                          className="btn-action"
                          onClick={() => handleRunScoring(universe)}
                          title="Run Scoring"
                        >
                          <TrendingUp size={14} />
                          Run Scoring
                        </button>
                        <button
                          className="btn-action"
                          onClick={() => handleCopySymbols(universe.symbols)}
                          title="Copy symbols to clipboard"
                        >
                          <Copy size={14} />
                          Export
                        </button>
                        <button
                          className="btn-action btn-action-exclude"
                          onClick={() => toggleExcludeList(universe.id)}
                          title="Toggle exclude list"
                        >
                          {showExclude ? <EyeOff size={14} /> : <Eye size={14} />}
                          Excludes ({universe.exclude_list.length})
                        </button>
                        <div className="watchlist-action-spacer" />
                        {isDeleting ? (
                          <div className="watchlist-delete-confirm">
                            <span>Delete?</span>
                            <button
                              className="btn-danger-sm"
                              onClick={() => handleDelete(universe.id, universe.name)}
                            >
                              Yes
                            </button>
                            <button
                              className="btn-secondary-sm"
                              onClick={() => setDeletingId(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-action btn-action-danger"
                            onClick={() => setDeletingId(universe.id)}
                            title="Delete watchlist"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Symbol List */}
                      <div className="watchlist-symbol-list">
                        {universe.symbols.length === 0 && (
                          <div className="watchlist-symbol-empty">
                            No symbols yet. Add some below.
                          </div>
                        )}
                        {universe.symbols.map(symbol => {
                          const priceData = prices[symbol];
                          const isLoadingPrice = priceData?.loading ?? false;
                          const price = priceData?.price ?? 0;

                          return (
                            <div key={symbol} className="symbol-row">
                              <span className="symbol-name">{symbol}</span>
                              <span className="symbol-price">
                                {isLoadingPrice ? (
                                  <Loader2 className="spin" size={14} />
                                ) : (
                                  <span className={`price-badge ${price > 0 ? 'has-price' : ''}`}>
                                    {formatPrice(price)}
                                  </span>
                                )}
                              </span>
                              <div className="symbol-row-actions">
                                <button
                                  className="btn-symbol-action"
                                  onClick={() => handleAnalyzeSymbol(symbol)}
                                  title="Analyze"
                                >
                                  <Search size={14} />
                                </button>
                                <button
                                  className="btn-symbol-action btn-symbol-remove"
                                  onClick={() => handleRemoveSymbol(universe, symbol)}
                                  title="Remove"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Symbols Form */}
                      <div className="add-symbols-form">
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Add symbols: NVDA, AMD, INTC"
                          value={addSymbolsInput[universe.id] || ''}
                          onChange={e =>
                            setAddSymbolsInput(prev => ({ ...prev, [universe.id]: e.target.value }))
                          }
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddSymbols(universe);
                          }}
                        />
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleAddSymbols(universe)}
                          disabled={addingSymbolsId === universe.id}
                        >
                          {addingSymbolsId === universe.id ? (
                            <Loader2 className="spin" size={14} />
                          ) : (
                            <Plus size={14} />
                          )}
                          Add
                        </button>
                      </div>

                      {/* Exclude List */}
                      {showExclude && (
                        <div className="exclude-list">
                          <h4 className="exclude-list-title">
                            <Ban size={14} />
                            Exclude List
                          </h4>
                          {universe.exclude_list.length === 0 && (
                            <div className="exclude-list-empty">No excluded symbols.</div>
                          )}
                          {universe.exclude_list.map(symbol => (
                            <div key={symbol} className="exclude-list-item">
                              <span className="exclude-symbol">{symbol}</span>
                            </div>
                          ))}
                          <div className="add-symbols-form">
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Add to exclude list..."
                              value={excludeInput[universe.id] || ''}
                              onChange={e =>
                                setExcludeInput(prev => ({ ...prev, [universe.id]: e.target.value }))
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAddToExcludeList(universe);
                              }}
                            />
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => handleAddToExcludeList(universe)}
                            >
                              <Plus size={14} />
                              Exclude
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
