import { Download, Globe, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button, IconButton, Input, Tag, FileUpload } from "@flowfolio/ui";
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
  onImportFile: (file: File) => void;
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
  onImportFile,
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
            <Input
              type="text"
              value={newUniverseName}
              onChange={(e) => onNewUniverseNameChange(e.target.value)}
              placeholder="e.g., Tech Leaders"
            />
          </div>
          <div className="form-group">
            <label>Symbols (comma-separated)</label>
            <Input
              type="text"
              value={newUniverseSymbols}
              onChange={(e) => onNewUniverseSymbolsChange(e.target.value)}
              placeholder="e.g., AAPL, MSFT, GOOGL"
            />
          </div>
          <Button variant="primary" onClick={onCreateUniverse} leftIcon={<Plus size={14} />}>
            Create Universe
          </Button>
        </div>

        <div className="card">
          <h3><Download size={20} /> Export / Import</h3>
          <p className="text-muted mb-md">
            Export all your data or import from a backup
          </p>
          <div className="flex gap-md flex-wrap">
            <Button variant="primary" onClick={onExportData} leftIcon={<Download size={14} />}>
              Export Data
            </Button>
            <FileUpload
              variant="secondary"
              accept=".json"
              leftIcon={<Upload size={14} />}
              onFile={(file) => file && onImportFile(file)}
            >
              Import Data
            </FileUpload>
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onUseInRankings(universe)}
                    >
                      Use in Rankings
                    </Button>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteUniverse(universe.id)}
                      aria-label={`Delete universe ${universe.name}`}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <div className="flex flex-wrap gap-sm">
                  {universe.symbols.slice(0, 10).map((symbol) => (
                    <Tag key={symbol} label={symbol} />
                  ))}
                  {universe.symbols.length > 10 && (
                    <Tag label={`+${universe.symbols.length - 10} more`} />
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onLoadPlan(planName)}
                >
                  Load Plan
                </Button>
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
          <Button variant="primary" onClick={onSavePlan} leftIcon={<Save size={14} />}>
            Save Current Plan
          </Button>
        </div>
      )}
    </div>
  );
}
