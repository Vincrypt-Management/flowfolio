/**
 * Report Viewer Component
 * Displays AI-generated analysis reports with export functionality
 */

import { useState } from 'react';
import {
  FileText,
  Download,
  Copy,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Clock,
  Shield,
  Target,
  X,
} from 'lucide-react';
import type { AnalysisReport, ActionItem } from '../services/analysisReport';
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Executive Summary']));
  const [copied, setCopied] = useState(false);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allTitles = report.sections.map(s => s.title);
    setExpandedSections(new Set(['Executive Summary', ...allTitles]));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const handleCopyMarkdown = async () => {
    if (onExportMarkdown) {
      const markdown = onExportMarkdown();
      if (markdown) {
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

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
          <button 
            className="btn-report-action" 
            onClick={handleCopyMarkdown}
            title="Copy as Markdown"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button 
            className="btn-report-action" 
            onClick={handleDownloadMarkdown}
            title="Download Markdown"
          >
            <Download size={16} />
            MD
          </button>
          <button 
            className="btn-report-action" 
            onClick={handleDownloadJSON}
            title="Download JSON"
          >
            <Download size={16} />
            JSON
          </button>
          {onClose && (
            <button className="btn-report-close" onClick={onClose} aria-label="Close report">
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="report-controls">
        <button className="btn-expand" onClick={expandAll}>Expand All</button>
        <button className="btn-expand" onClick={collapseAll}>Collapse All</button>
        <span className="section-count">
          {report.sections.length + 1} sections
        </span>
      </div>

      {/* Executive Summary */}
      <div className="report-section executive-summary">
        <div 
          className="section-header"
          onClick={() => toggleSection('Executive Summary')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('Executive Summary'); } }}
        >
          <div className="section-title">
            <Target size={18} />
            <h3>Executive Summary</h3>
          </div>
          {expandedSections.has('Executive Summary') ? 
            <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {expandedSections.has('Executive Summary') && (
          <div className="section-content">
            <div className="summary-text">{report.executiveSummary}</div>
          </div>
        )}
      </div>

      {/* Main Sections */}
      {report.sections.map((section, index) => (
        <div key={index} className="report-section">
          <div 
            className="section-header"
            onClick={() => toggleSection(section.title)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(section.title); } }}
          >
            <div className="section-title">
              {getSentimentIcon(section.sentiment)}
              <h3>{section.title}</h3>
            </div>
            {expandedSections.has(section.title) ? 
              <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedSections.has(section.title) && (
            <div className="section-content">
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
          )}
        </div>
      ))}

      {/* Key Takeaways */}
      {report.keyTakeaways.length > 0 && (
        <div className="report-section takeaways-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('Key Takeaways')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('Key Takeaways'); } }}
          >
            <div className="section-title">
              <Target size={18} />
              <h3>Key Takeaways</h3>
            </div>
            {expandedSections.has('Key Takeaways') ? 
              <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedSections.has('Key Takeaways') && (
            <div className="section-content">
              <ul className="takeaways-list">
                {report.keyTakeaways.map((takeaway, index) => (
                  <li key={index}>{takeaway}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action Items */}
      {report.actionItems.length > 0 && (
        <div className="report-section actions-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('Action Items')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('Action Items'); } }}
          >
            <div className="section-title">
              <Target size={18} />
              <h3>Action Items</h3>
              <span className="action-count">{report.actionItems.length}</span>
            </div>
            {expandedSections.has('Action Items') ? 
              <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedSections.has('Action Items') && (
            <div className="section-content">
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
          )}
        </div>
      )}

      {/* Risk Warnings */}
      {report.riskWarnings.length > 0 && (
        <div className="report-section risk-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('Risk Warnings')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('Risk Warnings'); } }}
          >
            <div className="section-title">
              <Shield size={18} />
              <h3>Risk Warnings</h3>
            </div>
            {expandedSections.has('Risk Warnings') ? 
              <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedSections.has('Risk Warnings') && (
            <div className="section-content">
              <ul className="risk-list">
                {report.riskWarnings.map((warning, index) => (
                  <li key={index}>
                    <AlertTriangle size={14} />
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Market Context */}
      {report.marketContext && (
        <div className="report-section context-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('Market Context')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('Market Context'); } }}
          >
            <div className="section-title">
              <TrendingUp size={18} />
              <h3>Market Context</h3>
            </div>
            {expandedSections.has('Market Context') ? 
              <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedSections.has('Market Context') && (
            <div className="section-content">
              <p>{report.marketContext}</p>
            </div>
          )}
        </div>
      )}

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
