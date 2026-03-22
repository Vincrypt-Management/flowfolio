import { Download, Globe, Plus, Save, Trash2, Upload } from "lucide-react";
import { VibePlan } from "../../shared/types";
import { Universe } from "../../hooks/useAppState";

interface UniverseTabProps {
  universes: Universe[];
  newUniverseName: string;
  onNewUniverseNameChange: (value: string) => void;
  newUniverseSymbols: string;
  onNewUniverseSymbolsChange: (value: string) => void;
  onCreateUniverse: () => void;
  onDeleteUniverse: (id: string) => void;
  selectedUniverse: Universe | null;
  onSelectUniverse: (universe: Universe) => void;
  onUseInRankings: (universe: Universe) => void;
  savedPlans: string[];
  plan: VibePlan | null;
  onSavePlan: () => void;
  onExportData: () => void;
  onImportData: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadPlan: (planName: string) => void;
  onAddToast: (message: string, type: "success" | "error" | "warning" | "info") => void;
}

export function UniverseTab({
  universes,
  newUniverseName,
  onNewUniverseNameChange,
  newUniverseSymbols,
  onNewUniverseSymbolsChange,
  onCreateUniverse,
  onDeleteUniverse,
  selectedUniverse,
  onUseInRankings,
  savedPlans,
  plan,
  onSavePlan,
  onExportData,
  onImportData,
  onLoadPlan,
}: UniverseTabProps) {
  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Universe &amp; Watchlists</h1>
        <p className="page-subtitle">Manage your symbol universes and watchlists</p>
      </header>

      <div className="dashboard-grid">
        <div className="card">
          <h3><Plus size={20} /> Create New Universe</h3>
          <div className="form-group">
            <label>Universe Name</label>
            <input
              type="text"
              value={newUniverseName}
              onChange={(e) => onNewUniverseNameChange(e.target.value)}
              placeholder="e.g., Tech Leaders"
            />
          </div>
          <div className="form-group">
            <label>Symbols (comma-separated)</label>
            <input
              type="text"
              value={newUniverseSymbols}
              onChange={(e) => onNewUniverseSymbolsChange(e.target.value)}
              placeholder="e.g., AAPL, MSFT, GOOGL"
            />
          </div>
          <button className="btn-primary" onClick={onCreateUniverse}>
            <Plus size={16} /> Create Universe
          </button>
        </div>

        <div className="card">
          <h3><Download size={20} /> Export / Import</h3>
          <p className="text-muted mb-md">
            Export all your data or import from a backup
          </p>
          <div className="flex gap-md flex-wrap">
            <button className="btn-primary" onClick={onExportData}>
              <Download size={16} /> Export Data
            </button>
            <label className="btn-secondary cursor-pointer flex items-center gap-sm">
              <Upload size={16} /> Import Data
              <input
                type="file"
                accept=".json"
                onChange={onImportData}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {universes.length > 0 && (
        <div className="card mt-lg">
          <h3><Globe size={20} /> Your Universes ({universes.length})</h3>
          <div className="universe-list">
            {universes.map((universe) => (
              <div
                key={universe.id}
                className={`universe-item p-md mb-md bg-hover rounded ${selectedUniverse?.id === universe.id ? 'border-primary' : 'border'}`}
              >
                <div className="flex justify-between items-start mb-sm">
                  <div>
                    <h4 className="mt-0 mb-0">{universe.name}</h4>
                    <p className="text-muted text-sm mt-0 mb-0">
                      {universe.symbols.length} symbols
                    </p>
                  </div>
                  <div className="flex gap-sm">
                    <button
                      className="btn-small"
                      onClick={() => onUseInRankings(universe)}
                    >
                      Use in Rankings
                    </button>
                    <button
                      className="btn-small text-error"
                      onClick={() => onDeleteUniverse(universe.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-sm">
                  {universe.symbols.slice(0, 10).map((symbol) => (
                    <span key={symbol} className="tag">{symbol}</span>
                  ))}
                  {universe.symbols.length > 10 && (
                    <span className="tag">+{universe.symbols.length - 10} more</span>
                  )}
                </div>
                {universe.exclude_list.length > 0 && (
                  <p className="text-muted text-sm mt-sm mb-0">
                    Excluded: {universe.exclude_list.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {savedPlans.length > 0 && (
        <div className="card mt-lg">
          <h3><Save size={20} /> Saved Plans ({savedPlans.length})</h3>
          <div className="flex flex-wrap gap-md">
            {savedPlans.map((planName) => (
              <div key={planName} className="saved-plan-card">
                <h4 className="saved-plan-name">{planName}</h4>
                <button
                  className="btn-small"
                  onClick={() => onLoadPlan(planName)}
                >
                  Load Plan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="card mt-lg">
          <h3><Save size={20} /> Current Plan: {plan.name}</h3>
          <p className="text-muted mb-md">
            Save your current plan configuration for later use
          </p>
          <button className="btn-primary" onClick={onSavePlan}>
            <Save size={16} /> Save Current Plan
          </button>
        </div>
      )}
    </div>
  );
}
