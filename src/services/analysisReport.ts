/**
 * AI-Powered Analysis Report Generator
 * 
 * Generates comprehensive, professional investment reports with:
 * - Executive summary
 * - Detailed analysis sections
 * - Actionable recommendations
 * - Risk assessments
 * - Market context
 * - Auto-generation capabilities
 * - Enhanced LLM prompts for better quality
 */

import { openRouterService, OpenRouterMessage } from './openrouter';
import type { GeneratedPortfolio } from './portfolioAgent';
import { createLogger } from '../core/logger';

const log = createLogger('analysis-report');

// Report generation model (use a capable model for analysis)
const REPORT_MODEL = import.meta.env.VITE_REPORT_MODEL || 'anthropic/claude-3.5-sonnet';

// Auto-generation configuration
export interface AutoReportConfig {
  enabled: boolean;
  triggerOn: ('portfolio_created' | 'optimization_complete' | 'significant_change' | 'scheduled')[];
  depth: 'basic' | 'standard' | 'comprehensive';
  includeMarketContext: boolean;
  includePeerComparison: boolean;
  includeHistoricalAnalysis: boolean;
}

// Report types
export type ReportType = 
  | 'portfolio_analysis' 
  | 'ticker_deep_dive' 
  | 'optimization_report' 
  | 'market_outlook'
  | 'risk_assessment'
  | 'quarterly_review';

// Report section structure
export interface ReportSection {
  title: string;
  content: string;
  highlights?: string[];
  metrics?: Record<string, string | number>;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
}

// Complete analysis report
export interface AnalysisReport {
  id: string;
  type: ReportType;
  title: string;
  generatedAt: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyTakeaways: string[];
  actionItems: ActionItem[];
  riskWarnings: string[];
  marketContext: string;
  disclaimer: string;
  metadata: {
    dataAsOf: string;
    analysisDepth: 'basic' | 'standard' | 'comprehensive';
    confidence: number;
    generationTimeMs: number;
  };
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  timeline: string;
  expectedImpact: string;
}

// Ticker analysis data for report generation
export interface TickerAnalysisData {
  symbol: string;
  currentPrice: number;
  quantMetrics?: {
    sharpeRatio: number;
    sortinoRatio: number;
    annualizedReturn: number;
    volatility: number;
    maxDrawdown: number;
    rsi: number;
    signal: string;
    confidence: number;
    beta: number;
    alpha: number;
  };
  fundamentals?: {
    // Basic valuation
    peRatio: number | null;
    forwardPE: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
    evToEbitda: number | null;
    
    // Profitability
    profitMargin: number | null;
    operatingMargin: number | null;
    returnOnAssets: number | null;
    returnOnEquity: number | null;
    
    // Growth
    revenueGrowthYoY: number | null;
    earningsGrowthYoY: number | null;
    
    // Financial Health
    debtToEquity: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    freeCashFlow: number | null;
    
    // Dividend
    dividendYield: number | null;
    payoutRatio: number | null;
    dividendSafety: string | null;
    
    // Company info
    marketCap: number;
    eps: number | null;
    companyName: string | null;
    sector: string | null;
    industry: string | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    
    // Advanced metrics
    altmanZScore: number | null;
    piotroskiFScore: number | null;
    grahamNumber: number | null;
    marginOfSafety: number | null;
    
    // Factor scores
    valueScore: number;
    qualityScore: number;
    growthScore: number;
  };
  sentiment?: {
    overallSentiment: string;
    sentimentScore: number;
    newsCount: number;
  };
  analystData?: {
    consensusRating: string;
    targetPriceMean: number | null;
    numberOfAnalysts: number;
    upside: number | null;
  };
}

// Optimization data for report
export interface OptimizationData {
  portfolioName: string;
  currentHealthScore: number;
  projectedHealthScore: number;
  holdings: Array<{
    symbol: string;
    allocation: number;
    grade: string;
    issues: string[];
  }>;
  dropRecommendations: Array<{
    symbol: string;
    reason: string;
    urgency: string;
  }>;
  replacementOptions: Array<{
    symbol: string;
    score: number;
    whyBetter: string[];
  }>;
}

// Event types for auto-generation
export type ReportTriggerEvent = 
  | { type: 'portfolio_created'; portfolio: GeneratedPortfolio }
  | { type: 'optimization_complete'; data: OptimizationData }
  | { type: 'ticker_analyzed'; data: TickerAnalysisData }
  | { type: 'significant_change'; portfolio: GeneratedPortfolio; changeType: string }
  | { type: 'scheduled'; portfolio: GeneratedPortfolio };

// Report queue item for batch processing
interface QueuedReport {
  id: string;
  event: ReportTriggerEvent;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

class AnalysisReportService {
  private reportQueue: QueuedReport[] = [];
  private isProcessingQueue = false;
  private autoConfig: AutoReportConfig = {
    enabled: false,
    triggerOn: ['portfolio_created', 'optimization_complete'],
    depth: 'standard',
    includeMarketContext: true,
    includePeerComparison: false,
    includeHistoricalAnalysis: true,
  };
  
  // Event listeners for auto-generation
  private eventListeners: Map<string, ((report: AnalysisReport) => void)[]> = new Map();

  private generateId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Configure auto-generation settings
   */
  configureAutoGeneration(config: Partial<AutoReportConfig>): void {
    this.autoConfig = { ...this.autoConfig, ...config };
    log.info('Auto-generation configured', this.autoConfig);
  }

  /**
   * Get current auto-generation configuration
   */
  getAutoConfig(): AutoReportConfig {
    return { ...this.autoConfig };
  }

  /**
   * Subscribe to report generation events
   */
  onReportGenerated(eventType: string, callback: (report: AnalysisReport) => void): () => void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(callback);
    this.eventListeners.set(eventType, listeners);
    
    // Return unsubscribe function
    return () => {
      const current = this.eventListeners.get(eventType) || [];
      this.eventListeners.set(eventType, current.filter(cb => cb !== callback));
    };
  }

