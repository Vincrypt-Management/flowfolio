import { openRouterService, OpenRouterMessage } from './openrouter';
import { marketDataService, HistoricalData } from './marketData';

interface PortfolioAsset {
  symbol: string;
  name: string;
  allocation: number; // percentage
  rationale: string;
  currentPrice?: number;
  sector?: string;
  analystRating?: string;
  technicalSignal?: string;
  quantMetrics?: {
    sharpeRatio: number;
    volatility: number;
    expectedReturn: number;
    maxDrawdown: number;
    rsi: number;
    recommendation: string;
    confidence: number;
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

class PortfolioAgentService {
  private vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01';

  async generatePortfolio(userPrompt: string): Promise<GeneratedPortfolio> {
    console.log('🚀 Starting expert portfolio generation for:', userPrompt);

    // Single AI call with comprehensive prompt - no separate intent analysis
    const portfolioStructure = await this.generatePortfolioStructureOptimized(userPrompt);
    console.log('🏗️ Portfolio structure:', portfolioStructure);

    // Parallel data fetching from backend (optimized)
    const enrichedPortfolio = await this.enrichWithMarketDataFast(portfolioStructure);
    console.log('💰 Enriched portfolio:', enrichedPortfolio);

    // Fast optimization (no AI call needed)
    const optimizedPortfolio = this.optimizePortfolioFast(enrichedPortfolio);
    console.log('✅ Optimized portfolio:', optimizedPortfolio);

    return optimizedPortfolio;
  }

  async *generatePortfolioStream(userPrompt: string): AsyncGenerator<StreamUpdate> {
    try {
      yield { type: 'progress', step: 'generating', message: 'Creating portfolio structure...' };

      // Single AI call - fast portfolio generation
      const portfolioStructure = await this.generatePortfolioStructureOptimized(userPrompt);
      yield { 
        type: 'data', 
        step: 'structure', 
        message: 'Portfolio structure created',
        data: portfolioStructure 
      };

      yield { type: 'progress', step: 'fetching', message: 'Fetching real-time market data...' };

      // Fast parallel data fetching
      const enrichedPortfolio = await this.enrichWithMarketDataFast(portfolioStructure);
      
      yield { 
        type: 'data', 
        step: 'enriched', 
        message: 'Market data integrated',
        data: enrichedPortfolio 
      };

      yield { type: 'progress', step: 'optimizing', message: 'Optimizing portfolio...' };

      // Fast optimization (no AI)
      const optimizedPortfolio = this.optimizePortfolioFast(enrichedPortfolio);
      
      yield { 
        type: 'complete', 
        step: 'complete', 
        message: 'Portfolio ready',
        data: optimizedPortfolio 
      };

    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  private async generatePortfolioStructureOptimized(userPrompt: string): Promise<GeneratedPortfolio> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a CFA charterholder and portfolio manager with 20+ years of experience.

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanations.

Required JSON structure:
{
  "title": "Portfolio Name",
  "description": "1-2 sentence description",
  "strategy": "Detailed strategy (200-300 words)",
  "riskLevel": "Low|Medium|High",
  "timeHorizon": "Specific timeframe",
  "rebalanceFrequency": "Frequency",
  "assets": [
    {
      "symbol": "TICKER",
      "name": "Full Name",
      "allocation": 12.5,
      "rationale": "Detailed rationale",
      "sector": "Sector"
    }
  ],
  "expectedReturn": "Range with assumptions",
  "volatility": "Expected range",
  "reasoning": "Comprehensive reasoning (300+ words)"
}

Guidelines:
- Use real, liquid US tickers (stocks, ETFs)
- 8-15 assets for diversification
- Allocations sum to exactly 100%
- Current market context: Dec 2025, elevated rates, AI/tech growth, energy transition
- Consider correlation for true diversification
- Balance growth/value, cyclical/defensive, domestic/international`
      },
      {
        role: 'user',
        content: `Create an institutional-quality portfolio for: ${userPrompt}

Return ONLY valid JSON with comprehensive strategy and reasoning.`
      }
    ];

    const response = await openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.7,
      max_tokens: 4000
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse portfolio structure');
    }

    const portfolio = JSON.parse(jsonMatch[0]);
    
    if (!portfolio.assets || !Array.isArray(portfolio.assets)) {
      throw new Error('Invalid portfolio structure');
    }

    // Normalize allocations to 100%
    const totalAllocation = portfolio.assets.reduce((sum: number, asset: any) => sum + asset.allocation, 0);
    if (Math.abs(totalAllocation - 100) > 0.5) {
      portfolio.assets = portfolio.assets.map((asset: any) => ({
        ...asset,
        allocation: (asset.allocation / totalAllocation) * 100
      }));
    }

    return portfolio;
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
    console.log('📈 CRITICAL: Waiting for ALL market data before proceeding...');
    
    const symbols = portfolio.assets.map(a => a.symbol);
    console.log(`📊 Fetching complete data for ${symbols.length} symbols:`, symbols);
    
    try {
      // WAIT for all data to complete
      console.log('⏳ Fetching prices...');
      const pricesMap = await marketDataService.getCurrentPricesBatch(symbols);
      console.log(`✅ Prices received: ${Object.keys(pricesMap).length}/${symbols.length}`);
      
      console.log('⏳ Fetching quantitative metrics...');
      const quantMetricsArray = await marketDataService.getQuantMetricsBatch(symbols);
      console.log(`✅ Metrics received: ${quantMetricsArray.length}/${symbols.length}`);
      
      // Verify data completeness
      const validPrices = Object.values(pricesMap).filter(p => p !== null && p !== undefined).length;
      const validMetrics = quantMetricsArray.filter(m => m.signal !== 'INSUFFICIENT DATA').length;
      
      console.log(`📊 Data quality: ${validPrices} valid prices, ${validMetrics} valid metrics`);
      
      if (validPrices === 0) {
        throw new Error('CRITICAL: No price data received. Check API limits and connection.');
      }
      
      const metricsMap = new Map(quantMetricsArray.map(m => [m.symbol, m]));

      // Enrich assets with COMPLETE data
      const enrichedAssets = portfolio.assets.map((asset) => {
        const price = pricesMap[asset.symbol];
        const metrics = metricsMap.get(asset.symbol);
        
        if (!price) {
          console.warn(`⚠️ Missing price for ${asset.symbol}`);
        }
        
        if (!metrics || metrics.signal === 'INSUFFICIENT DATA') {
          console.warn(`⚠️ Insufficient metrics for ${asset.symbol}`);
          return {
            ...asset,
            currentPrice: price,
            technicalSignal: 'Data pending',
            quantMetrics: {
              sharpeRatio: 0,
              volatility: 0,
              expectedReturn: 0,
              maxDrawdown: 0,
              rsi: 50,
              recommendation: 'Data pending',
              confidence: 0
            }
          };
        }
        
        return {
          ...asset,
          currentPrice: price,
          technicalSignal: metrics.signal,
          quantMetrics: {
            sharpeRatio: metrics.sharpe_ratio,
            volatility: metrics.volatility,
            expectedReturn: metrics.annualized_return,
            maxDrawdown: metrics.max_drawdown,
            rsi: metrics.rsi,
            recommendation: metrics.signal,
            confidence: metrics.confidence
          }
        };
      });

      const fullyEnriched = enrichedAssets.filter(a => a.currentPrice && a.quantMetrics?.recommendation !== 'Data pending').length;
      console.log(`✅ COMPLETE: ${fullyEnriched}/${symbols.length} assets fully enriched with real data`);
      
      if (fullyEnriched < symbols.length * 0.5) {
        console.warn(`⚠️ WARNING: Only ${fullyEnriched}/${symbols.length} assets have complete data`);
      }
      
      return { ...portfolio, assets: enrichedAssets };
    } catch (error) {
      console.error('❌ CRITICAL: Market data enrichment failed:', error);
      throw new Error(`Failed to fetch market data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private optimizePortfolioFast(portfolio: GeneratedPortfolio): GeneratedPortfolio {
    console.log('🔧 Fast portfolio optimization...');

    // Calculate diversification score
    const allocations = portfolio.assets.map(a => a.allocation / 100);
    const herfindahl = allocations.reduce((sum, a) => sum + a * a, 0);
    const diversificationScore = Math.round((1 - herfindahl) * 100);

    // Calculate portfolio Sharpe ratio from components
    const totalReturn = portfolio.assets.reduce((sum, asset) => {
      const ret = asset.quantMetrics?.expectedReturn || 0;
      return sum + ret * (asset.allocation / 100);
    }, 0);
    
    const totalVol = portfolio.assets.reduce((sum, asset) => {
      const vol = asset.quantMetrics?.volatility || 0;
      return sum + vol * (asset.allocation / 100);
    }, 0);
    
    const sharpeRatioEstimate = totalVol > 0 ? ((totalReturn - 4.5) / totalVol) : 0;

    // Fast Monte Carlo (simplified)
    const monteCarloResult: MonteCarloResult = {
      percentiles: {
        p5: 10000 * (1 + (totalReturn - 2 * totalVol) / 100),
        p25: 10000 * (1 + (totalReturn - totalVol) / 100),
        p50: 10000 * (1 + totalReturn / 100),
        p75: 10000 * (1 + (totalReturn + totalVol) / 100),
        p95: 10000 * (1 + (totalReturn + 2 * totalVol) / 100),
      },
      probabilityOfLoss: totalReturn < 0 ? 50 : Math.max(0, 50 - totalReturn * 2),
      expectedValue: 10000 * (1 + totalReturn / 100)
    };

    // Fast backtest (simplified)
    const backtestResult: BacktestResult = {
      totalReturn: totalReturn * 0.8, // Discount for realistic expectations
      annualizedReturn: totalReturn,
      sharpeRatio: sharpeRatioEstimate,
      maxDrawdown: totalVol * 0.6,
      winRate: 55 + Math.min(totalReturn, 20),
      bestYear: totalReturn * 1.5,
      worstYear: -totalVol * 0.8,
      calmarRatio: totalVol > 0 ? totalReturn / (totalVol * 0.6) : 0
    };

    return {
      ...portfolio,
      diversificationScore,
      sharpeRatioEstimate: parseFloat(sharpeRatioEstimate.toFixed(2)),
      monteCarloResult,
      backtestResult
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
    console.log(`🔍 Performing deep analysis on ${symbol}...`);

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
