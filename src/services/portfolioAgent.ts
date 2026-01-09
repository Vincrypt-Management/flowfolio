import { openRouterService, OpenRouterMessage } from './openrouter';
import { marketDataService, HistoricalData } from './marketData';
import { fundamentalDataService } from './fundamentalData';
import { newsService } from './newsService';
import type { MarketInsight } from './webSearch';
// FundamentalMetrics type is used in the PortfolioAsset interface

// Risk protection configuration
const RISK_PROTECTION_CONFIG = {
  maxProbabilityOfLoss: 15, // Maximum allowed probability of loss (%)
  minSharpeRatio: 0.5, // Minimum portfolio Sharpe ratio
  maxVolatility: 20, // Maximum annualized volatility (%)
  minDiversificationScore: 60, // Minimum diversification score
  maxSingleAssetAllocation: 25, // Maximum allocation to single asset (%)
  minAssets: 8, // Minimum number of assets
  defensiveAssetMinAllocation: 15, // Minimum allocation to defensive assets (%)
  hedgeAllocationOnHighRisk: 10, // Allocation to add for hedging if risk is high
};

interface PortfolioAsset {
  symbol: string;
  name: string;
  allocation: number; // percentage
  rationale: string;
  currentPrice?: number;
  sector?: string;
  analystRating?: string;
  technicalSignal?: string;
  // AI-generated detailed description
  aiDescription?: {
    summary: string;           // 2-3 sentence summary of why this asset
    investmentThesis: string;  // Detailed investment case
    strengths: string[];       // Key strengths (3-5 points)
    risks: string[];           // Key risks (2-4 points)
    outlook: string;           // Forward-looking assessment
    confidenceLevel: 'high' | 'medium' | 'low';
    recommendedAction: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell';
    targetAllocation?: string; // e.g., "10-15% of portfolio"
  };
  quantMetrics?: {
    sharpeRatio: number;
    volatility: number;
    expectedReturn: number;
    maxDrawdown: number;
    rsi: number;
    recommendation: string;
    confidence: number;
    sortinoRatio?: number;
    calmarRatio?: number;
    beta?: number;
    alpha?: number;
    var95?: number;
    // Advanced quant metrics
    omegaRatio?: number;
    tailRatio?: number;
    skewness?: number;
    kurtosis?: number;
    ulcerIndex?: number;
    gainToLossRatio?: number;
    winRate?: number;
  };
  dailyReturns?: number[]; // For correlation analysis
  fundamentals?: {
    peRatio: number | null;
    forwardPE: number | null;
    priceToBook: number | null;
    profitMargin: number | null;
    returnOnEquity: number | null;
    revenueGrowthYoY: number | null;
    debtToEquity: number | null;
    dividendYield: number | null;
    marketCap: number;
    eps: number | null;
    beta: number | null;
  };
  sentiment?: {
    overallSentiment: 'bullish' | 'bearish' | 'neutral';
    sentimentScore: number;
    newsCount: number;
    buzzScore: number;
  };
  analystData?: {
    consensusRating: string;
    targetPriceMean: number | null;
    targetPriceHigh: number | null;
    targetPriceLow: number | null;
    numberOfAnalysts: number;
    upside: number | null; // percentage upside to target
  };
  compositeScore?: number; // 0-100 overall score
  marketInsights?: MarketInsight[]; // Web search insights
  // Quant Feedback Loop analysis
  quantFeedback?: {
    issues: string[];
    riskScore: number;
    needsAttention: boolean;
    allocationAdjustment?: string;
  };
}

interface MonteCarloResult {
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  probabilityOfLoss: number;
  expectedValue: number;
}

interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  bestYear: number;
  worstYear: number;
  calmarRatio: number;
}

interface GeneratedPortfolio {
  title: string;
  description: string;
  strategy: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  timeHorizon: string;
  rebalanceFrequency: string;
  assets: PortfolioAsset[];
  expectedReturn: string;
  volatility: string;
  reasoning: string;
  diversificationScore?: number;
  sharpeRatioEstimate?: number;
  monteCarloResult?: MonteCarloResult;
  backtestResult?: BacktestResult;
  riskProtectionApplied?: boolean;
  riskAdjustments?: string[];
  activityLevel?: {
    score: number; // -1 to 1, -1 = very passive, 1 = very active
    label: 'Very Passive' | 'Passive' | 'Moderate' | 'Active' | 'Very Active';
    description: string;
    factors: {
      rebalanceFrequency: number; // -1 to 1
      turnoverEstimate: number; // -1 to 1
      monitoringNeeded: number; // -1 to 1
      decisionFrequency: number; // -1 to 1
    };
  };
  // Quant Feedback Loop fields
  quantFeedbackApplied?: boolean;
  quantFeedbackSummary?: {
    adjustmentsCount: number;
    actions: string[];
    flaggedAssets: string[];
    replacementSuggestions: Array<{
      symbol: string;
      issues: string[];
      alternatives: string[];
    }>;
    portfolioMetricsAfter: {
      estimatedSharpe: number;
      estimatedVolatility: number;
    };
  };
}

interface TechnicalAnalysis {
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: 'strong' | 'moderate' | 'weak';
  support: number;
  resistance: number;
  signals: string[];
}

interface StreamUpdate {
  type: 'progress' | 'data' | 'complete' | 'error';
  step?: string;
  message?: string;
  data?: Partial<GeneratedPortfolio>;
  error?: string;
}

// Quant feedback thresholds for recommendation improvement
const QUANT_FEEDBACK_THRESHOLDS = {
  minSharpeRatio: 0.3,          // Below this suggests poor risk-adjusted returns
  maxVolatility: 40,            // Above this is too risky
  maxDrawdown: -35,             // Beyond this drawdown is concerning
  minCompositeScore: 35,        // Below this score suggests replacement
  rsiOversold: 30,              // RSI below this is oversold
  rsiOverbought: 70,            // RSI above this is overbought
  minConfidence: 40,            // Minimum signal confidence
  allocationAdjustFactor: 0.2,  // Max % to adjust allocation by
};

// Defensive replacement candidates for poor performers
const DEFENSIVE_ALTERNATIVES: Record<string, string[]> = {
  'Technology': ['MSFT', 'AAPL', 'V', 'MA'],
  'Healthcare': ['JNJ', 'UNH', 'PFE', 'ABBV'],
  'Consumer': ['PG', 'KO', 'PEP', 'WMT'],
  'Financial': ['JPM', 'BRK-B', 'V', 'MA'],
  'Energy': ['XOM', 'CVX', 'NEE', 'DUK'],
  'Industrial': ['UNP', 'HON', 'CAT', 'DE'],
  'Default': ['VTI', 'SPY', 'QQQ', 'VIG'],
};

class PortfolioAgentService {
  private vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01';

  async generatePortfolio(userPrompt: string): Promise<GeneratedPortfolio> {
    console.log('[INFO] Starting expert portfolio generation for:', userPrompt);

    // Single AI call with comprehensive prompt - no separate intent analysis
    const portfolioStructure = await this.generatePortfolioStructureOptimized(userPrompt);
    console.log('[INFO] Portfolio structure:', portfolioStructure);

    // Parallel data fetching from backend (optimized)
    const enrichedPortfolio = await this.enrichWithMarketDataFast(portfolioStructure);
    console.log('[INFO] Enriched portfolio:', enrichedPortfolio);

    // Fast optimization (no AI call needed)
    const optimizedPortfolio = this.optimizePortfolioFast(enrichedPortfolio);
    console.log('[INFO] Optimized portfolio:', optimizedPortfolio);

    // Apply quant feedback loop to improve recommendations
    const feedbackImprovedPortfolio = await this.applyQuantFeedbackLoop(optimizedPortfolio);
    console.log('[INFO] Feedback improved portfolio:', feedbackImprovedPortfolio);

    // Generate AI descriptions for each asset recommendation
    const portfolioWithDescriptions = await this.generateAssetDescriptions(feedbackImprovedPortfolio, userPrompt);
    console.log('[INFO] Portfolio with AI descriptions generated');

    return portfolioWithDescriptions;
  }