  private notifyListeners(eventType: string, report: AnalysisReport): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.forEach(cb => {
      try {
        cb(report);
      } catch (error) {
        log.error('Listener error', error);
      }
    });
  }

  /**
   * Trigger auto-generation based on event
   */
  async triggerAutoReport(event: ReportTriggerEvent): Promise<AnalysisReport | null> {
    if (!this.autoConfig.enabled) {
      log.debug('Auto-generation disabled, skipping');
      return null;
    }

    // Check if this event type is configured for auto-generation
    const eventTypeMap: Record<ReportTriggerEvent['type'], typeof this.autoConfig.triggerOn[number]> = {
      'portfolio_created': 'portfolio_created',
      'optimization_complete': 'optimization_complete',
      'ticker_analyzed': 'portfolio_created', // Map to closest
      'significant_change': 'significant_change',
      'scheduled': 'scheduled',
    };

    const triggerType = eventTypeMap[event.type];
    if (!this.autoConfig.triggerOn.includes(triggerType)) {
      log.debug(`Event type ${event.type} not configured for auto-generation`);
      return null;
    }

    log.info(`Auto-generating report for event: ${event.type}`);

    try {
      let report: AnalysisReport;

      switch (event.type) {
        case 'portfolio_created':
        case 'significant_change':
        case 'scheduled':
          report = await this.generatePortfolioReport(event.portfolio, { 
            depth: this.autoConfig.depth 
          });
          break;
        case 'optimization_complete':
          report = await this.generateOptimizationReport(event.data);
          break;
        case 'ticker_analyzed':
          report = await this.generateTickerReport(event.data);
          break;
        default:
          log.warn('Unknown event type');
          return null;
      }

      this.notifyListeners(event.type, report);
      return report;
    } catch (error) {
      log.error('Auto-generation failed', error);
      return null;
    }
  }

  /**
   * Queue a report for batch processing
   */
  queueReport(event: ReportTriggerEvent, priority: 'high' | 'medium' | 'low' = 'medium'): string {
    const queueItem: QueuedReport = {
      id: this.generateId(),
      event,
      priority,
      createdAt: new Date(),
      status: 'pending',
    };
    
    this.reportQueue.push(queueItem);
    this.reportQueue.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    log.info(`Queued report ${queueItem.id} with priority ${priority}`);
    
    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }

    return queueItem.id;
  }

  /**
   * Process the report queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.reportQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.reportQueue.length > 0) {
      const item = this.reportQueue.find(r => r.status === 'pending');
      if (!item) break;

      item.status = 'processing';
      log.debug(`Processing queued report ${item.id}`);

      try {
        await this.triggerAutoReport(item.event);
        item.status = 'completed';
      } catch (error) {
        log.error(`Failed to process ${item.id}`, error);
        item.status = 'failed';
      }

      // Remove completed/failed items older than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      this.reportQueue = this.reportQueue.filter(
        r => r.status === 'pending' || r.status === 'processing' || r.createdAt > fiveMinutesAgo
      );
    }

    this.isProcessingQueue = false;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; processing: number; completed: number; failed: number } {
    return {
      pending: this.reportQueue.filter(r => r.status === 'pending').length,
      processing: this.reportQueue.filter(r => r.status === 'processing').length,
      completed: this.reportQueue.filter(r => r.status === 'completed').length,
      failed: this.reportQueue.filter(r => r.status === 'failed').length,
    };
  }

  /**
   * Generate a comprehensive portfolio analysis report
   */
  async generatePortfolioReport(
    portfolio: GeneratedPortfolio,
    options: { depth?: 'basic' | 'standard' | 'comprehensive' } = {}
  ): Promise<AnalysisReport> {
    const startTime = Date.now();
    const depth = options.depth || 'standard';

    log.info(`Generating ${depth} portfolio analysis report`);

    // Build comprehensive prompt with all portfolio data
    const portfolioSummary = this.buildPortfolioSummary(portfolio);
    
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.getPortfolioReportSystemPrompt(depth)
      },
      {
        role: 'user',
        content: `Generate a comprehensive investment analysis report for this portfolio:\n\n${portfolioSummary}`
      }
    ];

    try {
      const response = await openRouterService.chat(messages, REPORT_MODEL, {
        temperature: 0.7,
        max_tokens: depth === 'comprehensive' ? 6000 : depth === 'standard' ? 4000 : 2000,
      });

      const report = this.parseReportResponse(response, 'portfolio_analysis', portfolio.title);
      
      report.metadata = {
        dataAsOf: new Date().toISOString(),
        analysisDepth: depth,
        confidence: this.calculateReportConfidence(portfolio),
        generationTimeMs: Date.now() - startTime,
      };

      log.info(`Generated in ${report.metadata.generationTimeMs}ms`);
      return report;
    } catch (error) {
      log.error('Generation failed', error);
      throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a deep-dive analysis report for a single ticker
   */
  async generateTickerReport(data: TickerAnalysisData): Promise<AnalysisReport> {
    const startTime = Date.now();

    log.info(`Generating ticker deep-dive for ${data.symbol}`);

    const tickerSummary = this.buildTickerSummary(data);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.getTickerReportSystemPrompt()
      },
      {
        role: 'user',
        content: `Generate a comprehensive investment analysis report for ${data.symbol}:\n\n${tickerSummary}`
      }
    ];

    try {
      const response = await openRouterService.chat(messages, REPORT_MODEL, {
        temperature: 0.7,
        max_tokens: 4000,
      });

      const report = this.parseReportResponse(response, 'ticker_deep_dive', `${data.symbol} Analysis`);
      
      report.metadata = {
        dataAsOf: new Date().toISOString(),
        analysisDepth: 'comprehensive',
        confidence: this.calculateTickerConfidence(data),
        generationTimeMs: Date.now() - startTime,
      };

      return report;
    } catch (error) {
      log.error('Ticker report generation failed', error);
      throw error;
    }
  }

  /**
   * Generate an optimization report with AI-enhanced descriptions
   */
  async generateOptimizationReport(data: OptimizationData): Promise<AnalysisReport> {
    const startTime = Date.now();

    log.info(`Generating optimization report for ${data.portfolioName}`);

    const optimizationSummary = this.buildOptimizationSummary(data);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.getOptimizationReportSystemPrompt()
      },
      {
        role: 'user',
        content: `Generate a detailed portfolio optimization report:\n\n${optimizationSummary}`
      }
    ];

    try {
      const response = await openRouterService.chat(messages, REPORT_MODEL, {
        temperature: 0.6,
        max_tokens: 4500,
      });

      const report = this.parseReportResponse(response, 'optimization_report', `${data.portfolioName} Optimization`);
      
      report.metadata = {
        dataAsOf: new Date().toISOString(),
        analysisDepth: 'comprehensive',
        confidence: Math.round((data.projectedHealthScore / 100) * 85 + 15),
        generationTimeMs: Date.now() - startTime,
      };

      return report;
    } catch (error) {
      log.error('Optimization report generation failed', error);
      throw error;
    }
  }

  /**
   * Generate a risk assessment report
   */
  async generateRiskReport(portfolio: GeneratedPortfolio): Promise<AnalysisReport> {
    const startTime = Date.now();

    log.info('Generating risk assessment report');

    const riskSummary = this.buildRiskSummary(portfolio);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.getRiskReportSystemPrompt()
      },
      {
        role: 'user',
        content: `Generate a comprehensive risk assessment report:\n\n${riskSummary}`
      }
    ];

    try {
      const response = await openRouterService.chat(messages, REPORT_MODEL, {
        temperature: 0.5,
        max_tokens: 4000,
      });

      const report = this.parseReportResponse(response, 'risk_assessment', `${portfolio.title} Risk Assessment`);
      
      report.metadata = {
        dataAsOf: new Date().toISOString(),
        analysisDepth: 'comprehensive',
        confidence: this.calculateReportConfidence(portfolio),
        generationTimeMs: Date.now() - startTime,
      };

      return report;
    } catch (error) {
      log.error('Risk report generation failed', error);
      throw error;
    }
  }

  /**
   * Stream report generation for real-time UI updates
   */
  async *streamReport(
    type: ReportType,
    data: GeneratedPortfolio | TickerAnalysisData | OptimizationData,
    onProgress?: (partial: string) => void
  ): AsyncGenerator<{ section: string; content: string; done: boolean }> {
    let systemPrompt: string;
    let userPrompt: string;

    switch (type) {
      case 'portfolio_analysis':
        systemPrompt = this.getPortfolioReportSystemPrompt('standard');
        userPrompt = `Generate a comprehensive investment analysis report for this portfolio:\n\n${this.buildPortfolioSummary(data as GeneratedPortfolio)}`;
        break;
      case 'ticker_deep_dive':
        systemPrompt = this.getTickerReportSystemPrompt();
        userPrompt = `Generate a comprehensive investment analysis report:\n\n${this.buildTickerSummary(data as TickerAnalysisData)}`;
        break;
      case 'optimization_report':
        systemPrompt = this.getOptimizationReportSystemPrompt();
        userPrompt = `Generate a detailed portfolio optimization report:\n\n${this.buildOptimizationSummary(data as OptimizationData)}`;
        break;
      default:
        systemPrompt = this.getPortfolioReportSystemPrompt('standard');
        userPrompt = `Generate an analysis report:\n\n${JSON.stringify(data, null, 2)}`;
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let currentSection = 'Executive Summary';
    let currentContent = '';

    for await (const chunk of openRouterService.chatStream(messages, REPORT_MODEL, {
      temperature: 0.7,
      max_tokens: 5000,
    })) {
      if (chunk.done) {
        yield { section: currentSection, content: currentContent, done: true };
        break;
      }

      currentContent += chunk.content;
      onProgress?.(currentContent);

      // Detect section changes
      const sectionMatch = chunk.content.match(/##\s+(.+)/);
      if (sectionMatch) {
        yield { section: currentSection, content: currentContent, done: false };
        currentSection = sectionMatch[1];
        currentContent = '';
      }
    }
  }

  // ============================================================================
  // SYSTEM PROMPTS (Enhanced for better LLM output quality)
  // ============================================================================

  private getPortfolioReportSystemPrompt(depth: 'basic' | 'standard' | 'comprehensive'): string {
    const basePrompt = `You are a CFA-certified investment analyst with 15+ years of experience at top-tier firms (Goldman Sachs, BlackRock). Generate institutional-grade portfolio analysis reports.

CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. USE SPECIFIC NUMBERS - Never say "good" or "high", always cite exact figures
2. COMPARE TO BENCHMARKS - Reference S&P 500, sector averages, peer performance
3. QUANTIFY RECOMMENDATIONS - Include expected impact percentages
4. CITE DATA SOURCES - Reference the provided metrics explicitly
5. BALANCED ANALYSIS - Every strength must have a corresponding risk consideration
6. ACTIONABLE INSIGHTS - Each section ends with a clear "what to do" statement
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT FORMAT (use markdown with proper formatting):

## Executive Summary
[3 paragraphs: 1) Overall assessment with health score interpretation, 2) Key strengths with numbers, 3) Primary concerns and immediate actions needed]

**Overall Rating:** [Strong Buy / Buy / Hold / Underweight / Sell]
**Risk Score:** [1-10 with explanation]
**Time Horizon Fit:** [Assessment of strategy alignment]

## Portfolio Composition Analysis
[Detailed breakdown with exact percentages]

**Asset Allocation:**
| Category | Current | Recommended | Gap |
|----------|---------|-------------|-----|
| Large Cap | X% | Y% | +/-Z% |
...

**Sector Exposure Heat Map:**
- Technology: X% (vs. S&P weight of Y%) [OVERWEIGHT/UNDERWEIGHT]
- Healthcare: X% (vs. S&P weight of Y%) [OVERWEIGHT/UNDERWEIGHT]
...

**Concentration Metrics:**
- Herfindahl Index: X (>0.15 = concentrated)
- Top 3 Holdings: X% of portfolio
- Recommendation: [specific action if needed]

## Performance Assessment
[Quantitative analysis with benchmark comparisons]

**Risk-Adjusted Returns:**
| Metric | Portfolio | S&P 500 | Interpretation |
|--------|-----------|---------|----------------|
| Sharpe Ratio | X.XX | ~0.9 | [Above/Below average] |
| Sortino Ratio | X.XX | ~1.2 | [Downside protection level] |
| Calmar Ratio | X.XX | ~0.5 | [Recovery capability] |

**Volatility Profile:**
- Annualized Volatility: X% vs benchmark Y%
- Beta to Market: X.XX (>1 = more volatile than market)
- Max Drawdown: -X% vs S&P -Y% during same period

**Monte Carlo Projection:** (if available)
- 5th Percentile: $X (worst case)
- 50th Percentile: $X (expected)
- 95th Percentile: $X (best case)
- Probability of Loss: X%

## Individual Holdings Review
[Tier holdings by performance grade]

### ⭐ Top Performers (Grade A-B)
**[SYMBOL]** - Score: X/100
- Strengths: [specific metrics]
- Concerns: [specific risks]
- Action: [Hold/Add on dip/Trim]

### ⚠️ Watch List (Grade C)
**[SYMBOL]** - Score: X/100
- Issues: [specific problems]
- Trigger for Action: [specific condition]

### 🔴 Underperformers (Grade D-F)
**[SYMBOL]** - Score: X/100
- Primary Problem: [specific issue with number]
- Recommendation: [Sell/Replace with X]
- Urgency: [High/Medium/Low]

## Risk Analysis
[Comprehensive multi-factor risk assessment]

**Systematic Risks:**
- Market Risk (Beta): X.XX - [interpretation]
- Interest Rate Sensitivity: [High/Medium/Low] - [impact description]
- Inflation Exposure: [assessment]

**Idiosyncratic Risks:**
- Single Stock Risk: Top position is X% of portfolio
- Sector Concentration: X% in [sector] vs recommended max of 30%
- Geographic Risk: [assessment]

**Stress Test Scenarios:**
| Scenario | Expected Impact | Recovery Time |
|----------|-----------------|---------------|
| Market Crash (-20%) | -X% | X months |
| Rate Hike (+100bps) | -X% | X months |
| Sector Rotation | +/-X% | X months |

## Market Context & Outlook
[Current environment analysis with forward-looking view]

**Current Market Regime:**
- Bull/Bear/Sideways: [assessment with reasoning]
- Volatility Environment: VIX at X (historical average: 20)
- Credit Conditions: [assessment]

**Sector Outlook (3-6 months):**
- Favorable for portfolio: [sectors with reasons]
- Headwinds for portfolio: [sectors with reasons]

**Macro Factors to Monitor:**
1. [Factor]: [current state] → [impact on portfolio]
2. [Factor]: [current state] → [impact on portfolio]
3. [Factor]: [current state] → [impact on portfolio]

## Recommendations
[Prioritized action plan with expected outcomes]

### 🔥 Immediate Actions (This Week)
1. **[ACTION]** [SYMBOL]: [specific instruction]
   - Rationale: [why now]
   - Expected Impact: [+X% return / -X% risk]

### 📅 Near-Term Actions (This Month)
1. **[ACTION]** [details with expected impact]

### 📊 Strategic Actions (This Quarter)
1. **[ACTION]** [details with expected impact]

**Expected Portfolio Improvement:**
- Health Score: X → Y (+Z points)
- Sharpe Ratio: X.XX → Y.YY
- Volatility: X% → Y%

## Key Takeaways
- 📈 [Most important positive finding with number]
- 📉 [Most important risk with number]
- 🎯 [Most important action with expected impact]
- ⏰ [Most time-sensitive consideration]
- 💡 [Most overlooked opportunity]

## Risk Warnings
⚠️ **Critical Risks:**
- [Specific risk with potential impact percentage]
- [Specific risk with trigger condition]

⚡ **Volatility Warning:**
[Specific warning about expected price movements]

📉 **Downside Scenarios:**
[Specific worst-case scenario with probability estimate]`;

    if (depth === 'comprehensive') {
      return basePrompt + `

## Tax Optimization Opportunities
[Specific tax-loss harvesting candidates and wash sale considerations]

**Tax-Loss Harvesting Candidates:**
| Symbol | Unrealized Loss | Tax Savings (Est.) | Replacement |
|--------|-----------------|-------------------|-------------|

**Wash Sale Watch:**
[Holdings to avoid trading within 30 days]

## Rebalancing Strategy
[Specific trade instructions with order of execution]

**Drift Analysis:**
| Asset | Target | Current | Drift | Action |
|-------|--------|---------|-------|--------|

**Execution Plan:**
1. [First trade with rationale]
2. [Second trade with rationale]
...

## Scenario Analysis

### 🐂 Bull Case (25% probability)
- Catalyst: [specific trigger]
- Portfolio Return: +X%
- Best Performers: [symbols]

### 📊 Base Case (50% probability)
- Assumptions: [market conditions]
- Portfolio Return: +X%
- Key Drivers: [factors]

### 🐻 Bear Case (25% probability)
- Trigger: [specific risk]
- Portfolio Return: -X%
- Most Vulnerable: [symbols]
- Hedging Recommendation: [specific action]

## Long-term Outlook (3-5 Year Horizon)
[Strategic assessment with compounding projections]

**Projected Portfolio Value:**
| Year | Conservative | Expected | Optimistic |
|------|-------------|----------|------------|
| 1 | $X | $X | $X |
| 3 | $X | $X | $X |
| 5 | $X | $X | $X |

**Strategic Recommendations:**
1. [Long-term strategy adjustment]
2. [Sector rotation timing]
3. [Rebalancing schedule]`;
    }

    if (depth === 'basic') {
      return `You are a CFA-certified analyst generating a concise portfolio summary.

OUTPUT FORMAT (markdown):

## Executive Summary
[2 paragraphs: Key findings and overall health assessment with specific numbers]

**Quick Stats:**
- Health Score: X/100
- Risk Level: [Low/Medium/High]
- Action Needed: [Yes/No]

## Key Metrics
| Metric | Value | Status |
|--------|-------|--------|
| Sharpe Ratio | X.XX | ✅/⚠️/🔴 |
| Volatility | X% | ✅/⚠️/🔴 |
| Max Drawdown | -X% | ✅/⚠️/🔴 |
| Diversification | X/100 | ✅/⚠️/🔴 |

## Top 3 Recommendations
1. **[Priority: HIGH]** [Specific action with expected impact]
2. **[Priority: MEDIUM]** [Specific action with expected impact]
3. **[Priority: LOW]** [Specific action with expected impact]

## Risk Warnings
⚠️ [Most critical risk with specific number]
📉 [Second risk consideration]`;
    }

    return basePrompt;
  }

  private getTickerReportSystemPrompt(): string {
    return `You are a senior equity research analyst at a top investment bank generating institutional-grade stock research.

CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. QUANTIFY EVERYTHING - Use exact numbers from provided data
2. COMPARE TO PEERS - Reference sector averages and competitors
3. EXPLICIT RECOMMENDATION - Clear BUY/HOLD/SELL with conviction (1-5)
4. PRICE TARGETS - Provide specific entry/exit points
5. POSITION SIZING - Give concrete allocation suggestions
6. TIME-BOUND - All recommendations have specific timeframes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT FORMAT (markdown):

## Executive Summary

**Recommendation:** [STRONG BUY / BUY / HOLD / SELL / STRONG SELL]
**Conviction Level:** [1-5 stars] ⭐⭐⭐⭐⭐
**12-Month Target:** $XXX (+XX% upside)
**Risk/Reward Ratio:** X:X

[2-3 paragraph investment thesis explaining the recommendation with specific supporting data. Include the single most compelling reason to own/avoid this stock.]

## Quantitative Analysis

### Risk-Adjusted Performance
| Metric | Value | Sector Avg | Interpretation |
|--------|-------|------------|----------------|
| Sharpe Ratio | X.XX | ~0.8 | [Excellent/Good/Poor] risk-adjusted returns |
| Sortino Ratio | X.XX | ~1.0 | [Strong/Weak] downside protection |
| Alpha | X.XX% | 0% | [Outperforming/Underperforming] benchmark by X% |
| Beta | X.XX | 1.0 | [More/Less] volatile than market |

### Volatility & Drawdown Analysis
- **Annualized Volatility:** X% (vs sector avg Y%)
- **Max Drawdown:** -X% (occurred during [period])
- **Recovery Time:** X days from max drawdown
- **VaR (95%):** Expect to lose no more than $X per $10,000 invested on 95% of days

### Technical Indicators
- **RSI:** X ([Overbought >70 / Neutral 30-70 / Oversold <30])
- **Signal:** [Current signal from data] - Confidence: X%
- **Trend:** [Bullish/Bearish/Neutral] - [Supporting evidence]
- **Key Levels:** Support: $X | Resistance: $X

## Fundamental Analysis

### Valuation Assessment
| Metric | Current | 5Y Avg | Sector | Premium/Discount |
|--------|---------|--------|--------|------------------|
| P/E Ratio | X.X | X.X | X.X | X% [premium/discount] |
| Forward P/E | X.X | - | X.X | X% [premium/discount] |
| P/B Ratio | X.X | X.X | X.X | X% [premium/discount] |

**Valuation Verdict:** [Undervalued / Fairly Valued / Overvalued] by approximately X%

### Profitability Analysis
- **Profit Margin:** X% (sector: Y%) - [Strong/Weak] pricing power
- **ROE:** X% (sector: Y%) - [Efficient/Inefficient] capital deployment
- **ROA:** [if available] X% - Asset productivity assessment

### Financial Health
- **Debt/Equity:** X.XX ([Low <0.5 / Moderate 0.5-1.5 / High >1.5] leverage)
- **Interest Coverage:** [if derivable] - Ability to service debt
- **Cash Position:** [if available] - Liquidity assessment

### Growth Trajectory
- **Revenue Growth YoY:** X% ([Accelerating/Decelerating])
- **Earnings Growth:** [derivable from data]
- **Growth Sustainability:** [Assessment based on margins and debt]

## Market Sentiment & Analyst Views

### Sentiment Dashboard
| Indicator | Reading | Implication |
|-----------|---------|-------------|
| Overall Sentiment | [Bullish/Bearish/Neutral] | [Interpretation] |
| Sentiment Score | X.XX | [Strong/Weak] conviction |
| News Volume | X articles | [High/Normal/Low] attention |

### Analyst Consensus
- **Rating:** [From data] (X analysts covering)
- **Price Target Range:** $X (low) - $X (high)
- **Mean Target:** $X ([+/-]X% from current)
- **Consensus Accuracy:** [Historical context if relevant]

**Sentiment-Price Divergence:** [Analysis of whether sentiment aligns with price action]

## Investment Thesis

### 🐂 Bull Case (X% probability)
**Target Price:** $XXX (+XX%)

1. **[Primary Catalyst]:** [Specific reasoning with data]
2. **[Secondary Catalyst]:** [Specific reasoning with data]
3. **[Tertiary Catalyst]:** [Specific reasoning with data]

**Triggers to Monitor:**
- [Specific event/metric that would confirm bull case]

### 🐻 Bear Case (X% probability)
**Downside Target:** $XXX (-XX%)

1. **[Primary Risk]:** [Specific reasoning with data]
2. **[Secondary Risk]:** [Specific reasoning with data]
3. **[Tertiary Risk]:** [Specific reasoning with data]

**Warning Signs:**
- [Specific event/metric that would trigger bear case]

## Risk Factors

### 🔴 High-Impact Risks
1. **[Risk Category]:** [Specific risk with quantified potential impact]
   - Probability: [High/Medium/Low]
   - Mitigation: [How to hedge or manage]

### 🟡 Medium-Impact Risks
1. **[Risk Category]:** [Specific risk description]

### Company-Specific Risks
- [Unique risks to this company/industry]

## Actionable Recommendations

### Entry Strategy
- **Ideal Entry:** $X.XX (current price [+/-]X%)
- **Aggressive Entry:** $X.XX (on any dip)
- **Conservative Entry:** $X.XX (wait for [condition])

### Position Sizing
- **Portfolio Allocation:** X-Y% of total portfolio
- **Max Position:** X% (based on volatility)
- **Dollar Amount:** $X per $10,000 portfolio

### Exit Strategy
- **Take Profit:** $X.XX (+X% from entry)
- **Stop Loss:** $X.XX (-X% from entry)
- **Trailing Stop:** X% from highs

### Time Horizon
- **Short-term (1-3 months):** [Outlook]
- **Medium-term (3-12 months):** [Outlook]
- **Long-term (1-3 years):** [Outlook]

## Key Takeaways

📊 **Quantitative:** [Most important metric finding]
💰 **Valuation:** [Fair value assessment in one line]
📈 **Momentum:** [Current trend summary]
🎯 **Target:** $X.XX with [timeframe]
⚠️ **Key Risk:** [Single most important risk]
✅ **Action:** [Clear instruction - Buy/Hold/Sell at what price]

---
*Analysis based on data as of [timestamp]. This is not financial advice. Past performance does not guarantee future results.*`;
  }

  private getOptimizationReportSystemPrompt(): string {
    return `You are a portfolio optimization specialist at a wealth management firm generating actionable rebalancing recommendations.

CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. QUANTIFY IMPACT - Every recommendation includes expected effect
2. PRIORITIZE BY URGENCY - Clear ordering of actions
3. CONSIDER COSTS - Account for transaction costs and taxes
4. EXECUTION TIMING - Specific guidance on when to act
5. TRACK METRICS - Before/after comparisons for all changes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT FORMAT (markdown):

## Executive Summary

**Optimization Verdict:** [Critical / Important / Routine / Optional]
**Health Score Impact:** X → Y (+Z points)
**Expected Return Improvement:** +X% annually
**Risk Reduction:** -X% volatility

[2 paragraph summary: 1) Current state diagnosis with specific numbers, 2) Recommended action plan with expected outcomes]

## Current Portfolio Assessment

### Health Score Breakdown
| Component | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Diversification | X/100 | 25% | X pts |
| Risk-Adjusted Returns | X/100 | 30% | X pts |
| Volatility | X/100 | 20% | X pts |
| Quality | X/100 | 25% | X pts |
| **Total** | **X/100** | | |

### Holdings Performance Matrix
| Symbol | Grade | Issues | Action |
|--------|-------|--------|--------|
| [Symbol] | [A-F] | [Primary issue] | [Hold/Reduce/Sell] |
...

### Strengths to Maintain
✅ [Strong holding with metrics]
✅ [Strong holding with metrics]

### Issues to Address
🔴 [Critical issue with specific metrics]
🟡 [Important issue with specific metrics]

## Underperformers Analysis

### 🔴 Priority 1: [SYMBOL] - SELL
**Grade:** [X] | **Urgency:** HIGH

**Why It's Underperforming:**
| Metric | Current | Threshold | Gap |
|--------|---------|-----------|-----|
| Sharpe Ratio | X.XX | >0.3 | -X.XX below |
| Volatility | X% | <45% | +X% above |
| Max Drawdown | -X% | >-35% | -X% below |

**Risk to Portfolio:**
- Contribution to portfolio volatility: X%
- Drag on returns: -X% annually
- If held 3 more months: Expected loss of $X

**Recommended Action:** Sell [X]% of position ($X value)
**Tax Impact:** [Short-term/Long-term] gain/loss of ~$X

### 🟡 Priority 2: [SYMBOL] - REDUCE
[Similar format but for medium priority]

## Replacement Recommendations

### Rank #1: [SYMBOL] - Score: X/100

**Why It's Better:**
| Metric | [Replacement] | [Dropped] | Improvement |
|--------|---------------|-----------|-------------|
| Sharpe Ratio | X.XX | X.XX | +X.XX |
| Volatility | X% | X% | -X% |
| Signal | [Signal] | [Signal] | [Better/Worse] |

**Fit with Portfolio:**
- Sector: [Sector] - [Adds diversification / Maintains exposure]
- Correlation: X.XX with existing holdings
- Style: [Growth/Value/Blend]

**Allocation:** X% of portfolio ($X)
**Expected Contribution:** +X% to annual returns

### Rank #2: [SYMBOL] - Score: X/100
[Similar format]

## Implementation Plan

### Execution Timeline

**Day 1: Sell Underperformers**
| Order | Action | Symbol | Shares | Est. Value | Rationale |
|-------|--------|--------|--------|------------|-----------|
| 1 | SELL | [X] | X | $X | [Why first] |
| 2 | SELL | [X] | X | $X | [Why second] |

**Day 2-3: Deploy Proceeds**
| Order | Action | Symbol | Shares | Est. Value | Rationale |
|-------|--------|--------|--------|------------|-----------|
| 3 | BUY | [X] | X | $X | [Why this timing] |
| 4 | BUY | [X] | X | $X | [Why this timing] |

### Transaction Cost Analysis
- Estimated sell commissions: $X
- Estimated buy commissions: $X
- Bid-ask spread impact: ~$X
- **Total cost:** $X (X% of transaction value)

### Tax Considerations
- **Tax-loss harvesting opportunity:** [Yes/No]
- **Wash sale warning:** [Any 30-day considerations]
- **Estimated tax impact:** $X [benefit/liability]

## Expected Outcomes

### Before vs After Comparison
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Health Score | X | X | +X |
| Sharpe Ratio | X.XX | X.XX | +X.XX |
| Portfolio Volatility | X% | X% | -X% |
| Max Expected Drawdown | -X% | -X% | +X% |
| Diversification Score | X | X | +X |

### Projected Returns (12 months)
| Scenario | Before Optimization | After Optimization |
|----------|--------------------|--------------------|
| Bull (+20% market) | +X% | +X% |
| Base (+8% market) | +X% | +X% |
| Bear (-15% market) | -X% | -X% |

### Risk Reduction Achieved
- Concentration risk: Reduced by X%
- Single-stock risk: [Assessment]
- Sector balance: [Improved/Maintained]

## Risk Warnings

⚠️ **Execution Risk:**
- Market may move between sell and buy orders
- Recommended: Use limit orders within X% of current prices

⚠️ **Timing Risk:**
- [Specific market conditions to consider]
- Recommended: Execute during [market hours/conditions]

⚠️ **Tax Risk:**
- [Any tax considerations]

⚠️ **Reversal Risk:**
- Probability that dropped holdings outperform: ~X%
- Probability that replacements underperform: ~X%

## Key Takeaways

🎯 **Primary Action:** [Single most important thing to do]
💰 **Expected Benefit:** [Quantified improvement]
⏰ **Urgency:** [Execute within X days/weeks]
📊 **Success Metric:** [How to measure if optimization worked]
⚠️ **Watch For:** [Key risk to monitor after execution]`;
  }

  private getRiskReportSystemPrompt(): string {
    return `You are a risk management specialist at an institutional asset manager generating comprehensive portfolio risk assessments.

CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. QUANTIFY ALL RISKS - Use VaR, CVaR, drawdown metrics
2. SCENARIO ANALYSIS - Provide specific stress test results
3. PROBABILITY ESTIMATES - Likelihood of adverse events
4. MITIGATION STRATEGIES - Actionable risk reduction steps
5. MONITORING FRAMEWORK - Specific triggers and thresholds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT FORMAT (markdown):

## Executive Risk Summary

**Overall Risk Rating:** [1-10] 🔴🟡🟢
**Risk Level:** [Conservative / Moderate / Aggressive / Speculative]
**Primary Concern:** [Single biggest risk]

| Risk Category | Level | Trend | Action Needed |
|---------------|-------|-------|---------------|
| Market Risk | [H/M/L] | [↑↓→] | [Yes/No] |
| Concentration Risk | [H/M/L] | [↑↓→] | [Yes/No] |
| Liquidity Risk | [H/M/L] | [↑↓→] | [Yes/No] |
| Tail Risk | [H/M/L] | [↑↓→] | [Yes/No] |

[2 paragraph executive summary of risk profile]

## Market Risk Assessment

### Systematic Risk Metrics
| Metric | Value | Benchmark | Interpretation |
|--------|-------|-----------|----------------|
| Portfolio Beta | X.XX | 1.0 | [X% more/less volatile than market] |
| R-Squared | X.XX | - | [X% of returns explained by market] |
| Tracking Error | X% | - | [Deviation from benchmark] |

### Volatility Analysis
- **Annualized Volatility:** X% (S&P 500: ~16%)
- **Rolling 30-day Vol:** X% (trend: [rising/falling])
- **Volatility Percentile:** Xth percentile (historical)

### Interest Rate Sensitivity
- **Duration Exposure:** [If applicable]
- **Rate Sensitivity:** [High/Medium/Low]
- **Impact of +100bps:** -X% portfolio value

## Concentration Risk

### Position Concentration
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Top Position | X% | <20% | ✅/🔴 |
| Top 3 Positions | X% | <45% | ✅/🔴 |
| Top 5 Positions | X% | <65% | ✅/🔴 |
| Herfindahl Index | X.XX | <0.15 | ✅/🔴 |

### Sector Concentration
| Sector | Weight | S&P Weight | Over/Under |
|--------|--------|------------|------------|
| Technology | X% | Y% | +/-Z% |
| Healthcare | X% | Y% | +/-Z% |
| Financials | X% | Y% | +/-Z% |
...

**Concentration Risk Score:** X/100

### Correlation Analysis
- **Average Pairwise Correlation:** X.XX
- **Highest Correlation Pair:** [X] & [Y] (X.XX)
- **Diversification Benefit:** [Strong/Moderate/Weak]

## Downside Risk Metrics

### Value at Risk (VaR)
| Confidence | Daily VaR | Monthly VaR | Annual VaR |
|------------|-----------|-------------|------------|
| 95% | -$X (-X%) | -$X (-X%) | -$X (-X%) |
| 99% | -$X (-X%) | -$X (-X%) | -$X (-X%) |

**Interpretation:** On 95% of days, you should not lose more than $X per $10,000 invested.

### Conditional VaR (CVaR / Expected Shortfall)
- **CVaR (95%):** -$X (-X%)
- **Interpretation:** When losses exceed VaR, expect average loss of X%

### Maximum Drawdown Analysis
- **Historical Max Drawdown:** -X%
- **Recovery Time:** X days
- **Current Drawdown:** -X% from peak
- **Expected Drawdown (95% CI):** -X% to -X%

### Tail Risk Assessment
- **Skewness:** X.XX ([Negative = fat left tail])
- **Kurtosis:** X.XX ([>3 = fat tails])
- **Tail Risk Score:** [High/Medium/Low]

## Stress Test Scenarios

### 📉 Scenario 1: Market Crash (-20%)
| Impact Analysis | Value |
|-----------------|-------|
| Portfolio Loss | -X% |
| Dollar Impact | -$X |
| Most Affected Holdings | [X], [Y], [Z] |
| Recovery Time Est. | X months |

**Probability:** ~10-15% in any given year

### 📈 Scenario 2: Rising Rates (+200bps)
| Impact Analysis | Value |
|-----------------|-------|
| Portfolio Impact | -X% |
| Most Affected | [Holdings/Sectors] |
| Hedge Recommendation | [Action] |

**Probability:** ~20-30% over next 12 months

### 🔄 Scenario 3: Sector Rotation (Tech → Value)
| Impact Analysis | Value |
|-----------------|-------|
| Portfolio Impact | +/-X% |
| Winners | [Holdings] |
| Losers | [Holdings] |

**Probability:** ~25-35% over next 12 months

### 🌍 Scenario 4: Recession
| Impact Analysis | Value |
|-----------------|-------|
| Portfolio Loss | -X% |
| Safe Havens | [Holdings] |
| Vulnerable | [Holdings] |

**Probability:** ~15-25% over next 12 months

## Risk Mitigation Recommendations

### 🔴 High Priority (Implement Within 1 Week)
1. **[Action]:** [Specific instruction]
   - Risk Reduced: [X%]
   - Cost: [Transaction/opportunity cost]
   - Implementation: [How to execute]

### 🟡 Medium Priority (Implement Within 1 Month)
1. **[Action]:** [Specific instruction]
   - Risk Reduced: [X%]

### 🟢 Long-Term Improvements
1. **[Strategic change]:** [Description]

### Hedging Strategies
| Strategy | Cost | Protection | Recommendation |
|----------|------|------------|----------------|
| Put options | X% annually | -20% crash | [Yes/No] |
| Collar | X% cap on upside | Downside floor | [Yes/No] |
| Diversification | $X transaction | Correlation reduction | [Yes/No] |

## Monitoring Framework

### Key Risk Indicators (KRIs)
| Indicator | Current | Warning | Critical | Status |
|-----------|---------|---------|----------|--------|
| Portfolio Vol | X% | >25% | >35% | ✅/⚠️/🔴 |
| Max Position | X% | >20% | >25% | ✅/⚠️/🔴 |
| Correlation | X.XX | >0.6 | >0.75 | ✅/⚠️/🔴 |
| Beta | X.XX | >1.3 | >1.5 | ✅/⚠️/🔴 |

### Rebalancing Triggers
- ⚡ **Immediate:** If any holding exceeds X% or falls below Y%
- 📅 **Scheduled:** Review quarterly regardless of drift
- 📉 **Market-driven:** If portfolio drawdown exceeds X%

### Warning Signs to Watch
1. **[Indicator]:** [Threshold that triggers concern]
2. **[Indicator]:** [Threshold that triggers concern]
3. **[Indicator]:** [Threshold that triggers concern]

## Risk Warnings

🔴 **Critical Risks (Cannot be fully mitigated):**
1. [Systemic market risk description]
2. [Concentration risk if applicable]

🟡 **Important Disclosures:**
- Past performance does not guarantee future results
- All projections are estimates based on historical data
- Actual losses may exceed modeled scenarios in extreme events

📊 **Model Limitations:**
- VaR assumes normal market conditions
- Correlation assumptions may break down during crises
- Tail events are inherently difficult to predict`;
  }

  // ============================================================================
  // DATA BUILDERS
  // ============================================================================

  private buildPortfolioSummary(portfolio: GeneratedPortfolio): string {
    const lines: string[] = [
      `PORTFOLIO: ${portfolio.title}`,
      `Description: ${portfolio.description}`,
      `Strategy: ${portfolio.strategy}`,
      `Risk Level: ${portfolio.riskLevel}`,
      `Time Horizon: ${portfolio.timeHorizon}`,
      `Rebalance Frequency: ${portfolio.rebalanceFrequency}`,
      `Expected Return: ${portfolio.expectedReturn}`,
      `Volatility: ${portfolio.volatility}`,
      '',
      `Diversification Score: ${portfolio.diversificationScore || 'N/A'}`,
      `Sharpe Ratio Estimate: ${portfolio.sharpeRatioEstimate || 'N/A'}`,
      '',
    ];

    // Monte Carlo results
    if (portfolio.monteCarloResult) {
      lines.push('MONTE CARLO SIMULATION:');
      lines.push(`  Expected Value: $${portfolio.monteCarloResult.expectedValue.toLocaleString()}`);
      lines.push(`  5th Percentile: $${portfolio.monteCarloResult.percentiles.p5.toLocaleString()}`);
      lines.push(`  50th Percentile: $${portfolio.monteCarloResult.percentiles.p50.toLocaleString()}`);
      lines.push(`  95th Percentile: $${portfolio.monteCarloResult.percentiles.p95.toLocaleString()}`);
      lines.push(`  Probability of Loss: ${portfolio.monteCarloResult.probabilityOfLoss.toFixed(1)}%`);
      lines.push('');
    }

    // Backtest results
    if (portfolio.backtestResult) {
      lines.push('BACKTEST RESULTS:');
      lines.push(`  Total Return: ${portfolio.backtestResult.totalReturn.toFixed(1)}%`);
      lines.push(`  Annualized Return: ${portfolio.backtestResult.annualizedReturn.toFixed(1)}%`);
      lines.push(`  Sharpe Ratio: ${portfolio.backtestResult.sharpeRatio.toFixed(2)}`);
      lines.push(`  Max Drawdown: ${portfolio.backtestResult.maxDrawdown.toFixed(1)}%`);
      lines.push(`  Win Rate: ${portfolio.backtestResult.winRate.toFixed(1)}%`);
      lines.push('');
    }

    // Holdings
    lines.push('HOLDINGS:');
    for (const asset of portfolio.assets) {
      lines.push(`\n${asset.symbol} (${asset.allocation.toFixed(1)}%)`);
      lines.push(`  Name: ${asset.name}`);
      lines.push(`  Sector: ${asset.sector || 'Unknown'}`);
      lines.push(`  Rationale: ${asset.rationale}`);
      
      if (asset.currentPrice) {
        lines.push(`  Current Price: $${asset.currentPrice.toFixed(2)}`);
      }
      
      if (asset.quantMetrics) {
        lines.push(`  Quant Metrics:`);
        lines.push(`    - Sharpe Ratio: ${asset.quantMetrics.sharpeRatio.toFixed(2)}`);
        lines.push(`    - Volatility: ${asset.quantMetrics.volatility.toFixed(1)}%`);
        lines.push(`    - Max Drawdown: ${asset.quantMetrics.maxDrawdown.toFixed(1)}%`);
        lines.push(`    - RSI: ${asset.quantMetrics.rsi.toFixed(0)}`);
        lines.push(`    - Signal: ${asset.quantMetrics.recommendation}`);
        lines.push(`    - Confidence: ${asset.quantMetrics.confidence.toFixed(0)}%`);
      }
      
      if (asset.fundamentals) {
        lines.push(`  Fundamentals:`);
        if (asset.fundamentals.peRatio) lines.push(`    - P/E: ${asset.fundamentals.peRatio.toFixed(1)}`);
        if (asset.fundamentals.returnOnEquity) lines.push(`    - ROE: ${(asset.fundamentals.returnOnEquity * 100).toFixed(1)}%`);
        if (asset.fundamentals.debtToEquity) lines.push(`    - D/E: ${asset.fundamentals.debtToEquity.toFixed(2)}`);
      }
      
      if (asset.sentiment) {
        lines.push(`  Sentiment: ${asset.sentiment.overallSentiment} (Score: ${asset.sentiment.sentimentScore.toFixed(2)})`);
      }
      
      if (asset.analystData) {
        lines.push(`  Analyst: ${asset.analystData.consensusRating}`);
        if (asset.analystData.upside) {
          lines.push(`    - Upside: ${asset.analystData.upside.toFixed(1)}%`);
        }
      }
      
      if (asset.compositeScore) {
        lines.push(`  Composite Score: ${asset.compositeScore}/100`);
      }
    }

    // Risk adjustments
    if (portfolio.riskAdjustments && portfolio.riskAdjustments.length > 0) {
      lines.push('\nRISK ADJUSTMENTS APPLIED:');
      for (const adj of portfolio.riskAdjustments) {
        lines.push(`  - ${adj}`);
      }
    }

    // Quant feedback
    if (portfolio.quantFeedbackSummary) {
      lines.push('\nQUANT FEEDBACK:');
      lines.push(`  Adjustments: ${portfolio.quantFeedbackSummary.adjustmentsCount}`);
      lines.push(`  Flagged Assets: ${portfolio.quantFeedbackSummary.flaggedAssets.join(', ') || 'None'}`);
      if (portfolio.quantFeedbackSummary.actions.length > 0) {
        lines.push('  Actions:');
        for (const action of portfolio.quantFeedbackSummary.actions.slice(0, 5)) {
          lines.push(`    ${action}`);
        }
      }
    }

    return lines.join('\n');
  }

  private buildTickerSummary(data: TickerAnalysisData): string {
    const lines: string[] = [
      `SYMBOL: ${data.symbol}`,
      `Current Price: $${data.currentPrice.toFixed(2)}`,
      '',
    ];

    // Add company info if available
    if (data.fundamentals?.companyName) {
      lines.push(`COMPANY: ${data.fundamentals.companyName}`);
      if (data.fundamentals.sector) lines.push(`  Sector: ${data.fundamentals.sector}`);
      if (data.fundamentals.industry) lines.push(`  Industry: ${data.fundamentals.industry}`);
      lines.push('');
    }

    if (data.quantMetrics) {
      lines.push('QUANTITATIVE METRICS:');
      lines.push(`  Sharpe Ratio: ${data.quantMetrics.sharpeRatio.toFixed(2)}`);
      lines.push(`  Sortino Ratio: ${data.quantMetrics.sortinoRatio.toFixed(2)}`);
      lines.push(`  Annualized Return: ${data.quantMetrics.annualizedReturn.toFixed(1)}%`);
      lines.push(`  Volatility: ${data.quantMetrics.volatility.toFixed(1)}%`);
      lines.push(`  Max Drawdown: ${data.quantMetrics.maxDrawdown.toFixed(1)}%`);
      lines.push(`  RSI: ${data.quantMetrics.rsi.toFixed(0)}`);
      lines.push(`  Signal: ${data.quantMetrics.signal}`);
      lines.push(`  Confidence: ${data.quantMetrics.confidence.toFixed(0)}%`);
      lines.push(`  Beta: ${data.quantMetrics.beta.toFixed(2)}`);
      lines.push(`  Alpha: ${data.quantMetrics.alpha.toFixed(2)}%`);
      lines.push('');
    }

    if (data.fundamentals) {
      lines.push('FUNDAMENTAL METRICS:');
      lines.push(`  Market Cap: $${this.formatLargeNumber(data.fundamentals.marketCap)}`);
      
      // Valuation
      if (data.fundamentals.peRatio) lines.push(`  P/E Ratio: ${data.fundamentals.peRatio.toFixed(1)}`);
      if (data.fundamentals.forwardPE) lines.push(`  Forward P/E: ${data.fundamentals.forwardPE.toFixed(1)}`);
      if (data.fundamentals.pegRatio) lines.push(`  PEG Ratio: ${data.fundamentals.pegRatio.toFixed(2)}`);
      if (data.fundamentals.priceToBook) lines.push(`  P/B Ratio: ${data.fundamentals.priceToBook.toFixed(2)}`);
      if (data.fundamentals.priceToSales) lines.push(`  P/S Ratio: ${data.fundamentals.priceToSales.toFixed(2)}`);
      if (data.fundamentals.evToEbitda) lines.push(`  EV/EBITDA: ${data.fundamentals.evToEbitda.toFixed(1)}`);
      if (data.fundamentals.eps) lines.push(`  EPS: $${data.fundamentals.eps.toFixed(2)}`);
      
      // Profitability
      if (data.fundamentals.profitMargin) lines.push(`  Profit Margin: ${(data.fundamentals.profitMargin * 100).toFixed(1)}%`);
      if (data.fundamentals.operatingMargin) lines.push(`  Operating Margin: ${(data.fundamentals.operatingMargin * 100).toFixed(1)}%`);
      if (data.fundamentals.returnOnEquity) lines.push(`  ROE: ${(data.fundamentals.returnOnEquity * 100).toFixed(1)}%`);
      if (data.fundamentals.returnOnAssets) lines.push(`  ROA: ${(data.fundamentals.returnOnAssets * 100).toFixed(1)}%`);
      
      // Growth
      if (data.fundamentals.revenueGrowthYoY) lines.push(`  Revenue Growth: ${(data.fundamentals.revenueGrowthYoY * 100).toFixed(1)}%`);
      if (data.fundamentals.earningsGrowthYoY) lines.push(`  Earnings Growth: ${(data.fundamentals.earningsGrowthYoY * 100).toFixed(1)}%`);
      
      // Financial Health
      if (data.fundamentals.debtToEquity) lines.push(`  Debt/Equity: ${data.fundamentals.debtToEquity.toFixed(2)}`);
      if (data.fundamentals.currentRatio) lines.push(`  Current Ratio: ${data.fundamentals.currentRatio.toFixed(2)}`);
      if (data.fundamentals.quickRatio) lines.push(`  Quick Ratio: ${data.fundamentals.quickRatio.toFixed(2)}`);
      if (data.fundamentals.freeCashFlow) lines.push(`  Free Cash Flow: $${this.formatLargeNumber(data.fundamentals.freeCashFlow)}`);
      
      // Dividend
      if (data.fundamentals.dividendYield) lines.push(`  Dividend Yield: ${(data.fundamentals.dividendYield * 100).toFixed(2)}%`);
      if (data.fundamentals.payoutRatio) lines.push(`  Payout Ratio: ${(data.fundamentals.payoutRatio * 100).toFixed(1)}%`);
      if (data.fundamentals.dividendSafety) lines.push(`  Dividend Safety: ${data.fundamentals.dividendSafety}`);
      
      // 52-week range
      if (data.fundamentals.fiftyTwoWeekHigh) lines.push(`  52W High: $${data.fundamentals.fiftyTwoWeekHigh.toFixed(2)}`);
      if (data.fundamentals.fiftyTwoWeekLow) lines.push(`  52W Low: $${data.fundamentals.fiftyTwoWeekLow.toFixed(2)}`);
      
      // Advanced metrics
      if (data.fundamentals.altmanZScore) {
        const zStatus = data.fundamentals.altmanZScore > 3 ? 'Safe' : data.fundamentals.altmanZScore > 1.8 ? 'Grey Zone' : 'Distress';
        lines.push(`  Altman Z-Score: ${data.fundamentals.altmanZScore.toFixed(2)} (${zStatus})`);
      }
      if (data.fundamentals.piotroskiFScore) {
        const fStatus = data.fundamentals.piotroskiFScore >= 7 ? 'Strong' : data.fundamentals.piotroskiFScore >= 5 ? 'Average' : 'Weak';
        lines.push(`  Piotroski F-Score: ${data.fundamentals.piotroskiFScore}/9 (${fStatus})`);
      }
      if (data.fundamentals.grahamNumber) lines.push(`  Graham Number: $${data.fundamentals.grahamNumber.toFixed(2)}`);
      if (data.fundamentals.marginOfSafety) {
        const mosStatus = data.fundamentals.marginOfSafety > 25 ? 'Undervalued' : data.fundamentals.marginOfSafety > 0 ? 'Fair Value' : 'Overvalued';
        lines.push(`  Margin of Safety: ${data.fundamentals.marginOfSafety.toFixed(1)}% (${mosStatus})`);
      }
      
      // Factor scores
      lines.push(`  Value Score: ${data.fundamentals.valueScore.toFixed(0)}/100`);
      lines.push(`  Quality Score: ${data.fundamentals.qualityScore.toFixed(0)}/100`);
      lines.push(`  Growth Score: ${data.fundamentals.growthScore.toFixed(0)}/100`);
      
      lines.push('');
    }

    if (data.sentiment) {
      lines.push('MARKET SENTIMENT:');
      lines.push(`  Overall: ${data.sentiment.overallSentiment}`);
      lines.push(`  Score: ${data.sentiment.sentimentScore.toFixed(2)}`);
      lines.push(`  News Count: ${data.sentiment.newsCount}`);
      lines.push('');
    }

    if (data.analystData) {
      lines.push('ANALYST DATA:');
      lines.push(`  Consensus: ${data.analystData.consensusRating}`);
      if (data.analystData.targetPriceMean) lines.push(`  Target Price: $${data.analystData.targetPriceMean.toFixed(2)}`);
      lines.push(`  Number of Analysts: ${data.analystData.numberOfAnalysts}`);
      if (data.analystData.upside) lines.push(`  Upside Potential: ${data.analystData.upside.toFixed(1)}%`);
    }

    return lines.join('\n');
  }

  private buildOptimizationSummary(data: OptimizationData): string {
    const lines: string[] = [
      `PORTFOLIO: ${data.portfolioName}`,
      `Current Health Score: ${data.currentHealthScore.toFixed(0)}/100`,
      `Projected Health Score: ${data.projectedHealthScore.toFixed(0)}/100`,
      `Improvement Potential: +${(data.projectedHealthScore - data.currentHealthScore).toFixed(0)} points`,
      '',
      'CURRENT HOLDINGS:',
    ];

    for (const holding of data.holdings) {
      lines.push(`\n${holding.symbol} (${holding.allocation.toFixed(1)}%)`);
      lines.push(`  Grade: ${holding.grade}`);
      if (holding.issues.length > 0) {
        lines.push(`  Issues:`);
        for (const issue of holding.issues) {
          lines.push(`    - ${issue}`);
        }
      }
    }

    if (data.dropRecommendations.length > 0) {
      lines.push('\nDROP RECOMMENDATIONS:');
      for (const drop of data.dropRecommendations) {
        lines.push(`\n${drop.symbol}`);
        lines.push(`  Reason: ${drop.reason}`);
        lines.push(`  Urgency: ${drop.urgency}`);
      }
    }

    if (data.replacementOptions.length > 0) {
      lines.push('\nREPLACEMENT OPTIONS:');
      for (const replacement of data.replacementOptions) {
        lines.push(`\n${replacement.symbol} (Score: ${replacement.score.toFixed(0)})`);
        lines.push(`  Why Better:`);
        for (const reason of replacement.whyBetter) {
          lines.push(`    - ${reason}`);
        }
      }
    }

    return lines.join('\n');
  }

  private buildRiskSummary(portfolio: GeneratedPortfolio): string {
    const lines: string[] = [
      `PORTFOLIO: ${portfolio.title}`,
      `Risk Level: ${portfolio.riskLevel}`,
      `Volatility Target: ${portfolio.volatility}`,
      '',
    ];

    // Monte Carlo risk metrics
    if (portfolio.monteCarloResult) {
      lines.push('MONTE CARLO RISK METRICS:');
      lines.push(`  Probability of Loss: ${portfolio.monteCarloResult.probabilityOfLoss.toFixed(1)}%`);
      lines.push(`  5th Percentile (Worst Case): $${portfolio.monteCarloResult.percentiles.p5.toLocaleString()}`);
      lines.push(`  Downside Range: $${portfolio.monteCarloResult.percentiles.p5.toLocaleString()} - $${portfolio.monteCarloResult.percentiles.p25.toLocaleString()}`);
      lines.push('');
    }

    // Backtest risk metrics
    if (portfolio.backtestResult) {
      lines.push('HISTORICAL RISK METRICS:');
      lines.push(`  Max Drawdown: ${portfolio.backtestResult.maxDrawdown.toFixed(1)}%`);
      lines.push(`  Worst Year: ${portfolio.backtestResult.worstYear.toFixed(1)}%`);
      lines.push(`  Calmar Ratio: ${portfolio.backtestResult.calmarRatio.toFixed(2)}`);
      lines.push('');
    }

    // Concentration analysis
    lines.push('CONCENTRATION ANALYSIS:');
    const sortedAssets = [...portfolio.assets].sort((a, b) => b.allocation - a.allocation);
    const top3 = sortedAssets.slice(0, 3);
    const top3Allocation = top3.reduce((sum, a) => sum + a.allocation, 0);
    lines.push(`  Top 3 Holdings: ${top3Allocation.toFixed(1)}% of portfolio`);
    for (const asset of top3) {
      lines.push(`    - ${asset.symbol}: ${asset.allocation.toFixed(1)}%`);
    }
    lines.push('');

    // Sector concentration
    const sectorMap = new Map<string, number>();
    for (const asset of portfolio.assets) {
      const sector = asset.sector || 'Unknown';
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + asset.allocation);
    }
    lines.push('SECTOR EXPOSURE:');
    const sectors = Array.from(sectorMap.entries()).sort((a, b) => b[1] - a[1]);
    for (const [sector, allocation] of sectors) {
      lines.push(`  ${sector}: ${allocation.toFixed(1)}%`);
    }
    lines.push('');

    // Individual asset risks
    lines.push('INDIVIDUAL ASSET RISKS:');
    for (const asset of portfolio.assets) {
      if (asset.quantMetrics) {
        const issues: string[] = [];
        if (asset.quantMetrics.volatility > 35) issues.push('High volatility');
        if (asset.quantMetrics.maxDrawdown < -30) issues.push('Large drawdown');
        if (asset.quantMetrics.rsi > 70) issues.push('Overbought');
        if (asset.quantMetrics.rsi < 30) issues.push('Oversold');
        if (asset.quantMetrics.beta && asset.quantMetrics.beta > 1.5) issues.push('High beta');
        
        if (issues.length > 0) {
          lines.push(`  ${asset.symbol}: ${issues.join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }

  // ============================================================================
  // RESPONSE PARSING
  // ============================================================================

  private parseReportResponse(response: string, type: ReportType, title: string): AnalysisReport {
    const sections: ReportSection[] = [];
    const keyTakeaways: string[] = [];
    const actionItems: ActionItem[] = [];
    const riskWarnings: string[] = [];
    let executiveSummary = '';
    let marketContext = '';

    // Split by markdown headers
    const sectionRegex = /##\s+(.+?)(?=\n##|\n*$)/gs;
    let match;

    while ((match = sectionRegex.exec(response)) !== null) {
      const fullSection = match[0];
      const titleMatch = fullSection.match(/##\s+(.+)/);
      const sectionTitle = titleMatch ? titleMatch[1].trim() : 'Section';
      const content = fullSection.replace(/##\s+.+\n/, '').trim();

      if (sectionTitle.toLowerCase().includes('executive summary')) {
        executiveSummary = content;
      } else if (sectionTitle.toLowerCase().includes('key takeaway')) {
        const bullets = content.match(/[-•]\s*(.+)/g);
        if (bullets) {
          keyTakeaways.push(...bullets.map(b => b.replace(/^[-•]\s*/, '').trim()));
        }
      } else if (sectionTitle.toLowerCase().includes('recommendation') || sectionTitle.toLowerCase().includes('action')) {
        const bullets = content.match(/[-•]\s*(.+)/g);
        if (bullets) {
          for (const bullet of bullets) {
            const text = bullet.replace(/^[-•]\s*/, '').trim();
            actionItems.push({
              priority: text.toLowerCase().includes('immediately') || text.toLowerCase().includes('urgent') ? 'high' : 
                       text.toLowerCase().includes('consider') ? 'low' : 'medium',
              action: text,
              rationale: '',
              timeline: 'As soon as practical',
              expectedImpact: 'Improved portfolio performance'
            });
          }
        }
      } else if (sectionTitle.toLowerCase().includes('risk warning') || sectionTitle.toLowerCase().includes('risk factor')) {
        const bullets = content.match(/[-•]\s*(.+)/g);
        if (bullets) {
          riskWarnings.push(...bullets.map(b => b.replace(/^[-•]\s*/, '').trim()));
        }
      } else if (sectionTitle.toLowerCase().includes('market context') || sectionTitle.toLowerCase().includes('outlook')) {
        marketContext = content;
      } else {
        sections.push({
          title: sectionTitle,
          content,
          sentiment: this.detectSentiment(content)
        });
      }
    }

    // Fallback if parsing didn't find sections
    if (sections.length === 0 && !executiveSummary) {
      executiveSummary = response.slice(0, 500);
      sections.push({
        title: 'Analysis',
        content: response,
        sentiment: 'neutral'
      });
    }

    return {
      id: this.generateId(),
      type,
      title,
      generatedAt: new Date().toISOString(),
      executiveSummary: executiveSummary || 'Analysis report generated.',
      sections,
      keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : ['Review the detailed analysis above for specific recommendations.'],
      actionItems: actionItems.length > 0 ? actionItems : [],
      riskWarnings: riskWarnings.length > 0 ? riskWarnings : ['Past performance does not guarantee future results.'],
      marketContext: marketContext || 'Please consult current market data for up-to-date context.',
      disclaimer: 'This report is for informational purposes only and does not constitute investment advice. Always consult with a qualified financial advisor before making investment decisions.',
      metadata: {
        dataAsOf: new Date().toISOString(),
        analysisDepth: 'standard',
        confidence: 75,
        generationTimeMs: 0
      }
    };
  }

  private detectSentiment(content: string): 'positive' | 'neutral' | 'negative' | 'mixed' {
    const positiveWords = ['strong', 'excellent', 'outperform', 'growth', 'bullish', 'recommend', 'opportunity'];
    const negativeWords = ['weak', 'concern', 'risk', 'decline', 'bearish', 'caution', 'avoid'];
    
    const lower = content.toLowerCase();
    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    
    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    if (positiveCount > 0 && negativeCount > 0) return 'mixed';
    return 'neutral';
  }

  private calculateReportConfidence(portfolio: GeneratedPortfolio): number {
    let confidence = 50;
    
    // More data = higher confidence
    const assetsWithMetrics = portfolio.assets.filter(a => a.quantMetrics).length;
    confidence += (assetsWithMetrics / portfolio.assets.length) * 25;
    
    // Monte Carlo results
    if (portfolio.monteCarloResult) confidence += 10;
    
    // Backtest results
    if (portfolio.backtestResult) confidence += 10;
    
    // Diversification
    if (portfolio.diversificationScore && portfolio.diversificationScore > 60) confidence += 5;
    
    return Math.min(95, Math.round(confidence));
  }

  private calculateTickerConfidence(data: TickerAnalysisData): number {
    let confidence = 40;
    
    if (data.quantMetrics) confidence += 25;
    if (data.fundamentals) confidence += 20;
    if (data.sentiment) confidence += 10;
    if (data.analystData) confidence += 10;
    
    return Math.min(95, confidence);
  }

  private formatLargeNumber(num: number): string {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  }

  /**
   * Export report to different formats
   */
  exportToMarkdown(report: AnalysisReport): string {
    const lines: string[] = [
      `# ${report.title}`,
      `*Generated: ${new Date(report.generatedAt).toLocaleString()}*`,
      '',
      '---',
      '',
      '## Executive Summary',
      report.executiveSummary,
      '',
    ];

    for (const section of report.sections) {
      lines.push(`## ${section.title}`);
      lines.push(section.content);
      lines.push('');
    }

    if (report.keyTakeaways.length > 0) {
      lines.push('## Key Takeaways');
      for (const takeaway of report.keyTakeaways) {
        lines.push(`- ${takeaway}`);
      }
      lines.push('');
    }

    if (report.actionItems.length > 0) {
      lines.push('## Action Items');
      for (const item of report.actionItems) {
        lines.push(`- **[${item.priority.toUpperCase()}]** ${item.action}`);
      }
      lines.push('');
    }

    if (report.riskWarnings.length > 0) {
      lines.push('## Risk Warnings');
      for (const warning of report.riskWarnings) {
        lines.push(`⚠️ ${warning}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push(`*${report.disclaimer}*`);
    lines.push('');
    lines.push(`*Analysis Confidence: ${report.metadata.confidence}%*`);

    return lines.join('\n');
  }

  exportToJSON(report: AnalysisReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report to HTML format for better presentation
   */
  exportToHTML(report: AnalysisReport): string {
    const markdown = this.exportToMarkdown(report);
    // Simple markdown to HTML conversion for basic elements
    const html = markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^\*\*(.+?)\*\*/gm, '<strong>$1</strong>')
      .replace(/^\*(.+?)\*/gm, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/⚠️/g, '&#9888;')
      .replace(/✅/g, '&#9989;')
      .replace(/🔴/g, '&#128308;')
      .replace(/🟡/g, '&#128993;')
      .replace(/🟢/g, '&#128994;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #0066ff; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 30px; }
    h3 { color: #1a1a2e; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f8f9fa; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .warning { color: #f59e0b; }
    li { margin: 5px 0; }
    .metadata { color: #666; font-size: 0.9em; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; }
  </style>
</head>
<body>
  ${html}
  <div class="metadata">
    <p>Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
    <p>Confidence: ${report.metadata.confidence}%</p>
    <p>${report.disclaimer}</p>
  </div>
</body>
</html>`;
  }
}

export const analysisReportService = new AnalysisReportService();
export type { AnalysisReportService };
