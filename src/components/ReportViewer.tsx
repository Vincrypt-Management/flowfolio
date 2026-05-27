/**
 * Report Viewer Component
 * Displays AI-generated analysis reports with export functionality
 */

import { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Shield,
  Target,
  X,
} from 'lucide-react';
import type { AnalysisReport, ActionItem } from '../services/analysisReport';
import { Button, IconButton, Tooltip, CopyButton, Accordion, type AccordionItem } from '@flowfolio/ui';
import './ReportViewer.css';

interface ReportViewerProps {
  report: AnalysisReport;
  onClose?: () => void;
  onExportMarkdown?: () => string | null;
  onExportJSON?: () => string | null;
}

export default function ReportViewer({ 
  report, 
  onClose, 
  onExportMarkdown, 
  onExportJSON 
}: ReportViewerProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['Executive Summary']);

  const allSectionIds = useMemo(() => {
    const ids = ['Executive Summary', ...report.sections.map(s => s.title)];
    if (report.keyTakeaways.length > 0) ids.push('Key Takeaways');
    if (report.actionItems.length > 0) ids.push('Action Items');
    if (report.riskWarnings.length > 0) ids.push('Risk Warnings');
    if (report.marketContext) ids.push('Market Context');
    return ids;
  }, [report]);

  const expandAll = () => setExpandedSections(allSectionIds);
  const collapseAll = () => setExpandedSections([]);

  const handleDownloadMarkdown = () => {
    if (onExportMarkdown) {
      const markdown = onExportMarkdown();
      if (markdown) {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleDownloadJSON = () => {
    if (onExportJSON) {
      const json = onExportJSON();
      if (json) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const getSentimentIcon = (sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed') => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="sentiment-icon positive" size={16} />;
      case 'negative': return <TrendingDown className="sentiment-icon negative" size={16} />;
      case 'mixed': return <AlertTriangle className="sentiment-icon mixed" size={16} />;
      default: return <Minus className="sentiment-icon neutral" size={16} />;
    }
  };

  const getPriorityClass = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="report-viewer">
      {/* Header */}
      <div className="report-header">
        <div className="report-title-section">
          <FileText size={24} />
          <div>
            <h2>{report.title}</h2>
            <span className="report-meta">
              <Clock size={14} />
              Generated: {formatDate(report.generatedAt)}
              <span className="confidence-badge">
                Confidence: {report.metadata.confidence}%
              </span>
            </span>
          </div>
        </div>
        
        <div className="report-actions">
          <CopyButton
            variant="secondary"
            size="sm"
            text={() => onExportMarkdown?.() ?? ''}
            disabled={!onExportMarkdown}
            aria-label="Copy report as Markdown"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadMarkdown}
            leftIcon={<Download size={14} />}
            title="Download Markdown"
          >
            MD
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadJSON}
            leftIcon={<Download size={14} />}
            title="Download JSON"
          >
            JSON
          </Button>
          {onClose && (
            <Tooltip content="Close report" side="bottom">
              <IconButton variant="ghost" size="md" onClick={onClose} aria-label="Close report">
                <X size={16} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="report-controls">
        <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
        <span className="section-count">
          {report.sections.length + 1} sections
        </span>
      </div>

      <Accordion
        className="report-accordion"
        allowMultiple
        openIds={expandedSections}
        onOpenChange={setExpandedSections}
        items={(() => {
          const items: AccordionItem[] = [];

          items.push({
            id: 'Executive Summary',
            title: (
              <span className="section-title">
                <Target size={18} />
                <h3>Executive Summary</h3>
              </span>
            ),
            content: (
              <div className="section-content executive-summary">
                <div className="summary-text">{report.executiveSummary}</div>
              </div>
            ),
          });

          report.sections.forEach((section, index) => {
            items.push({
              id: section.title,
              title: (
                <span className="section-title">
                  {getSentimentIcon(section.sentiment)}
                  <h3>{section.title}</h3>
                </span>
              ),
              content: (
                <div key={index} className="section-content">
                  <div className="section-text">{section.content}</div>
                  {section.highlights && section.highlights.length > 0 && (
                    <div className="section-highlights">
                      <h4>Key Points</h4>
                      <ul>
                        {section.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {section.metrics && Object.keys(section.metrics).length > 0 && (
                    <div className="section-metrics">
                      {Object.entries(section.metrics).map(([key, value]) => (
                        <div key={key} className="metric-item">
                          <span className="metric-label">{key}</span>
                          <span className="metric-value">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            });
          });

          if (report.keyTakeaways.length > 0) {
            items.push({
              id: 'Key Takeaways',
              title: (
                <span className="section-title">
                  <Target size={18} />
                  <h3>Key Takeaways</h3>
                </span>
              ),
              content: (
                <div className="section-content takeaways-section">
                  <ul className="takeaways-list">
                    {report.keyTakeaways.map((takeaway, index) => (
                      <li key={index}>{takeaway}</li>
                    ))}
                  </ul>
                </div>
              ),
            });
          }

          if (report.actionItems.length > 0) {
            items.push({
              id: 'Action Items',
              title: (
                <span className="section-title">
                  <Target size={18} />
                  <h3>Action Items</h3>
                  <span className="action-count">{report.actionItems.length}</span>
                </span>
              ),
              content: (
                <div className="section-content actions-section">
                  <div className="action-items-grid">
                    {report.actionItems.map((item, index) => (
                      <div key={index} className={`action-item ${getPriorityClass(item.priority)}`}>
                        <div className="action-header">
                          <span className={`priority-badge ${item.priority}`}>
                            {item.priority.toUpperCase()}
                          </span>
                          <span className="action-timeline">{item.timeline}</span>
                        </div>
                        <p className="action-text">{item.action}</p>
                        {item.rationale && (
                          <p className="action-rationale">{item.rationale}</p>
                        )}
                        {item.expectedImpact && (
                          <p className="action-impact">
                            <strong>Expected Impact:</strong> {item.expectedImpact}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ),
            });
          }

          if (report.riskWarnings.length > 0) {
            items.push({
              id: 'Risk Warnings',
              title: (
                <span className="section-title">
                  <Shield size={18} />
                  <h3>Risk Warnings</h3>
                </span>
              ),
              content: (
                <div className="section-content risk-section">
                  <ul className="risk-list">
                    {report.riskWarnings.map((warning, index) => (
                      <li key={index}>
                        <AlertTriangle size={14} />
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            });
          }

          if (report.marketContext) {
            items.push({
              id: 'Market Context',
              title: (
                <span className="section-title">
                  <TrendingUp size={18} />
                  <h3>Market Context</h3>
                </span>
              ),
              content: (
                <div className="section-content context-section">
                  <p>{report.marketContext}</p>
                </div>
              ),
            });
          }

          return items;
        })()}
      />

      {/* Disclaimer */}
      <div className="report-disclaimer">
        <p>{report.disclaimer}</p>
        <div className="report-metadata">
          <span>Data as of: {formatDate(report.metadata.dataAsOf)}</span>
          <span>Analysis Depth: {report.metadata.analysisDepth}</span>
          <span>Generation Time: {report.metadata.generationTimeMs}ms</span>
        </div>
      </div>
    </div>
  );
}