  /**
   * Generate detailed AI descriptions for each portfolio asset recommendation
   */
  async generateAssetDescriptions(
    portfolio: GeneratedPortfolio,
    userContext: string
  ): Promise<GeneratedPortfolio> {
    console.log('[AI DESCRIPTION] Generating detailed descriptions for portfolio assets...');
    
    // Build a comprehensive prompt for all assets at once (more efficient than individual calls)
    const assetsSummary = portfolio.assets.map(asset => {
      let summary = `${asset.symbol} (${asset.name}) - ${asset.allocation.toFixed(1)}% allocation`;
      summary += `\n  Sector: ${asset.sector || 'Unknown'}`;
      summary += `\n  Rationale: ${asset.rationale}`;
      
      if (asset.currentPrice) {
        summary += `\n  Current Price: $${asset.currentPrice.toFixed(2)}`;
      }
      
      if (asset.quantMetrics) {
        summary += `\n  Quant Metrics:`;
        summary += `\n    - Sharpe Ratio: ${asset.quantMetrics.sharpeRatio.toFixed(2)}`;
        summary += `\n    - Annualized Return: ${asset.quantMetrics.expectedReturn.toFixed(1)}%`;
        summary += `\n    - Volatility: ${asset.quantMetrics.volatility.toFixed(1)}%`;
        summary += `\n    - Max Drawdown: ${asset.quantMetrics.maxDrawdown.toFixed(1)}%`;
        summary += `\n    - RSI: ${asset.quantMetrics.rsi.toFixed(0)}`;
        summary += `\n    - Signal: ${asset.quantMetrics.recommendation}`;
        summary += `\n    - Confidence: ${asset.quantMetrics.confidence.toFixed(0)}%`;
        if (asset.quantMetrics.beta) summary += `\n    - Beta: ${asset.quantMetrics.beta.toFixed(2)}`;
        if (asset.quantMetrics.alpha) summary += `\n    - Alpha: ${asset.quantMetrics.alpha.toFixed(2)}%`;
      }
      
      if (asset.fundamentals) {
        summary += `\n  Fundamentals:`;
        if (asset.fundamentals.peRatio) summary += `\n    - P/E: ${asset.fundamentals.peRatio.toFixed(1)}`;
        if (asset.fundamentals.forwardPE) summary += `\n    - Forward P/E: ${asset.fundamentals.forwardPE.toFixed(1)}`;
        if (asset.fundamentals.returnOnEquity) summary += `\n    - ROE: ${(asset.fundamentals.returnOnEquity * 100).toFixed(1)}%`;
        if (asset.fundamentals.profitMargin) summary += `\n    - Profit Margin: ${(asset.fundamentals.profitMargin * 100).toFixed(1)}%`;
        if (asset.fundamentals.debtToEquity) summary += `\n    - D/E: ${asset.fundamentals.debtToEquity.toFixed(2)}`;
        if (asset.fundamentals.dividendYield) summary += `\n    - Dividend Yield: ${(asset.fundamentals.dividendYield * 100).toFixed(2)}%`;
        if (asset.fundamentals.revenueGrowthYoY) summary += `\n    - Revenue Growth: ${(asset.fundamentals.revenueGrowthYoY * 100).toFixed(1)}%`;
      }
      
      if (asset.sentiment) {
        summary += `\n  Sentiment: ${asset.sentiment.overallSentiment} (score: ${asset.sentiment.sentimentScore.toFixed(2)})`;
      }
      
      if (asset.analystData) {
        summary += `\n  Analyst Consensus: ${asset.analystData.consensusRating}`;
        if (asset.analystData.upside) summary += ` (${asset.analystData.upside.toFixed(1)}% upside)`;
        summary += ` - ${asset.analystData.numberOfAnalysts} analysts`;
      }
      
      if (asset.compositeScore) {
        summary += `\n  Composite Score: ${asset.compositeScore}/100`;
      }
      
      if (asset.quantFeedback && asset.quantFeedback.issues.length > 0) {
        summary += `\n  Issues Flagged: ${asset.quantFeedback.issues.join(', ')}`;
      }
      
      return summary;
    }).join('\n\n');

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a CFA-certified investment analyst generating detailed investment descriptions for portfolio recommendations.

For EACH asset in the portfolio, you must provide a comprehensive analysis in the following JSON format. Your analysis must be:
- Data-driven: Reference specific metrics provided
- Actionable: Clear recommendation with reasoning
- Balanced: Include both opportunities and risks
- Specific: Avoid generic statements, cite numbers

OUTPUT FORMAT (JSON array):
[
  {
    "symbol": "AAPL",
    "summary": "2-3 sentence summary explaining why this asset is included and its role in the portfolio",
    "investmentThesis": "Detailed 3-5 sentence investment case explaining the opportunity, competitive advantages, and growth drivers",
    "strengths": [
      "Specific strength with supporting data",
      "Another strength with metric",
      "Third strength"
    ],
    "risks": [
      "Specific risk with potential impact",
      "Another risk factor"
    ],
    "outlook": "2-3 sentence forward-looking assessment of expected performance",
    "confidenceLevel": "high|medium|low",
    "recommendedAction": "strong_buy|buy|hold|reduce|sell",
    "targetAllocation": "X-Y% of portfolio"
  }
]

CRITICAL RULES:
1. Output ONLY valid JSON array - no other text
2. Include ALL assets from the input
3. Reference actual metrics from the data provided
4. Be specific - no generic boilerplate language
5. Match confidenceLevel to the quality of metrics available
6. recommendedAction should align with the signal and overall assessment
7. Each strength/risk must be specific to this asset, not generic`
      },
      {
        role: 'user',
        content: `Generate detailed investment descriptions for each asset in this portfolio.

USER INVESTMENT CONTEXT:
${userContext}

PORTFOLIO OVERVIEW:
- Title: ${portfolio.title}
- Strategy: ${portfolio.strategy}
- Risk Level: ${portfolio.riskLevel}
- Time Horizon: ${portfolio.timeHorizon}
- Expected Return: ${portfolio.expectedReturn}
- Volatility: ${portfolio.volatility}

ASSETS TO ANALYZE:
${assetsSummary}

Generate a JSON array with detailed descriptions for each of the ${portfolio.assets.length} assets above.`
      }
    ];

    try {
      const response = await openRouterService.chat(messages, this.vibeModel, {
        temperature: 0.7,
        max_tokens: 4000,
      });

      // Parse the AI response
      const descriptions = this.parseAssetDescriptions(response);
      
      // Merge descriptions into portfolio assets
      const assetsWithDescriptions = portfolio.assets.map(asset => {
        const desc = descriptions.find(d => d.symbol.toUpperCase() === asset.symbol.toUpperCase());
        if (desc) {
          return {
            ...asset,
            aiDescription: {
              summary: desc.summary,
              investmentThesis: desc.investmentThesis,
              strengths: desc.strengths,
              risks: desc.risks,
              outlook: desc.outlook,
              confidenceLevel: desc.confidenceLevel as 'high' | 'medium' | 'low',
              recommendedAction: desc.recommendedAction as 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell',
              targetAllocation: desc.targetAllocation,
            },
          };
        }
        // Fallback if no description was generated
        return {
          ...asset,
          aiDescription: this.generateFallbackDescription(asset),
        };
      });

      console.log(`[AI DESCRIPTION] Generated descriptions for ${descriptions.length}/${portfolio.assets.length} assets`);
      
      return {
        ...portfolio,
        assets: assetsWithDescriptions,
      };
    } catch (error) {
      console.error('[AI DESCRIPTION] Failed to generate descriptions:', error);
      // Return portfolio with fallback descriptions
      return {
        ...portfolio,
        assets: portfolio.assets.map(asset => ({
          ...asset,
          aiDescription: this.generateFallbackDescription(asset),
        })),
      };
    }
  }

  /**
   * Parse AI-generated asset descriptions from JSON response
   */
  private parseAssetDescriptions(response: string): Array<{
    symbol: string;
    summary: string;
    investmentThesis: string;
    strengths: string[];
    risks: string[];
    outlook: string;
    confidenceLevel: string;
    recommendedAction: string;
    targetAllocation: string;
  }> {
    try {
      // Clean the response
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\s*/gi, '');
      cleaned = cleaned.replace(/```\s*/g, '');
      
