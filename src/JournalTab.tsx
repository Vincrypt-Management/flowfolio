import { useState, useEffect } from "react";
import { invoke } from "./services/tauri";

interface JournalEntry {
  id: string;
  timestamp: string;
  event_type: string;
  title: string;
  content: string;
  plan_version?: string;
  metadata: Record<string, string>;
  tags: string[];
}

interface JournalStats {
  total_entries: number;
  entries_by_type: Record<string, number>;
  entries_by_month: Record<string, number>;
  common_tags: [string, number][];
}

export function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [selectedView, setSelectedView] = useState<"timeline" | "stats" | "add">("timeline");
  const [newEntry, setNewEntry] = useState({
    title: "",
    content: "",
    event_type: "reflection",
    tags: "",
  });
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (entries.length > 0) {
      calculateStats();
    }
  }, [entries]);

  async function calculateStats() {
    try {
      const journalStats = await invoke<JournalStats>("calculate_journal_stats", { entries });
      setStats(journalStats);
    } catch (error) {
      console.error("Error calculating stats:", error);
    }
  }

  async function addEntry() {
    if (!newEntry.title || !newEntry.content) {
      alert("Please fill in title and content");
      return;
    }

    try {
      const tags = newEntry.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const entry = await invoke<JournalEntry>("create_journal_entry", {
        eventType: newEntry.event_type,
        title: newEntry.title,
        content: newEntry.content,
        planVersion: null,
        tags,
      });

      setEntries([entry, ...entries]);
      setNewEntry({ title: "", content: "", event_type: "reflection", tags: "" });
      setSelectedView("timeline");
    } catch (error) {
      alert("Error creating entry: " + error);
    }
  }

  async function exportToMarkdown() {
    try {
      const markdown = await invoke<string>("export_journal_markdown", { entries });
      
      // Create a blob and download
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-${new Date().toISOString().split("T")[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Error exporting: " + error);
    }
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "trade_decision":
        return "💼";
      case "strategy_change":
        return "🎯";
      case "rebalance":
        return "⚖️";
      case "review":
        return "📊";
      case "reflection":
        return "💭";
      case "strategy_creation":
        return "🌟";
      default:
        return "📝";
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "trade_decision":
        return "#2196f3";
      case "strategy_change":
        return "#ff9800";
      case "rebalance":
        return "#9c27b0";
      case "review":
        return "#4caf50";
      case "reflection":
        return "#607d8b";
      case "strategy_creation":
        return "#e91e63";
      default:
        return "#757575";
    }
  };

  const filteredEntries =
    filterType === "all"
      ? entries
      : entries.filter((e) => e.event_type === filterType);

  return (
    <div className="journal-tab">
      <div className="journal-header">
        <h2>Investment Journal</h2>
        <p className="subtitle">Track decisions, learnings, and strategy evolution</p>
        <div className="header-actions">
          <button className="btn-secondary" onClick={exportToMarkdown}>
            Export to Markdown
          </button>
        </div>
      </div>

      <div className="view-tabs">
        <button
          className={selectedView === "timeline" ? "active" : ""}
          onClick={() => setSelectedView("timeline")}
        >
          Timeline ({entries.length})
        </button>
        <button
          className={selectedView === "stats" ? "active" : ""}
          onClick={() => setSelectedView("stats")}
        >
          Statistics
        </button>
        <button
          className={selectedView === "add" ? "active" : ""}
          onClick={() => setSelectedView("add")}
        >
          + Add Entry
        </button>
      </div>

      {selectedView === "timeline" && (
        <div className="timeline-view">
          <div className="filter-bar">
            <label>Filter by type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="strategy_creation">Strategy Creation</option>
              <option value="strategy_change">Strategy Change</option>
              <option value="trade_decision">Trade Decision</option>
              <option value="rebalance">Rebalance</option>
              <option value="review">Review</option>
              <option value="reflection">Reflection</option>
            </select>
          </div>

          <div className="entries-timeline">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="journal-entry-card"
                style={{ borderLeftColor: getEventColor(entry.event_type) }}
              >
                <div className="entry-header">
                  <div className="entry-icon">{getEventIcon(entry.event_type)}</div>
                  <div className="entry-meta">
                    <h3>{entry.title}</h3>
                    <div className="entry-info">
                      <span className="event-type">{entry.event_type.replace("_", " ")}</span>
                      <span className="entry-date">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="entry-content">{entry.content}</div>

                {Object.keys(entry.metadata).length > 0 && (
                  <div className="entry-metadata">
                    {Object.entries(entry.metadata).map(([key, value]) => (
                      <div key={key} className="metadata-item">
                        <strong>{key}:</strong> {value}
                      </div>
                    ))}
                  </div>
                )}

                {entry.tags.length > 0 && (
                  <div className="entry-tags">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {entry.plan_version && (
                  <div className="plan-version">Version: {entry.plan_version}</div>
                )}
              </div>
            ))}

            {filteredEntries.length === 0 && (
              <div className="empty-state">
                <p>No entries found for this filter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedView === "stats" && stats && (
        <div className="stats-view">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total_entries}</div>
              <div className="stat-label">Total Entries</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{Object.keys(stats.entries_by_type).length}</div>
              <div className="stat-label">Event Types</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.common_tags.length}</div>
              <div className="stat-label">Unique Tags</div>
            </div>
          </div>

          <div className="card">
            <h3>Entries by Type</h3>
            <div className="chart-list">
              {Object.entries(stats.entries_by_type)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="chart-item">
                    <div className="chart-label">
                      {getEventIcon(type)} {type.replace("_", " ")}
                    </div>
                    <div className="chart-bar-container">
                      <div
                        className="chart-bar"
                        style={{
                          width: `${(count / stats.total_entries) * 100}%`,
                          backgroundColor: getEventColor(type),
                        }}
                      ></div>
                    </div>
                    <div className="chart-value">{count}</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="card">
            <h3>Most Common Tags</h3>
            <div className="tags-list">
              {stats.common_tags.map(([tag, count]) => (
                <span key={tag} className="tag-stat">
                  {tag} <span className="tag-count">({count})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedView === "add" && (
        <div className="add-entry-view">
          <div className="card">
            <h3>Create New Entry</h3>

            <div className="form-group">
              <label>Entry Type</label>
              <select
                value={newEntry.event_type}
                onChange={(e) => setNewEntry({ ...newEntry, event_type: e.target.value })}
              >
                <option value="reflection">Reflection</option>
                <option value="trade_decision">Trade Decision</option>
                <option value="strategy_change">Strategy Change</option>
                <option value="rebalance">Rebalance</option>
                <option value="review">Review</option>
              </select>
            </div>

            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={newEntry.title}
                onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                placeholder="Brief title for this entry..."
              />
            </div>

            <div className="form-group">
              <label>Content</label>
              <textarea
                value={newEntry.content}
                onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                placeholder="Write your thoughts, decisions, or observations..."
                rows={8}
              />
            </div>

            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input
                type="text"
                value={newEntry.tags}
                onChange={(e) => setNewEntry({ ...newEntry, tags: e.target.value })}
                placeholder="e.g., lesson, psychology, strategy"
              />
            </div>

            <button className="btn-primary" onClick={addEntry}>
              Create Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
