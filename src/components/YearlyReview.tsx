import { useState } from "react";
import { invoke } from "../services/tauri";
import { useToast } from "./Toast";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Target,
  TrendingUp,
  Database,
  Settings,
  Shield,
  Receipt,
} from "lucide-react";

interface ReviewItem {
  category: string;
  question: string;
  status: string;
  notes: string;
}

interface ReviewSummary {
  total_items: number;
  passed: number;
  needs_review: number;
  needs_action: number;
  overall_health: string;
}

interface YearlyReview {
  year: number;
  date: string;
  portfolio_name: string;
  checklist: ReviewItem[];
  summary: ReviewSummary;
  recommendations: string[];
}

interface YearlyReviewProps {
  portfolioName?: string;
}

export function YearlyReviewComponent({ portfolioName = "My Portfolio" }: YearlyReviewProps) {
  const { addToast } = useToast();
  const [review, setReview] = useState<YearlyReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [itemStatuses, setItemStatuses] = useState<Record<number, string>>({});

  async function generateReview() {
    setIsLoading(true);
    try {
      const result = await invoke<YearlyReview>("generate_yearly_review", {
        portfolioName,
        year: selectedYear,
      });
      setReview(result);
      // Initialize item statuses from the review
      const statuses: Record<number, string> = {};
      result.checklist.forEach((item, index) => {
        statuses[index] = item.status;
      });
      setItemStatuses(statuses);
      // Expand all categories by default
      const categories = new Set(result.checklist.map(item => item.category));
      setExpandedCategories(categories);
    } catch (error) {
      addToast("Error generating review: " + error, "error");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleCategory(category: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  }

  function updateItemStatus(index: number, status: string) {
    setItemStatuses({ ...itemStatuses, [index]: status });
  }

  function getCategoryIcon(category: string) {
    switch (category) {
      case "Strategy":
        return <Target size={18} />;
      case "Performance":
        return <TrendingUp size={18} />;
      case "Portfolio":
        return <Settings size={18} />;
      case "Data":
        return <Database size={18} />;
      case "Process":
        return <ClipboardCheck size={18} />;
      case "Risk":
        return <Shield size={18} />;
      case "Tax":
        return <Receipt size={18} />;
      default:
        return <ClipboardCheck size={18} />;
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "PASS":
        return <CheckCircle2 size={18} className="status-icon pass" />;
      case "ACTION_NEEDED":
        return <AlertCircle size={18} className="status-icon action" />;
      case "REVIEW":
      default:
        return <AlertTriangle size={18} className="status-icon review" />;
    }
  }

  function getHealthColor(health: string) {
    switch (health) {
      case "Excellent":
        return "var(--success)";
      case "Good":
        return "var(--accent-primary)";
      case "Fair":
        return "var(--warning)";
      case "Needs Attention":
        return "var(--error)";
      default:
        return "var(--text-muted)";
    }
  }

  function calculateUpdatedSummary(): ReviewSummary {
    if (!review) {
      return { total_items: 0, passed: 0, needs_review: 0, needs_action: 0, overall_health: "Unknown" };
    }
    
    const total_items = review.checklist.length;
    const passed = Object.values(itemStatuses).filter(s => s === "PASS").length;
    const needs_review = Object.values(itemStatuses).filter(s => s === "REVIEW").length;
    const needs_action = Object.values(itemStatuses).filter(s => s === "ACTION_NEEDED").length;
    
    const pass_rate = (passed / total_items) * 100;
    let overall_health = "Needs Attention";
    if (pass_rate > 80) overall_health = "Excellent";
    else if (pass_rate > 60) overall_health = "Good";
    else if (pass_rate > 40) overall_health = "Fair";
    
    return { total_items, passed, needs_review, needs_action, overall_health };
  }

  function exportReviewMarkdown() {
    if (!review) return;
    
    const summary = calculateUpdatedSummary();
    let markdown = `# Yearly Review - ${review.year}\n\n`;
    markdown += `**Portfolio:** ${review.portfolio_name}\n`;
    markdown += `**Date:** ${new Date(review.date).toLocaleDateString()}\n`;
    markdown += `**Overall Health:** ${summary.overall_health}\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- Total Items: ${summary.total_items}\n`;
    markdown += `- Passed: ${summary.passed}\n`;
    markdown += `- Needs Review: ${summary.needs_review}\n`;
    markdown += `- Needs Action: ${summary.needs_action}\n\n`;
    
    markdown += `## Checklist\n\n`;
    
    const categories = [...new Set(review.checklist.map(item => item.category))];
    categories.forEach(category => {
      markdown += `### ${category}\n\n`;
      review.checklist.forEach((item, index) => {
        if (item.category === category) {
          const status = itemStatuses[index] || item.status;
          const statusEmoji = status === "PASS" ? "✅" : status === "ACTION_NEEDED" ? "🚨" : "⚠️";
          markdown += `- ${statusEmoji} **${item.question}**\n`;
          markdown += `  - Status: ${status}\n`;
          markdown += `  - Notes: ${item.notes}\n\n`;
        }
      });
    });
    
    markdown += `## Recommendations\n\n`;
    review.recommendations.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    
    // Download
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yearly-review-${review.year}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentSummary = review ? calculateUpdatedSummary() : null;
  const groupedItems = review ? review.checklist.reduce((acc, item, index) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push({ ...item, index });
    return acc;
  }, {} as Record<string, Array<ReviewItem & { index: number }>>) : {};

  return (
    <div className="yearly-review">
      <div className="review-header">
        <div className="header-left">
          <ClipboardCheck size={24} />
          <div>
            <h3>Yearly Review Checklist</h3>
            <p>Comprehensive annual strategy and portfolio review</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="year-selector">
            <Calendar size={16} />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {[...Array(5)].map((_, i) => {
                const year = new Date().getFullYear() - i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
          <button
            className="btn-primary"
            onClick={generateReview}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw size={16} className="spinning" /> Generating...
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Generate Review
              </>
            )}
          </button>
        </div>
      </div>

      {review && currentSummary && (
        <>
          {/* Summary Cards */}
          <div className="review-summary-grid">
            <div className="summary-card health" style={{ borderColor: getHealthColor(currentSummary.overall_health) }}>
              <div className="summary-label">Overall Health</div>
              <div className="summary-value" style={{ color: getHealthColor(currentSummary.overall_health) }}>
                {currentSummary.overall_health}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Items</div>
              <div className="summary-value">{currentSummary.total_items}</div>
            </div>
            <div className="summary-card pass">
              <CheckCircle2 size={20} />
              <div>
                <div className="summary-label">Passed</div>
                <div className="summary-value">{currentSummary.passed}</div>
              </div>
            </div>
            <div className="summary-card review">
              <AlertTriangle size={20} />
              <div>
                <div className="summary-label">Needs Review</div>
                <div className="summary-value">{currentSummary.needs_review}</div>
              </div>
            </div>
            <div className="summary-card action">
              <AlertCircle size={20} />
              <div>
                <div className="summary-label">Action Needed</div>
                <div className="summary-value">{currentSummary.needs_action}</div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="review-progress">
            <div className="progress-label">
              <span>Completion Progress</span>
              <span>{Math.round((currentSummary.passed / currentSummary.total_items) * 100)}%</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill pass" 
                style={{ width: `${(currentSummary.passed / currentSummary.total_items) * 100}%` }}
              />
              <div 
                className="progress-fill review" 
                style={{ width: `${(currentSummary.needs_review / currentSummary.total_items) * 100}%` }}
              />
              <div 
                className="progress-fill action" 
                style={{ width: `${(currentSummary.needs_action / currentSummary.total_items) * 100}%` }}
              />
            </div>
            <div className="progress-legend">
              <span className="legend-item pass"><span className="dot"></span> Passed</span>
              <span className="legend-item review"><span className="dot"></span> Review</span>
              <span className="legend-item action"><span className="dot"></span> Action</span>
            </div>
          </div>

          {/* Checklist by Category */}
          <div className="checklist-categories">
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category} className="category-section">
                <button 
                  className="category-header"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="category-title">
                    {getCategoryIcon(category)}
                    <span>{category}</span>
                    <span className="category-count">
                      {items.filter(i => itemStatuses[i.index] === "PASS").length}/{items.length}
                    </span>
                  </div>
                  {expandedCategories.has(category) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                
                {expandedCategories.has(category) && (
                  <div className="category-items">
                    {items.map((item) => (
                      <div key={item.index} className={`checklist-item ${itemStatuses[item.index]?.toLowerCase()}`}>
                        <div className="item-main">
                          {getStatusIcon(itemStatuses[item.index] || item.status)}
                          <div className="item-content">
                            <div className="item-question">{item.question}</div>
                            <div className="item-notes">{item.notes}</div>
                          </div>
                        </div>
                        <div className="item-actions">
                          <select
                            value={itemStatuses[item.index] || item.status}
                            onChange={(e) => updateItemStatus(item.index, e.target.value)}
                            className={`status-select ${(itemStatuses[item.index] || item.status).toLowerCase()}`}
                          >
                            <option value="PASS">✓ Pass</option>
                            <option value="REVIEW">⚠ Review</option>
                            <option value="ACTION_NEEDED">✗ Action Needed</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div className="recommendations-section">
            <div className="section-header">
              <Lightbulb size={20} />
              <h4>Recommendations</h4>
            </div>
            <ul className="recommendations-list">
              {review.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>

          {/* Export Button */}
          <div className="review-footer">
            <button className="btn-secondary" onClick={exportReviewMarkdown}>
              <Download size={16} /> Export Review to Markdown
            </button>
            <span className="review-date">
              Generated: {new Date(review.date).toLocaleString()}
            </span>
          </div>
        </>
      )}

      {!review && !isLoading && (
        <div className="empty-state">
          <ClipboardCheck size={48} />
          <h4>Start Your Yearly Review</h4>
          <p>
            Generate a comprehensive checklist to review your investment strategy,
            portfolio performance, risk management, and more.
          </p>
          <button className="btn-primary" onClick={generateReview}>
            <RefreshCw size={16} /> Generate {selectedYear} Review
          </button>
        </div>
      )}
    </div>
  );
}

export default YearlyReviewComponent;