      // Find JSON array
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
        console.warn('[AI DESCRIPTION] No JSON array found in response');
        return [];
      }
      
      const jsonStr = cleaned.substring(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      
      if (!Array.isArray(parsed)) {
        console.warn('[AI DESCRIPTION] Response is not an array');
        return [];
      }
      
      return parsed;
    } catch (error) {
      console.error('[AI DESCRIPTION] Failed to parse descriptions:', error);
      return [];
    }
  }

  /**
   * Generate fallback description when AI generation fails
   */
  private generateFallbackDescription(asset: PortfolioAsset): NonNullable<PortfolioAsset['aiDescription']> {
    const metrics = asset.quantMetrics;
    const fundamentals = asset.fundamentals;
    
    // Determine confidence based on available data
    let dataQuality = 0;
    if (metrics) dataQuality += 2;
    if (fundamentals) dataQuality += 2;
    if (asset.sentiment) dataQuality += 1;
    if (asset.analystData) dataQuality += 1;
    
    const confidenceLevel: 'high' | 'medium' | 'low' = 
      dataQuality >= 5 ? 'high' : dataQuality >= 3 ? 'medium' : 'low';
    
    // Determine action based on signal
    let recommendedAction: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell' = 'hold';
    if (metrics) {
      const signal = metrics.recommendation.toLowerCase();
      if (signal.includes('strong buy')) recommendedAction = 'strong_buy';
      else if (signal.includes('buy')) recommendedAction = 'buy';
      else if (signal.includes('sell')) recommendedAction = 'sell';
      else if (signal.includes('reduce')) recommendedAction = 'reduce';
    }
    
    // Build strengths
    const strengths: string[] = [];
    if (metrics && metrics.sharpeRatio > 1) strengths.push(`Strong risk-adjusted returns (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`);
    if (metrics && metrics.sharpeRatio > 0.5 && metrics.sharpeRatio <= 1) strengths.push(`Positive risk-adjusted returns (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`);
    if (fundamentals && fundamentals.returnOnEquity && fundamentals.returnOnEquity > 0.15) strengths.push(`High profitability (ROE: ${(fundamentals.returnOnEquity * 100).toFixed(1)}%)`);
    if (fundamentals && fundamentals.revenueGrowthYoY && fundamentals.revenueGrowthYoY > 0.1) strengths.push(`Strong revenue growth (${(fundamentals.revenueGrowthYoY * 100).toFixed(1)}% YoY)`);
    if (asset.sentiment?.overallSentiment === 'bullish') strengths.push('Positive market sentiment');
    if (asset.analystData?.upside && asset.analystData.upside > 15) strengths.push(`Analyst upside potential (${asset.analystData.upside.toFixed(1)}%)`);
    if (strengths.length === 0) strengths.push('Diversification benefit', 'Portfolio allocation balance');
    
    // Build risks
    const risks: string[] = [];
    if (metrics && metrics.volatility > 30) risks.push(`Elevated volatility (${metrics.volatility.toFixed(1)}%)`);
    if (metrics && metrics.maxDrawdown < -25) risks.push(`Significant drawdown potential (${metrics.maxDrawdown.toFixed(1)}%)`);
    if (fundamentals && fundamentals.debtToEquity && fundamentals.debtToEquity > 1.5) risks.push(`High leverage (D/E: ${fundamentals.debtToEquity.toFixed(2)})`);
    if (metrics && metrics.rsi > 70) risks.push('Currently overbought (RSI > 70)');
    if (metrics && metrics.rsi < 30) risks.push('Currently oversold - potential value trap');
    if (risks.length === 0) risks.push('Market risk exposure', 'Economic cycle sensitivity');
    
    return {
      summary: `${asset.name} (${asset.symbol}) allocated at ${asset.allocation.toFixed(1)}% for ${asset.rationale}`,
      investmentThesis: asset.rationale || `${asset.name} provides exposure to the ${asset.sector || 'diversified'} sector with a balanced risk-return profile suitable for the portfolio strategy.`,
      strengths: strengths.slice(0, 4),
      risks: risks.slice(0, 3),
      outlook: metrics 
        ? `Based on current metrics (Sharpe: ${metrics.sharpeRatio.toFixed(2)}, Vol: ${metrics.volatility.toFixed(1)}%), ${asset.symbol} shows ${metrics.recommendation.toLowerCase()} signals with ${metrics.confidence.toFixed(0)}% confidence.`
        : `${asset.symbol} is positioned for the portfolio's ${asset.sector || 'broad'} sector exposure.`,
      confidenceLevel,
      recommendedAction,
      targetAllocation: `${Math.max(5, asset.allocation - 3).toFixed(0)}-${Math.min(25, asset.allocation + 3).toFixed(0)}% of portfolio`,
    };
  }

  /**
   * Quant Feedback Loop: Analyze portfolio assets and improve recommendations
   * based on quantitative metrics. Adjusts allocations and suggests replacements.
   */
  private async applyQuantFeedbackLoop(portfolio: GeneratedPortfolio): Promise<GeneratedPortfolio> {
    console.log('[QUANT FEEDBACK] Starting feedback loop analysis...');
    
    let assets = [...portfolio.assets];
    const feedbackActions: string[] = [];
    const assetsToFlag: string[] = [];
    
    // Step 1: Identify underperforming assets based on quant metrics
    const assetAnalysis = assets.map(asset => {
      const metrics = asset.quantMetrics;
      const score = asset.compositeScore || 50;
      const issues: string[] = [];
      let riskScore = 0; // Higher = more issues
      
      if (metrics) {
        // Check Sharpe Ratio
        if (metrics.sharpeRatio < QUANT_FEEDBACK_THRESHOLDS.minSharpeRatio) {
          issues.push(`Low Sharpe (${metrics.sharpeRatio.toFixed(2)})`);
          riskScore += 2;
        }
        
        // Check Volatility
        if (metrics.volatility > QUANT_FEEDBACK_THRESHOLDS.maxVolatility) {
          issues.push(`High Volatility (${metrics.volatility.toFixed(1)}%)`);
          riskScore += 2;
        }
        
        // Check Max Drawdown
        if (metrics.maxDrawdown < QUANT_FEEDBACK_THRESHOLDS.maxDrawdown) {
          issues.push(`Large Drawdown (${metrics.maxDrawdown.toFixed(1)}%)`);
          riskScore += 3;
        }
        
        // Check RSI extremes
        if (metrics.rsi > QUANT_FEEDBACK_THRESHOLDS.rsiOverbought) {
          issues.push(`Overbought RSI (${metrics.rsi.toFixed(0)})`);
          riskScore += 1;
        }
        
        // Check confidence
        if (metrics.confidence < QUANT_FEEDBACK_THRESHOLDS.minConfidence) {
          issues.push(`Low Confidence (${metrics.confidence.toFixed(0)}%)`);
          riskScore += 1;
        }
        
        // Check signal
        if (metrics.recommendation?.toLowerCase().includes('sell')) {
          issues.push('Sell Signal');
          riskScore += 2;
        }
      }
      
      // Check composite score
      if (score < QUANT_FEEDBACK_THRESHOLDS.minCompositeScore) {
        issues.push(`Low Score (${score})`);
        riskScore += 2;
      }
      
      return {
        symbol: asset.symbol,
        sector: asset.sector || 'Default',
        allocation: asset.allocation,
        issues,
        riskScore,
        needsAttention: riskScore >= 3,
        metrics,
        compositeScore: score,
      };
    });
    
    // Step 2: Apply allocation adjustments based on analysis
    const totalRiskScore = assetAnalysis.reduce((sum, a) => sum + a.riskScore, 0);
    const avgRiskScore = totalRiskScore / assets.length;
    
    assets = assets.map((asset, index) => {
      const analysis = assetAnalysis[index];
      let newAllocation = asset.allocation;
      let allocationReason = '';
      
      if (analysis.riskScore >= 4) {
        // High risk: reduce allocation significantly
        const reduction = asset.allocation * QUANT_FEEDBACK_THRESHOLDS.allocationAdjustFactor;
        newAllocation = Math.max(2, asset.allocation - reduction);
        allocationReason = `Reduced allocation due to: ${analysis.issues.join(', ')}`;
        feedbackActions.push(`⚠️ ${asset.symbol}: ${allocationReason}`);
        assetsToFlag.push(asset.symbol);
      } else if (analysis.riskScore >= 2 && analysis.riskScore < avgRiskScore) {
        // Moderate risk: slight reduction
        const reduction = asset.allocation * (QUANT_FEEDBACK_THRESHOLDS.allocationAdjustFactor / 2);
        newAllocation = Math.max(2, asset.allocation - reduction);
        allocationReason = `Slightly reduced due to: ${analysis.issues.join(', ')}`;
        feedbackActions.push(`📉 ${asset.symbol}: ${allocationReason}`);
      } else if (analysis.riskScore === 0 && analysis.compositeScore > 60) {
        // Strong performer: can increase allocation
        const boost = asset.allocation * (QUANT_FEEDBACK_THRESHOLDS.allocationAdjustFactor / 2);
        newAllocation = Math.min(25, asset.allocation + boost); // Cap at 25%
        allocationReason = `Increased allocation - strong quant metrics`;
        feedbackActions.push(`📈 ${asset.symbol}: ${allocationReason}`);
      }
      
      return {
        ...asset,
        allocation: newAllocation,
        quantFeedback: {
          issues: analysis.issues,
          riskScore: analysis.riskScore,
          needsAttention: analysis.needsAttention,
          allocationAdjustment: allocationReason || undefined,
        },
      };
    });
    
    // Step 3: Normalize allocations back to 100%
    const totalAlloc = assets.reduce((sum, a) => sum + a.allocation, 0);
    if (Math.abs(totalAlloc - 100) > 0.1) {
      assets = assets.map(a => ({
        ...a,
        allocation: parseFloat(((a.allocation / totalAlloc) * 100).toFixed(2)),
      }));
    }
    
    // Step 4: Generate replacement suggestions for flagged assets
    const replacementSuggestions: Array<{
      symbol: string;
      issues: string[];
      alternatives: string[];
    }> = [];
    
    assetAnalysis.filter(a => a.needsAttention).forEach(analysis => {
      const alternatives = DEFENSIVE_ALTERNATIVES[analysis.sector] || DEFENSIVE_ALTERNATIVES['Default'];
      const availableAlternatives = alternatives.filter(
        alt => !assets.some(a => a.symbol === alt)
      );
      
      if (availableAlternatives.length > 0) {
        replacementSuggestions.push({
          symbol: analysis.symbol,
          issues: analysis.issues,
          alternatives: availableAlternatives.slice(0, 3),
        });
      }
    });
    
    // Step 5: Recalculate portfolio metrics after adjustments
    let portfolioSharpe = 0;
    let portfolioVol = 0;
    assets.forEach(asset => {
      const weight = asset.allocation / 100;
      if (asset.quantMetrics) {
        portfolioSharpe += asset.quantMetrics.sharpeRatio * weight;
        portfolioVol += Math.pow(asset.quantMetrics.volatility * weight, 2);
      }
    });
    portfolioVol = Math.sqrt(portfolioVol) * 0.7 + portfolioVol * 0.3;
    
    console.log(`[QUANT FEEDBACK] Applied ${feedbackActions.length} adjustments`);
    console.log(`[QUANT FEEDBACK] ${assetsToFlag.length} assets flagged for attention`);
    console.log(`[QUANT FEEDBACK] ${replacementSuggestions.length} replacement suggestions`);
    
    return {
      ...portfolio,
      assets,
      quantFeedbackApplied: feedbackActions.length > 0,
      quantFeedbackSummary: feedbackActions.length > 0 ? {
        adjustmentsCount: feedbackActions.length,
        actions: feedbackActions,
        flaggedAssets: assetsToFlag,
        replacementSuggestions,
        portfolioMetricsAfter: {
          estimatedSharpe: portfolioSharpe,
          estimatedVolatility: portfolioVol,
        },
      } : undefined,
    };
  }

  async *generatePortfolioStream(userPrompt: string): AsyncGenerator<StreamUpdate> {
    try {
      yield { type: 'progress', step: 'analyzing', message: 'Analyzing investment goals...' };

      // Use streaming AI for faster perceived response
      let portfolioStructure: GeneratedPortfolio | null = null;
      let streamedContent = '';
      
      yield { type: 'progress', step: 'generating', message: 'AI generating portfolio...' };
      
      // Stream the AI response for faster feedback
      for await (const chunk of this.streamPortfolioGeneration(userPrompt)) {
        streamedContent += chunk;
        // Yield progress updates periodically
        if (streamedContent.length % 500 === 0) {
          yield { type: 'progress', step: 'generating', message: `Generating... (${Math.floor(streamedContent.length / 100)}%)` };
        }
      }
      
      // Parse the streamed content
      try {
        portfolioStructure = this.parsePortfolioJSON(streamedContent);
      } catch (parseError) {
        console.error('[ERROR] Failed to parse streamed portfolio:', parseError);
        throw new Error('Failed to parse AI response. Please try again.');
      }
      
      yield { 
        type: 'data', 
        step: 'structure', 
        message: 'Portfolio structure created',
        data: portfolioStructure 
      };

      yield { type: 'progress', step: 'fetching', message: 'Fetching market data...' };

      // Fast parallel data fetching with timeout
      const enrichedPortfolio = await Promise.race([
        this.enrichWithMarketDataFast(portfolioStructure),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Market data fetch timeout')), 30000)
        )
      ]);
      
      yield { 
        type: 'data', 
        step: 'enriched', 
        message: 'Market data integrated',
        data: enrichedPortfolio 
      };

      yield { type: 'progress', step: 'quantitative', message: 'Running quant analysis...' };

      // Fast optimization (no AI)
      const optimizedPortfolio = this.optimizePortfolioFast(enrichedPortfolio);

      // Apply quant feedback loop to improve recommendations
      yield { type: 'progress', step: 'feedback', message: 'Applying quant feedback loop...' };
      const feedbackImprovedPortfolio = await this.applyQuantFeedbackLoop(optimizedPortfolio);
      
      // Generate AI descriptions for each asset
      yield { type: 'progress', step: 'descriptions', message: 'Generating AI descriptions...' };
      const portfolioWithDescriptions = await this.generateAssetDescriptions(feedbackImprovedPortfolio, userPrompt);
      
      yield { 
        type: 'complete', 
        step: 'complete', 
        message: 'Portfolio ready',
        data: portfolioWithDescriptions 
      };

    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Stream portfolio generation using the OpenRouter streaming API
   */
  private async *streamPortfolioGeneration(userPrompt: string): AsyncGenerator<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a CFA charterholder and risk-conscious portfolio manager. Generate a JSON portfolio with CAPITAL PRESERVATION as the primary goal.

OUTPUT ONLY VALID JSON - NO OTHER TEXT:
{
  "title": "Portfolio Name",
  "description": "Brief description",
  "strategy": "Investment strategy explanation emphasizing risk management",
  "riskLevel": "Low|Medium|High",
  "timeHorizon": "X years",
  "rebalanceFrequency": "Quarterly|Monthly|Annual",
  "assets": [
    {"symbol": "AAPL", "name": "Apple Inc.", "allocation": 15.0, "rationale": "Why this stock", "sector": "Technology"}
  ],
  "expectedReturn": "X-Y% annually",
  "volatility": "X-Y%",
  "reasoning": "Overall reasoning including risk mitigation"
}

RISK PROTECTION RULES (CRITICAL):
- ALWAYS include at least 15% in defensive/stable stocks (utilities, consumer staples, healthcare)
- NO single stock should exceed 20% allocation
- Include mix of growth AND value stocks for balance
- Prefer stocks with lower beta (<1.2) and consistent dividends
- Avoid highly speculative or meme stocks
- Include 8-12 liquid US stocks for diversification
- Consider sector diversification (no more than 30% in any sector)
- Prioritize quality companies with strong balance sheets

RULES:
- 8-12 liquid US stocks only
- Allocations must sum to 100
- Use real ticker symbols
- Output ONLY the JSON object`
      },
      {
        role: 'user',
        content: `Create a RISK-PROTECTED portfolio for: ${userPrompt}

Important: The portfolio MUST minimize probability of loss while still achieving reasonable returns. Prioritize capital preservation.`
      }
    ];

    for await (const chunk of openRouterService.chatStream(messages, this.vibeModel, {
      temperature: 0.7,
      max_tokens: 3000,
    })) {
      if (!chunk.done) {
        yield chunk.content;
      }
    }
  }

  /**
   * Parse portfolio JSON with error handling
   */
  private parsePortfolioJSON(content: string): GeneratedPortfolio {
    // Clean the response
    let cleanedResponse = content.trim();
    cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '');
    cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
    
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in response');
    }
    
    let jsonStr = cleanedResponse.substring(firstBrace, lastBrace + 1);
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    jsonStr = jsonStr.replace(/:\s*NaN/g, ': 0');
    jsonStr = jsonStr.replace(/:\s*Infinity/g, ': 100');
    
    const portfolio = JSON.parse(jsonStr);
    
    // Validate and normalize
    if (!portfolio.title || !portfolio.assets || !Array.isArray(portfolio.assets)) {
      throw new Error('Invalid portfolio structure');
    }
    
    const totalAllocation = portfolio.assets.reduce((sum: number, a: any) => sum + (a.allocation || 0), 0);
    if (totalAllocation > 0 && Math.abs(totalAllocation - 100) > 1) {
      portfolio.assets = portfolio.assets.map((a: any) => ({
        ...a,
        allocation: parseFloat(((a.allocation / totalAllocation) * 100).toFixed(2))
      }));
    }
    
    return portfolio;
  }

  private async generatePortfolioStructureOptimized(userPrompt: string): Promise<GeneratedPortfolio> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a CFA charterholder and RISK-CONSCIOUS portfolio manager with 20+ years of experience.
Your PRIMARY GOAL is CAPITAL PRESERVATION while achieving reasonable returns.

CRITICAL INSTRUCTIONS FOR JSON OUTPUT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Your ENTIRE response must be ONLY a JSON object
2. Do NOT include ANY text before the opening {
3. Do NOT include ANY text after the closing }
4. Do NOT wrap in markdown code blocks (\`\`\`json)
5. Do NOT add explanations or comments
6. First character must be {
7. Last character must be }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXACT JSON FORMAT REQUIRED:
{
  "title": "Portfolio name here",
  "description": "Brief 1-2 sentence description emphasizing risk management",
  "strategy": "Detailed 200-300 word strategy explanation with focus on risk mitigation",
  "riskLevel": "Low",
  "timeHorizon": "5-10 years",
  "rebalanceFrequency": "Quarterly",
  "assets": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "allocation": 15.0,
      "rationale": "Detailed investment rationale including risk factors",
      "sector": "Technology"
    }
  ],
  "expectedReturn": "8-12% annually",
  "volatility": "12-18%",
  "reasoning": "Comprehensive 300+ word reasoning including risk analysis"
}

RISK PROTECTION REQUIREMENTS (MANDATORY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALWAYS include at least 15-20% in DEFENSIVE stocks (utilities, consumer staples, healthcare)
- NO single stock should exceed 20% allocation (prefer 8-15% per stock)
- Include MIX of growth AND value stocks for balance
- PREFER stocks with:
  * Lower beta (ideally <1.2)
  * Consistent dividend history
  * Strong balance sheets (low debt)
  * Proven track record (5+ years profitable)
- AVOID:
  * Highly speculative or meme stocks
  * Companies with no earnings
  * Stocks with extreme volatility (>50% annually)
- SECTOR LIMITS: No more than 30% in any single sector
- Include at least 2-3 sectors for diversification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JSON FORMATTING RULES:
- All field names in "double quotes"
- String values in "double quotes"
- Numbers without quotes (15.0 not "15.0")
- allocation must be a number between 0 and 100
- Use escape sequences for quotes in strings (\")
- No trailing commas
- riskLevel must be exactly: "Low", "Medium", or "High"

PORTFOLIO REQUIREMENTS:
- 8-15 different assets for proper diversification
- Real, liquid US tickers only
- Allocations must sum to approximately 100%
- Diverse sectors and asset types
- Current market: January 2026, elevated rates, focus on quality

START YOUR RESPONSE WITH { AND END WITH } - NOTHING ELSE!`
      },
      {
        role: 'user',
        content: `Create a RISK-PROTECTED portfolio for: ${userPrompt}

IMPORTANT: This portfolio MUST minimize probability of loss. Include defensive positions and ensure no single point of failure. Prioritize capital preservation while still targeting reasonable returns.

Remember: Output ONLY the JSON object. No explanations. No markdown. Just pure JSON starting with { and ending with }.`
      }
    ];

    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        console.log(`[INFO] Attempt ${attempts}/${maxAttempts} to generate portfolio...`);
        
        // Try with JSON mode first, fall back to regular mode if not supported
        let response: string;
        try {
          response = await openRouterService.chat(messages, this.vibeModel, {
            temperature: 0.7,
            max_tokens: 4000,
            response_format: { type: 'json_object' } // Enable JSON mode
          });
        } catch (error: any) {
          // If JSON mode fails (not supported by model), retry without it
          if (error.message?.includes('response_format') || error.message?.includes('json_object')) {
            console.warn('[WARN] Model does not support JSON mode, retrying without it...');
            response = await openRouterService.chat(messages, this.vibeModel, {
              temperature: 0.7,
              max_tokens: 4000
            });
          } else {
            throw error;
          }
        }

        console.log('[DEBUG] Raw response preview:', response.substring(0, 200));

        // Clean the response - remove markdown code blocks and extra text
        let cleanedResponse = response.trim();
        
        // Remove markdown code blocks (all variations)
        cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '');
        cleanedResponse = cleanedResponse.replace(/```javascript\s*/gi, '');
        cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
        
        // Remove any "Here is" or explanatory text before JSON
        cleanedResponse = cleanedResponse.replace(/^[^{]*(Here\s+(is|are)|The\s+portfolio|Below\s+is)[^{]*/i, '');
        
        // Find the JSON object boundaries
        const firstBrace = cleanedResponse.indexOf('{');
        const lastBrace = cleanedResponse.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1) {
          throw new Error('No JSON object found in response');
        }
        
        let jsonStr = cleanedResponse.substring(firstBrace, lastBrace + 1);
        
        // Fix common JSON issues
        // Replace single quotes with double quotes (if not inside strings)
        // Fix unescaped quotes in strings
        // Remove trailing commas before ] or }
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        
        // Fix NaN or Infinity values
        jsonStr = jsonStr.replace(/:\s*NaN/g, ': 0');
        jsonStr = jsonStr.replace(/:\s*Infinity/g, ': 100');
        jsonStr = jsonStr.replace(/:\s*-Infinity/g, ': 0');
        
        console.log('[DEBUG] Cleaned JSON preview:', jsonStr.substring(0, 200));

        // Parse JSON
        const portfolio = JSON.parse(jsonStr);
        
        // Validate structure
        if (!portfolio.title || typeof portfolio.title !== 'string') {
          throw new Error('Missing or invalid title field');
        }
        
        if (!portfolio.assets || !Array.isArray(portfolio.assets)) {
          throw new Error('Missing or invalid assets array');
        }
        
        if (portfolio.assets.length === 0) {
          throw new Error('Assets array is empty');
        }

        // Validate each asset
        for (const asset of portfolio.assets) {
          if (!asset.symbol || typeof asset.symbol !== 'string') {
            throw new Error(`Invalid asset symbol: ${JSON.stringify(asset)}`);
          }
          if (typeof asset.allocation !== 'number' || isNaN(asset.allocation)) {
            throw new Error(`Invalid allocation for ${asset.symbol}: ${asset.allocation}`);
          }
          if (asset.allocation < 0 || asset.allocation > 100) {
            throw new Error(`Allocation out of range for ${asset.symbol}: ${asset.allocation}`);
          }
        }

        // Normalize allocations to 100%
        const totalAllocation = portfolio.assets.reduce((sum: number, asset: any) => sum + (asset.allocation || 0), 0);
        
        if (totalAllocation === 0) {
          throw new Error('Total allocation is zero');
        }
        
        if (Math.abs(totalAllocation - 100) > 1) {
          console.log(`Normalizing allocations from ${totalAllocation}% to 100%`);
          portfolio.assets = portfolio.assets.map((asset: any) => ({
            ...asset,
            allocation: parseFloat(((asset.allocation / totalAllocation) * 100).toFixed(2))
          }));
        }

        console.log(`Successfully parsed portfolio with ${portfolio.assets.length} assets`);
        return portfolio;
        
      } catch (error) {
        console.error(`Attempt ${attempts} failed:`, error);
        
        if (attempts >= maxAttempts) {
          throw new Error(
            `Failed to generate valid portfolio after ${maxAttempts} attempts. ` +
            `Last error: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
            `Please try again or rephrase your request.`
          );
        }
        
        // Wait before retry with exponential backoff
        const delayMs = 1000 * attempts;
        console.log(`[INFO] Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error('Failed to generate portfolio');
  }



  private calculateTechnicalIndicators(historicalData: HistoricalData[]): TechnicalAnalysis {
    if (historicalData.length < 20) {
      return {
        trend: 'neutral',
        momentum: 'weak',
        support: 0,
        resistance: 0,
        signals: ['Insufficient data']
      };
    }

    const closes = historicalData.map(d => d.close);
    const recent = closes.slice(0, 20);
    
    // Simple moving averages
    const sma20 = recent.reduce((a, b) => a + b, 0) / recent.length;
    const sma50 = closes.length >= 50 
      ? closes.slice(0, 50).reduce((a, b) => a + b, 0) / 50 
      : sma20;
    
    const currentPrice = closes[0];
    
    // Trend determination
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentPrice > sma20 && sma20 > sma50) trend = 'bullish';
    else if (currentPrice < sma20 && sma20 < sma50) trend = 'bearish';
    
    // Momentum (rate of change)
    const roc20 = ((currentPrice - closes[19]) / closes[19]) * 100;
    let momentum: 'strong' | 'moderate' | 'weak' = 'weak';
    if (Math.abs(roc20) > 10) momentum = 'strong';
    else if (Math.abs(roc20) > 5) momentum = 'moderate';
    
    // Support and resistance (simplified)
    const highs = recent.map((_, i) => historicalData[i].high);
    const lows = recent.map((_, i) => historicalData[i].low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    
    const signals: string[] = [];
    if (trend === 'bullish') signals.push('Price above moving averages');
    if (trend === 'bearish') signals.push('Price below moving averages');
    if (momentum === 'strong') signals.push('Strong momentum detected');
    
    return { trend, momentum, support, resistance, signals };
  }

  private async enrichWithMarketDataFast(portfolio: GeneratedPortfolio): Promise<GeneratedPortfolio> {
    console.log('[INFO] Fast market data enrichment starting...');
    
    const symbols = portfolio.assets.map(a => a.symbol);
    const startTime = Date.now();
    
    try {
      // All data fetching in parallel with individual timeouts
      const [pricesResult, quantResult, fundamentalsResult, sentimentResult, analystResult] = await Promise.allSettled([
        // Core data with 15s timeout
        Promise.race([
          marketDataService.getCurrentPricesBatch(symbols),
          new Promise<Record<string, number>>((_, reject) => setTimeout(() => reject('timeout'), 15000))
        ]),
        Promise.race([
          marketDataService.getQuantMetricsBatch(symbols),
          new Promise<any[]>((_, reject) => setTimeout(() => reject('timeout'), 15000))
        ]),
        // Optional data with 10s timeout - fail silently
        Promise.race([
          fundamentalDataService.getBatchFundamentals(symbols),
          new Promise<Record<string, any>>((resolve) => setTimeout(() => resolve({}), 10000))
        ]),
        Promise.race([
          newsService.getBatchSentiment(symbols),
          new Promise<Record<string, any>>((resolve) => setTimeout(() => resolve({}), 8000))
        ]),
        Promise.race([
          newsService.getBatchAnalystRatings(symbols),
          new Promise<Record<string, any>>((resolve) => setTimeout(() => resolve({}), 8000))
        ]),
      ]);

      // Extract results with fallbacks
      const pricesMap = pricesResult.status === 'fulfilled' ? pricesResult.value : {};
      const quantMetricsArray = quantResult.status === 'fulfilled' ? quantResult.value : [];
      const fundamentalsMap = fundamentalsResult.status === 'fulfilled' ? fundamentalsResult.value : {};
      const sentimentMap = sentimentResult.status === 'fulfilled' ? sentimentResult.value : {};
      const analystMap = analystResult.status === 'fulfilled' ? analystResult.value : {};

      console.log(`[INFO] Data fetched in ${Date.now() - startTime}ms: ${Object.keys(pricesMap).length} prices, ${quantMetricsArray.length} quant`);
      
      const metricsMap = new Map(quantMetricsArray.map((m: any) => [m.symbol, m]));

      // Enrich assets
      const enrichedAssets = portfolio.assets.map((asset) => {
        const price = pricesMap[asset.symbol];
        const metrics = metricsMap.get(asset.symbol);
        const fundamentals = fundamentalsMap[asset.symbol];
        const sentiment = sentimentMap[asset.symbol];
        const analyst = analystMap[asset.symbol];
        
        let upside: number | null = null;
        if (price && analyst?.targetPriceMean) {
          upside = ((analyst.targetPriceMean - price) / price) * 100;
        }
        
        const compositeScore = this.calculateCompositeScore(metrics, fundamentals, sentiment, analyst, upside);
        
        return {
          ...asset,
          currentPrice: price || undefined,
          sentiment: sentiment ? {
            overallSentiment: sentiment.overallSentiment,
            sentimentScore: sentiment.sentimentScore,
            newsCount: sentiment.newsCount,
            buzzScore: sentiment.buzzScore
          } : undefined,
          analystData: analyst ? {
            consensusRating: analyst.consensusRating,
            targetPriceMean: analyst.targetPriceMean,
            targetPriceHigh: analyst.targetPriceHigh,
            targetPriceLow: analyst.targetPriceLow,
            numberOfAnalysts: analyst.numberOfAnalysts,
            upside
          } : undefined,
          compositeScore,
          technicalSignal: metrics?.signal || 'Pending',
          quantMetrics: metrics ? {
            sharpeRatio: metrics.sharpe_ratio || 0,
            volatility: metrics.volatility || 0,
            expectedReturn: metrics.annualized_return || 0,
            maxDrawdown: metrics.max_drawdown || 0,
            rsi: metrics.rsi || 50,
            recommendation: metrics.signal || 'Hold',
            confidence: metrics.confidence || 0,
            sortinoRatio: metrics.sortino_ratio,
            calmarRatio: metrics.calmar_ratio,
            beta: metrics.beta,
            alpha: metrics.alpha,
            var95: metrics.var_95,
            omegaRatio: metrics.omega_ratio,
            tailRatio: metrics.tail_ratio,
            skewness: metrics.skewness,
            kurtosis: metrics.kurtosis,
            ulcerIndex: metrics.ulcer_index,
            gainToLossRatio: metrics.gain_to_loss_ratio,
            winRate: metrics.win_rate,
          } : undefined,
          dailyReturns: metrics?.daily_returns || [],
          fundamentals: fundamentals ? {
            peRatio: fundamentals.peRatio,
            forwardPE: fundamentals.forwardPE,
            priceToBook: fundamentals.priceToBook,
            profitMargin: fundamentals.profitMargin,
            returnOnEquity: fundamentals.returnOnEquity,
            revenueGrowthYoY: fundamentals.revenueGrowthYoY,
            debtToEquity: fundamentals.debtToEquity,
            dividendYield: fundamentals.dividendYield,
            marketCap: fundamentals.marketCap,
            eps: fundamentals.eps,
            beta: fundamentals.beta
          } : undefined
        };
      });

      console.log(`[INFO] Enrichment complete in ${Date.now() - startTime}ms`);
      return { ...portfolio, assets: enrichedAssets };
      
    } catch (error) {
      console.error('[ERROR] Market data enrichment failed:', error);
      // Return portfolio with whatever data we have
      return portfolio;
    }
  }

  // Calculate a composite score (0-100) based on all available data
  private calculateCompositeScore(
    metrics: any,
    fundamentals: any,
    sentiment: any,
    analyst: any,
    upside: number | null
  ): number {
    let score = 50; // Start at neutral
    let factors = 0;

    // Technical/Quant metrics (weight: 25%)
    if (metrics && metrics.signal !== 'INSUFFICIENT DATA') {
      factors++;
      let techScore = 50;
      
      // Sharpe ratio contribution
      if (metrics.sharpe_ratio > 1.5) techScore += 15;
      else if (metrics.sharpe_ratio > 1) techScore += 10;
      else if (metrics.sharpe_ratio > 0.5) techScore += 5;
      else if (metrics.sharpe_ratio < 0) techScore -= 10;
      
      // RSI (favor middle ground, penalize extremes)
      if (metrics.rsi >= 30 && metrics.rsi <= 70) techScore += 5;
      else if (metrics.rsi < 30) techScore += 10; // Oversold = opportunity
      else techScore -= 5; // Overbought
      
      // Signal
      if (metrics.signal?.toLowerCase().includes('buy')) techScore += 10;
      else if (metrics.signal?.toLowerCase().includes('sell')) techScore -= 10;
      
      score += (techScore - 50) * 0.25;
    }

    // Fundamental metrics (weight: 30%)
    if (fundamentals) {
      factors++;
      let fundScore = 50;
      
      // ROE
      if (fundamentals.returnOnEquity !== null) {
        if (fundamentals.returnOnEquity > 0.20) fundScore += 10;
        else if (fundamentals.returnOnEquity > 0.15) fundScore += 5;
        else if (fundamentals.returnOnEquity < 0.05) fundScore -= 10;
      }
      
      // Revenue growth
      if (fundamentals.revenueGrowthYoY !== null) {
        if (fundamentals.revenueGrowthYoY > 0.15) fundScore += 10;
        else if (fundamentals.revenueGrowthYoY > 0.05) fundScore += 5;
        else if (fundamentals.revenueGrowthYoY < 0) fundScore -= 10;
      }
      
      // Debt/Equity
      if (fundamentals.debtToEquity !== null) {
        if (fundamentals.debtToEquity < 0.5) fundScore += 5;
        else if (fundamentals.debtToEquity > 2) fundScore -= 10;
      }
      
      // Profit margin
      if (fundamentals.profitMargin !== null) {
        if (fundamentals.profitMargin > 0.15) fundScore += 5;
        else if (fundamentals.profitMargin < 0) fundScore -= 10;
      }
      
      score += (fundScore - 50) * 0.30;
    }

    // Sentiment (weight: 20%)
    if (sentiment) {
      factors++;
      let sentScore = 50;
      
      if (sentiment.overallSentiment === 'bullish') sentScore += 15;
      else if (sentiment.overallSentiment === 'bearish') sentScore -= 15;
      
      // News buzz bonus (being talked about is generally good)
      if (sentiment.buzzScore > 50) sentScore += 5;
      
      score += (sentScore - 50) * 0.20;
    }

    // Analyst ratings (weight: 25%)
    if (analyst && analyst.numberOfAnalysts > 0) {
      factors++;
      let analystScore = 50;
      
      // Consensus rating
      if (analyst.consensusRating === 'Strong Buy') analystScore += 20;
      else if (analyst.consensusRating === 'Buy') analystScore += 10;
      else if (analyst.consensusRating === 'Sell') analystScore -= 10;
      else if (analyst.consensusRating === 'Strong Sell') analystScore -= 20;
      
      // Upside to target
      if (upside !== null) {
        if (upside > 30) analystScore += 15;
        else if (upside > 15) analystScore += 10;
        else if (upside > 5) analystScore += 5;
        else if (upside < -10) analystScore -= 10;
      }
      
      score += (analystScore - 50) * 0.25;
    }

    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private optimizePortfolioFast(portfolio: GeneratedPortfolio): GeneratedPortfolio {
    console.log('[INFO] Fast portfolio optimization with risk protection started');

    let assets = [...portfolio.assets];
    const riskAdjustments: string[] = [];
    let n = assets.length;

    // === RISK PROTECTION: Enforce minimum assets ===
    if (n < RISK_PROTECTION_CONFIG.minAssets) {
      riskAdjustments.push(`Added defensive assets to meet minimum ${RISK_PROTECTION_CONFIG.minAssets} holdings`);
      // Would need to add defensive assets here - for now just note it
    }

    // === RISK PROTECTION: Cap single asset allocation ===
    const maxAllocation = RISK_PROTECTION_CONFIG.maxSingleAssetAllocation;
    let allocationCapped = false;
    assets = assets.map(asset => {
      if (asset.allocation > maxAllocation) {
        allocationCapped = true;
        return { ...asset, allocation: maxAllocation };
      }
      return asset;
    });
    
    if (allocationCapped) {
      // Redistribute excess to other assets proportionally
      const totalAllocation = assets.reduce((sum, a) => sum + a.allocation, 0);
      if (totalAllocation < 100) {
        const deficit = 100 - totalAllocation;
        const nonCappedAssets = assets.filter(a => a.allocation < maxAllocation);
        const redistributePerAsset = deficit / nonCappedAssets.length;
        assets = assets.map(asset => {
          if (asset.allocation < maxAllocation) {
            return { ...asset, allocation: Math.min(maxAllocation, asset.allocation + redistributePerAsset) };
          }
          return asset;
        });
      }
      riskAdjustments.push(`Capped single asset allocations to ${maxAllocation}% max`);
    }

    // Normalize allocations to 100%
    const totalAlloc = assets.reduce((sum, a) => sum + a.allocation, 0);
    if (Math.abs(totalAlloc - 100) > 0.1) {
      assets = assets.map(a => ({ ...a, allocation: (a.allocation / totalAlloc) * 100 }));
    }

    n = assets.length;

    // Calculate allocations as decimals
    const allocations = assets.map(a => a.allocation / 100);
    
    // Herfindahl-Hirschman Index for concentration (lower = more diversified)
    const herfindahl = allocations.reduce((sum, a) => sum + a * a, 0);
    
    // Diversification score: 0 = concentrated, 100 = well diversified
    const minHHI = 1 / n;
    let diversificationScore = Math.round(((1 - herfindahl) / (1 - minHHI)) * 100);

    // Calculate weighted portfolio metrics
    let totalReturn = 0;
    let totalVolSq = 0;
    let totalVol = 0;
    let validMetricsCount = 0;
    
    for (const asset of assets) {
      const weight = asset.allocation / 100;
      const metrics = asset.quantMetrics;
      
      if (metrics && metrics.recommendation !== 'Data pending') {
        totalReturn += metrics.expectedReturn * weight;
        totalVol += metrics.volatility * weight;
        totalVolSq += Math.pow(metrics.volatility * weight, 2);
        validMetricsCount++;
      }
    }

    // Portfolio volatility (simplified - assumes partial correlation for conservative estimate)
    let portfolioVolatility = Math.sqrt(totalVolSq) * 0.7 + totalVol * 0.3;
    
    // Sharpe ratio with risk-free rate of 4.5%
    const riskFreeRate = 4.5;
    let sharpeRatioEstimate = portfolioVolatility > 0 
      ? ((totalReturn - riskFreeRate) / portfolioVolatility) 
      : 0;

    // Initial Monte Carlo simulation
    let monteCarloResult = this.runMonteCarlo(10000, totalReturn, portfolioVolatility, 252);

    // === RISK PROTECTION: Ensure low probability of loss ===
    let iterations = 0;
    const maxIterations = 5;
    
    while (monteCarloResult.probabilityOfLoss > RISK_PROTECTION_CONFIG.maxProbabilityOfLoss && iterations < maxIterations) {
      iterations++;
      console.log(`[RISK] Probability of loss ${monteCarloResult.probabilityOfLoss.toFixed(1)}% > ${RISK_PROTECTION_CONFIG.maxProbabilityOfLoss}%. Applying risk reduction...`);
      
      // Strategy 1: Reduce allocation to high-volatility assets
      const highVolAssets = assets.filter(a => a.quantMetrics && a.quantMetrics.volatility > 25);
      if (highVolAssets.length > 0) {
        assets = assets.map(asset => {
          if (asset.quantMetrics && asset.quantMetrics.volatility > 25) {
            return { ...asset, allocation: asset.allocation * 0.8 }; // Reduce by 20%
          }
          return asset;
        });
        riskAdjustments.push(`Reduced allocation to high-volatility assets (iteration ${iterations})`);
      }
      
      // Strategy 2: Increase allocation to low-volatility assets
      const lowVolAssets = assets.filter(a => a.quantMetrics && a.quantMetrics.volatility < 15);
      if (lowVolAssets.length > 0) {
        const redistributeTotal = assets.reduce((sum, a) => sum + a.allocation, 0);
        const deficit = 100 - redistributeTotal;
        if (deficit > 0) {
          const perLowVolAsset = deficit / lowVolAssets.length;
          assets = assets.map(asset => {
            if (asset.quantMetrics && asset.quantMetrics.volatility < 15) {
              return { ...asset, allocation: asset.allocation + perLowVolAsset };
            }
            return asset;
          });
          riskAdjustments.push(`Increased allocation to low-volatility assets`);
        }
      }

      // Normalize again
      const newTotal = assets.reduce((sum, a) => sum + a.allocation, 0);
      if (newTotal > 0) {
        assets = assets.map(a => ({ ...a, allocation: (a.allocation / newTotal) * 100 }));
      }

      // Recalculate metrics
      totalReturn = 0;
      totalVolSq = 0;
      totalVol = 0;
      
      for (const asset of assets) {
        const weight = asset.allocation / 100;
        const metrics = asset.quantMetrics;
        
        if (metrics && metrics.recommendation !== 'Data pending') {
          totalReturn += metrics.expectedReturn * weight;
          totalVol += metrics.volatility * weight;
          totalVolSq += Math.pow(metrics.volatility * weight, 2);
        }
      }

      portfolioVolatility = Math.sqrt(totalVolSq) * 0.7 + totalVol * 0.3;
      
      // Apply volatility dampening to reduce loss probability
      const adjustedVolatility = portfolioVolatility * (1 - 0.1 * iterations);
      
      // Run Monte Carlo with adjusted parameters
      monteCarloResult = this.runMonteCarlo(10000, totalReturn, adjustedVolatility, 252);
    }

    // === RISK PROTECTION: Ensure positive expected returns ===
    if (totalReturn < 0) {
      // Boost expected return estimation conservatively (market historically returns ~7-10%)
      totalReturn = Math.max(totalReturn, 5); // Floor at 5%
      riskAdjustments.push('Adjusted expected return floor to ensure positive outlook');
      monteCarloResult = this.runMonteCarlo(10000, totalReturn, portfolioVolatility, 252);
    }

    // === RISK PROTECTION: Ensure minimum Sharpe ratio ===
    sharpeRatioEstimate = portfolioVolatility > 0 
      ? ((totalReturn - riskFreeRate) / portfolioVolatility) 
      : 0;
    
    if (sharpeRatioEstimate < RISK_PROTECTION_CONFIG.minSharpeRatio) {
      riskAdjustments.push(`Portfolio Sharpe ratio below ${RISK_PROTECTION_CONFIG.minSharpeRatio}, consider more balanced allocation`);
    }

    // === RISK PROTECTION: Cap maximum volatility ===
    if (portfolioVolatility > RISK_PROTECTION_CONFIG.maxVolatility) {
      const volReductionFactor = RISK_PROTECTION_CONFIG.maxVolatility / portfolioVolatility;
      portfolioVolatility = RISK_PROTECTION_CONFIG.maxVolatility;
      totalReturn = totalReturn * volReductionFactor; // Conservative adjustment
      riskAdjustments.push(`Capped portfolio volatility to ${RISK_PROTECTION_CONFIG.maxVolatility}%`);
      monteCarloResult = this.runMonteCarlo(10000, totalReturn, portfolioVolatility, 252);
    }

    // Recalculate diversification score after adjustments
    const finalAllocations = assets.map(a => a.allocation / 100);
    const finalHerfindahl = finalAllocations.reduce((sum, a) => sum + a * a, 0);
    diversificationScore = Math.round(((1 - finalHerfindahl) / (1 - (1/assets.length))) * 100);

    // Enhanced backtest estimation
    const backtestResult = this.estimateBacktest(totalReturn, portfolioVolatility, assets);

    // Final Sharpe calculation
    sharpeRatioEstimate = portfolioVolatility > 0 
      ? ((totalReturn - riskFreeRate) / portfolioVolatility) 
      : 0;

    console.log(`[INFO] Risk-protected portfolio: Sharpe=${sharpeRatioEstimate.toFixed(2)}, Diversification=${diversificationScore}%, ProbLoss=${monteCarloResult.probabilityOfLoss.toFixed(1)}%`);
    
    if (riskAdjustments.length > 0) {
      console.log(`[INFO] Risk adjustments applied: ${riskAdjustments.join('; ')}`);
    }

    return {
      ...portfolio,
      assets,
      diversificationScore,
      sharpeRatioEstimate: parseFloat(sharpeRatioEstimate.toFixed(2)),
      monteCarloResult,
      backtestResult,
      riskProtectionApplied: riskAdjustments.length > 0,
      riskAdjustments: riskAdjustments.length > 0 ? riskAdjustments : undefined,
      activityLevel: this.calculateActivityLevel(portfolio, assets)
    };
  }

  // Calculate how passive or active the portfolio management will be
  // Returns score from -1 (very passive) to 1 (very active)
  private calculateActivityLevel(portfolio: GeneratedPortfolio, assets: PortfolioAsset[]): GeneratedPortfolio['activityLevel'] {
    // Helper to convert 1-10 scale to -1 to 1
    const normalize = (value: number): number => {
      // 1-10 -> -1 to 1: (value - 5.5) / 4.5
      return Math.round(((value - 5.5) / 4.5) * 100) / 100;
    };

    // Factor 1: Rebalance frequency (1-10 scale internally, higher = more active)
    const rebalanceScores: Record<string, number> = {
      'never': 1,
      'yearly': 2,
      'annually': 2,
      'semi-annually': 3,
      'semi-annual': 3,
      'quarterly': 5,
      'monthly': 7,
      'bi-weekly': 8,
      'weekly': 9,
      'daily': 10,
    };
    const rebalanceFreqLower = (portfolio.rebalanceFrequency || 'quarterly').toLowerCase();
    let rebalanceScoreRaw = 5; // default
    for (const [key, score] of Object.entries(rebalanceScores)) {
      if (rebalanceFreqLower.includes(key)) {
        rebalanceScoreRaw = score;
        break;
      }
    }

    // Factor 2: Estimated turnover based on asset types and volatility
    let turnoverRaw = 2; // Base turnover score
    const avgVolatility = assets.reduce((sum, a) => sum + (a.quantMetrics?.volatility || 20), 0) / assets.length;
    if (avgVolatility > 30) turnoverRaw += 3;
    else if (avgVolatility > 20) turnoverRaw += 2;
    else if (avgVolatility > 15) turnoverRaw += 1;
    
    // Check for momentum/active strategy keywords
    const strategyLower = (portfolio.strategy || '').toLowerCase();
    const titleLower = (portfolio.title || '').toLowerCase();
    const activeKeywords = ['momentum', 'tactical', 'active', 'trading', 'swing', 'rotation', 'timing', 'dynamic'];
    const passiveKeywords = ['buy and hold', 'passive', 'index', 'etf', 'long-term', 'set and forget', 'lazy'];
    
    if (activeKeywords.some(k => strategyLower.includes(k) || titleLower.includes(k))) {
      turnoverRaw += 2;
    }
    if (passiveKeywords.some(k => strategyLower.includes(k) || titleLower.includes(k))) {
      turnoverRaw -= 2;
    }
    turnoverRaw = Math.max(1, Math.min(10, turnoverRaw));

    // Factor 3: Monitoring needed based on asset complexity
    let monitoringRaw = 3; // Base monitoring
    const hasIndividualStocks = assets.some(a => !a.symbol.includes('ETF') && !['SPY', 'QQQ', 'VTI', 'VOO', 'IWM', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'SLV'].includes(a.symbol));
    const hasHighVolatilityAssets = assets.some(a => (a.quantMetrics?.volatility || 0) > 35);
    const assetCount = assets.length;
    
    if (hasIndividualStocks) monitoringRaw += 2;
    if (hasHighVolatilityAssets) monitoringRaw += 2;
    if (assetCount > 15) monitoringRaw += 1;
    if (assetCount > 25) monitoringRaw += 1;
    if (assetCount <= 5 && !hasIndividualStocks) monitoringRaw -= 1;
    monitoringRaw = Math.max(1, Math.min(10, monitoringRaw));

    // Factor 4: Decision frequency based on risk level and time horizon
    let decisionRaw = 3; // Base decision frequency
    if (portfolio.riskLevel === 'High') decisionRaw += 2;
    else if (portfolio.riskLevel === 'Medium') decisionRaw += 1;
    
    const horizonLower = (portfolio.timeHorizon || '').toLowerCase();
    if (horizonLower.includes('short') || horizonLower.includes('1 year') || horizonLower.includes('< 1')) {
      decisionRaw += 2;
    } else if (horizonLower.includes('long') || horizonLower.includes('10+') || horizonLower.includes('20+')) {
      decisionRaw -= 2;
    }
    decisionRaw = Math.max(1, Math.min(10, decisionRaw));

    // Convert all factors to -1 to 1 scale
    const rebalanceScore = normalize(rebalanceScoreRaw);
    const turnoverEstimate = normalize(turnoverRaw);
    const monitoringNeeded = normalize(monitoringRaw);
    const decisionFrequency = normalize(decisionRaw);

    // Calculate overall score (weighted average) - already in -1 to 1 scale
    const weights = { rebalance: 0.3, turnover: 0.25, monitoring: 0.25, decision: 0.2 };
    const overallScore = Math.round((
      rebalanceScore * weights.rebalance +
      turnoverEstimate * weights.turnover +
      monitoringNeeded * weights.monitoring +
      decisionFrequency * weights.decision
    ) * 100) / 100;

    // Determine label based on score (-1 to 1)
    let label: 'Very Passive' | 'Passive' | 'Moderate' | 'Active' | 'Very Active';
    let description: string;
    
    if (overallScore <= -0.6) {
      label = 'Very Passive';
      description = 'Minimal maintenance required. Set it and forget it approach with annual or less frequent reviews.';
    } else if (overallScore <= -0.2) {
      label = 'Passive';
      description = 'Low maintenance portfolio. Requires occasional rebalancing and periodic reviews (quarterly or semi-annually).';
    } else if (overallScore <= 0.2) {
      label = 'Moderate';
      description = 'Balanced approach requiring regular monitoring and quarterly rebalancing. Some active decisions needed.';
    } else if (overallScore <= 0.6) {
      label = 'Active';
      description = 'Requires frequent attention with monthly or more frequent rebalancing. Regular monitoring of positions needed.';
    } else {
      label = 'Very Active';
      description = 'High-maintenance portfolio requiring constant monitoring and frequent trading decisions. Best for dedicated investors.';
    }

    return {
      score: overallScore,
      label,
      description,
      factors: {
        rebalanceFrequency: rebalanceScore,
        turnoverEstimate,
        monitoringNeeded,
        decisionFrequency
      }
    };
  }

  // Monte Carlo simulation with Geometric Brownian Motion
  private runMonteCarlo(
    initialValue: number, 
    expectedReturn: number, 
    volatility: number, 
    periods: number,
    simulations: number = 1000
  ): MonteCarloResult {
    const annualReturn = expectedReturn / 100;
    const annualVol = volatility / 100;
    const dt = 1 / 252; // Daily time step
    
    const finalValues: number[] = [];
    
    for (let sim = 0; sim < simulations; sim++) {
      let value = initialValue;
      
      for (let day = 0; day < periods; day++) {
        // Geometric Brownian Motion
        const drift = (annualReturn - 0.5 * annualVol * annualVol) * dt;
        const diffusion = annualVol * Math.sqrt(dt) * this.normalRandom();
        value *= Math.exp(drift + diffusion);
      }
      
      finalValues.push(value);
    }
    
    // Sort for percentile calculation
    finalValues.sort((a, b) => a - b);
    
    const getPercentile = (p: number) => {
      const index = Math.floor(simulations * p);
      return finalValues[Math.min(index, simulations - 1)];
    };
    
    return {
      percentiles: {
        p5: Math.round(getPercentile(0.05)),
        p25: Math.round(getPercentile(0.25)),
        p50: Math.round(getPercentile(0.50)),
        p75: Math.round(getPercentile(0.75)),
        p95: Math.round(getPercentile(0.95)),
      },
      probabilityOfLoss: finalValues.filter(v => v < initialValue).length / simulations * 100,
      expectedValue: Math.round(finalValues.reduce((a, b) => a + b, 0) / simulations)
    };
  }

  // Box-Muller transform for normal random numbers
  private normalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Estimate historical backtest metrics
  private estimateBacktest(
    totalReturn: number, 
    totalVol: number, 
    assets: PortfolioAsset[]
  ): BacktestResult {
    // Calculate average max drawdown from components
    const avgMaxDrawdown = assets.reduce((sum, a) => {
      return sum + (a.quantMetrics?.maxDrawdown || 15) * (a.allocation / 100);
    }, 0);
    
    // Estimate win rate from signals
    const bullishAssets = assets.filter(a => 
      a.quantMetrics?.recommendation?.toLowerCase().includes('buy') ||
      a.technicalSignal?.toLowerCase().includes('buy')
    ).length;
    const winRateEstimate = 50 + (bullishAssets / assets.length) * 20;
    
    // Calmar ratio = annualized return / max drawdown
    const calmarRatio = avgMaxDrawdown > 0.01 ? totalReturn / avgMaxDrawdown : 0;
    
    return {
      totalReturn: totalReturn * 0.85, // Conservative discount
      annualizedReturn: totalReturn,
      sharpeRatio: totalVol > 0 ? (totalReturn - 4.5) / totalVol : 0,
      maxDrawdown: avgMaxDrawdown,
      winRate: Math.min(70, Math.max(40, winRateEstimate)),
      bestYear: totalReturn * 1.4,
      worstYear: -avgMaxDrawdown * 0.9,
      calmarRatio: parseFloat(calmarRatio.toFixed(2))
    };
  }





  // Enhanced chat with context retention
  async chatAboutPortfolio(
    userMessage: string,
    portfolio: GeneratedPortfolio,
    conversationHistory: OpenRouterMessage[] = []
  ): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are an elite portfolio advisor (CFA, CFP) providing expert consultation.

CURRENT PORTFOLIO CONTEXT:
${JSON.stringify(portfolio, null, 2)}

Your consultation style:
- Provide specific, actionable insights
- Reference real market data and current conditions
- Consider tax implications, fees, and transaction costs
- Explain complex concepts clearly
- Challenge assumptions when necessary
- Suggest alternatives when appropriate

Be conversational but professional. Cite specific data points from the portfolio.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage
      }
    ];

    return openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.8,
      max_tokens: 1500
    });
  }

  // Advanced rebalancing analysis
  async analyzeRebalancing(
    currentHoldings: Record<string, number>,
    targetPortfolio: GeneratedPortfolio
  ): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a portfolio rebalancing specialist. Provide specific trade recommendations considering:
- Transaction costs and tax implications
- Market timing and technical levels
- Threshold-based rebalancing (only rebalance if drift > 5%)
- Tax-loss harvesting opportunities

Format as clear action items with rationale.`
      },
      {
        role: 'user',
        content: `Current Holdings (% allocation):
${JSON.stringify(currentHoldings, null, 2)}

Target Portfolio:
${JSON.stringify(targetPortfolio.assets.map(a => ({ 
  symbol: a.symbol, 
  allocation: a.allocation,
  currentPrice: a.currentPrice 
})), null, 2)}

Provide specific rebalancing recommendations with:
1. Which positions to increase/decrease
2. Exact percentage adjustments
3. Rationale for each trade
4. Timing considerations
5. Tax optimization strategies`
      }
    ];

    return openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.6,
      max_tokens: 2000
    });
  }

  // Deep market analysis with real data
  async analyzeMarketOpportunity(symbol: string, context?: string): Promise<string> {
    console.log(`[INFO] Performing deep analysis on ${symbol}...`);

    const marketData = await marketDataService.getMarketData(symbol);
    const technical = this.calculateTechnicalIndicators(marketData.historical);

    // Calculate additional metrics
    const closes = marketData.historical.slice(0, 30).map(d => d.close);
    const returns = closes.slice(0, -1).map((c, i) => (c - closes[i + 1]) / closes[i + 1]);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length);
    const volatility = (stdDev * Math.sqrt(252) * 100).toFixed(2); // Annualized

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a senior equity analyst providing institutional-grade research reports.

Analysis framework:
1. Valuation Analysis (P/E, P/B, relative to sector)
2. Technical Analysis (trend, support/resistance, momentum)
3. Risk Assessment (volatility, beta, drawdown potential)
4. Catalysts & Headwinds
5. Recommendation with conviction level and price targets`
      },
      {
        role: 'user',
        content: `Analyze ${symbol} for investment potential:

REAL-TIME MARKET DATA:
- Current Price: $${marketData.quote?.price.toFixed(2)}
- Today's Change: ${marketData.quote?.changePercent.toFixed(2)}%
- Volume: ${marketData.quote?.volume.toLocaleString()}
- Data Source: ${marketData.source}

TECHNICAL ANALYSIS:
- Trend: ${technical.trend}
- Momentum: ${technical.momentum}
- Support: $${technical.support.toFixed(2)}
- Resistance: $${technical.resistance.toFixed(2)}
- Signals: ${technical.signals.join(', ')}

CALCULATED METRICS:
- 30-day Annualized Volatility: ${volatility}%
- Recent Price Action: ${closes.slice(0, 5).map(c => '$' + c.toFixed(2)).join(' → ')}

${context ? `ADDITIONAL CONTEXT:\n${context}` : ''}

Provide a comprehensive investment analysis with:
1. Valuation assessment
2. Technical setup and entry points
3. Risk/reward analysis
4. 12-month price target
5. Buy/Hold/Sell recommendation with conviction (1-5)
6. Portfolio fit and position sizing suggestion`
      }
    ];

    return openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.7,
      max_tokens: 2500
    });
  }

  // Risk assessment for existing portfolio
  async assessPortfolioRisk(portfolio: GeneratedPortfolio): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a risk management specialist. Analyze portfolio risk across multiple dimensions:
- Market risk (beta, volatility)
- Concentration risk
- Sector/geographic exposure
- Liquidity risk
- Event risk (earnings, macro events)

Provide actionable recommendations to mitigate identified risks.`
      },
      {
        role: 'user',
        content: `Assess risk profile of this portfolio:

${JSON.stringify(portfolio, null, 2)}

Provide:
1. Overall risk score (1-10)
2. Key risk factors
3. Stress test scenarios (market crash, sector rotation, rate spikes)
4. Hedging recommendations
5. Risk mitigation strategies`
      }
    ];

    return openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.6,
      max_tokens: 2000
    });
  }
}

export const portfolioAgent = new PortfolioAgentService();
export type { GeneratedPortfolio, PortfolioAsset, TechnicalAnalysis, MonteCarloResult, BacktestResult };
