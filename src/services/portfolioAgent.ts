import { openRouterService, OpenRouterMessage } from './openrouter';
import { marketDataService, HistoricalData } from './marketData';
import { quantAnalyzer } from './quantAnalysis';

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

    // Step 1: Deep intent analysis with context understanding
    const intentAnalysis = await this.analyzeUserIntent(userPrompt);
    console.log('📊 Intent analysis:', intentAnalysis);

    // Step 2: Generate sophisticated portfolio structure
    const portfolioStructure = await this.generatePortfolioStructure(userPrompt, intentAnalysis);
    console.log('🏗️ Portfolio structure:', portfolioStructure);

    // Step 3: Fetch market data and perform technical analysis
    const enrichedPortfolio = await this.enrichWithMarketData(portfolioStructure);
    console.log('💰 Enriched portfolio:', enrichedPortfolio);

    // Step 4: Validate and optimize
    const optimizedPortfolio = await this.optimizePortfolio(enrichedPortfolio);
    console.log('✅ Optimized portfolio:', optimizedPortfolio);

    return optimizedPortfolio;
  }

  async *generatePortfolioStream(userPrompt: string): AsyncGenerator<StreamUpdate> {
    try {
      yield { type: 'progress', step: 'analyzing', message: 'Analyzing your investment requirements...' };

      // Step 1: Deep intent analysis
      const intentAnalysis = await this.analyzeUserIntent(userPrompt);
      yield { type: 'progress', step: 'intent', message: 'Investment strategy identified', data: {} };

      yield { type: 'progress', step: 'generating', message: 'Creating portfolio structure...' };

      // Step 2: Generate portfolio structure
      const portfolioStructure = await this.generatePortfolioStructure(userPrompt, intentAnalysis);
      yield { 
        type: 'data', 
        step: 'structure', 
        message: 'Portfolio structure created',
        data: portfolioStructure 
      };

      yield { type: 'progress', step: 'fetching', message: 'Fetching real-time market data...' };

      // Step 3: Enrich with market data (streaming)
      const enrichedPortfolio = await this.enrichWithMarketDataStreaming(
        portfolioStructure, 
        (_symbol: string, _progress: number) => {
          // This will be handled internally but we can yield progress
        }
      );
      
      yield { 
        type: 'data', 
        step: 'enriched', 
        message: 'Market data integrated',
        data: enrichedPortfolio 
      };

      yield { type: 'progress', step: 'analyzing', message: 'Running quantitative analysis...' };

      // Step 4: Optimize portfolio
      const optimizedPortfolio = await this.optimizePortfolio(enrichedPortfolio);
      
      yield { 
        type: 'complete', 
        step: 'complete', 
        message: 'Portfolio optimization complete',
        data: optimizedPortfolio 
      };

    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  private async analyzeUserIntent(prompt: string): Promise<any> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a senior financial advisor with expertise in portfolio construction, risk management, and behavioral finance.
        
Analyze the user's request and extract comprehensive investment parameters.

Respond ONLY with valid JSON in this exact format:
{
  "riskTolerance": "low|medium|high",
  "timeHorizon": "short-term (<1yr)|medium-term (1-5yr)|long-term (>5yr)",
  "investmentGoal": "growth|income|balanced|preservation|aggressive-growth",
  "sectors": ["technology", "healthcare", "financials", "consumer", "energy", "industrials", "utilities"],
  "preferences": ["ESG", "dividend", "growth", "value", "momentum", "quality"],
  "rebalanceFrequency": "monthly|quarterly|semi-annually|annually",
  "constraints": {
    "maxSinglePosition": 25,
    "minDiversification": 8,
    "internationalExposure": "none|low|moderate|high"
  },
  "marketSentiment": "bullish|neutral|bearish",
  "specialConsiderations": ["tax-loss-harvesting", "dollar-cost-averaging", "hedging"]
}`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await openRouterService.chat(messages, this.vibeModel);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse intent analysis');
    }
    
    return JSON.parse(jsonMatch[0]);
  }

  private async generatePortfolioStructure(userPrompt: string, intent: any): Promise<GeneratedPortfolio> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a CFA charterholder and portfolio manager with 20+ years of experience managing institutional portfolios.

Your expertise includes:
- Modern Portfolio Theory (MPT) and asset allocation
- Factor investing (value, momentum, quality, low volatility)
- Risk parity and dynamic allocation strategies
- Macroeconomic analysis and market cycle positioning
- Behavioral finance and investor psychology

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanations.

Required JSON structure:
{
  "title": "Descriptive Portfolio Name",
  "description": "Clear 1-2 sentence description",
  "strategy": "Detailed investment strategy (200-300 words) covering approach, rationale, and market positioning",
  "riskLevel": "Low|Medium|High",
  "timeHorizon": "Specific timeframe",
  "rebalanceFrequency": "Frequency with reasoning",
  "assets": [
    {
      "symbol": "TICKER",
      "name": "Full Company/Fund Name",
      "allocation": 12.5,
      "rationale": "Specific, detailed rationale including fundamentals, technicals, and fit in portfolio",
      "sector": "Sector name"
    }
  ],
  "expectedReturn": "Realistic range with assumptions",
  "volatility": "Expected volatility range with standard deviation",
  "reasoning": "Comprehensive reasoning (300+ words) covering diversification, risk-adjusted returns, market conditions, and why this specific allocation"
}

Rules for expert-level portfolios:
- Use real, liquid ticker symbols (US stocks, ETFs, bonds)
- Include mix of core holdings (60-70%) and satellite positions (30-40%)
- Consider correlation between assets for true diversification
- Include defensive positions for downside protection
- Factor in current market conditions (Dec 2025)
- Allocations must sum to exactly 100%
- 8-20 assets depending on portfolio size and strategy
- Include rationale referencing: fundamentals, valuation, technical setup, catalysts
- Consider macro themes: AI/tech revolution, energy transition, demographic shifts, inflation/rates
- Balance growth vs value, cyclical vs defensive, domestic vs international`
      },
      {
        role: 'user',
        content: `Create a professional, institutional-quality portfolio for:

USER REQUEST: ${userPrompt}

ANALYZED PARAMETERS:
- Risk Tolerance: ${intent.riskTolerance}
- Time Horizon: ${intent.timeHorizon}
- Primary Goal: ${intent.investmentGoal}
- Sector Focus: ${intent.sectors?.join(', ') || 'diversified across sectors'}
- Style Preferences: ${intent.preferences?.join(', ') || 'flexible'}
- Rebalance Frequency: ${intent.rebalanceFrequency}
- Max Single Position: ${intent.constraints?.maxSinglePosition || 20}%
- Min Diversification: ${intent.constraints?.minDiversification || 8} positions
- International: ${intent.constraints?.internationalExposure || 'moderate'}
- Market Sentiment: ${intent.marketSentiment || 'neutral'}

CURRENT MARKET CONTEXT (Dec 2025):
- Fed policy: Managing inflation, rates elevated but stabilizing
- Technology: AI/ML revolution driving valuations
- Energy: Transition to renewables ongoing
- Geopolitics: Trade tensions, regional conflicts affecting supply chains

Return ONLY valid JSON. Be thorough in your strategy and reasoning sections.`
      }
    ];

    const response = await openRouterService.chat(messages, this.vibeModel, {
      temperature: 0.7, // Balanced creativity and precision
      max_tokens: 4000
    });
    
    console.log('📝 Raw AI response length:', response.length);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse portfolio structure from AI response');
    }

    const portfolio = JSON.parse(jsonMatch[0]);
    
    if (!portfolio.assets || !Array.isArray(portfolio.assets)) {
      throw new Error('Invalid portfolio structure: missing assets array');
    }

    // Validate allocation sums to 100%
    const totalAllocation = portfolio.assets.reduce((sum: number, asset: any) => sum + asset.allocation, 0);
    if (Math.abs(totalAllocation - 100) > 0.5) {
      console.warn(`⚠️ Allocation sum is ${totalAllocation}%, adjusting to 100%`);
      // Normalize allocations
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

  private async enrichWithMarketData(portfolio: GeneratedPortfolio, onProgress?: (symbol: string) => void): Promise<GeneratedPortfolio> {
    console.log('📈 Fetching market data with quantitative analysis...');
    
    const symbols = portfolio.assets.map(a => a.symbol);
    const marketData = await marketDataService.getBatchMarketData(
      symbols, 
      50, // Maximum concurrency for instant loading
      (symbol) => {
        if (onProgress) onProgress(symbol);
      },
      true // Enable instant mode (stale-while-revalidate)
    );

    // Collect all historical data for portfolio-level analysis
    const allHistoricalData: Record<string, HistoricalData[]> = {};
    const allReturns: Record<string, number[]> = {};

    const enrichedAssets = portfolio.assets.map(asset => {
      const data = marketData[asset.symbol];
      if (!data) return asset;

      allHistoricalData[asset.symbol] = data.historical;

      // Deep quantitative analysis
      const quantReport = quantAnalyzer.analyze(asset.symbol, data.historical);
      
      // Store returns for portfolio analysis
      allReturns[asset.symbol] = quantReport.returnsAnalysis.dailyReturns;
      
      // Technical signal
      const technical = quantReport.signals;
      const technicalSignal = `${technical.trend} / ${technical.momentum} / ${technical.recommendation.toUpperCase()}`;
      
      return {
        ...asset,
        currentPrice: data.quote?.price,
        technicalSignal,
        quantMetrics: {
          sharpeRatio: parseFloat(quantReport.returnsAnalysis.sharpeRatio.toFixed(2)),
          volatility: parseFloat((quantReport.returnsAnalysis.annualizedVolatility * 100).toFixed(2)),
          expectedReturn: parseFloat((quantReport.returnsAnalysis.annualizedReturn * 100).toFixed(2)),
          maxDrawdown: parseFloat((quantReport.returnsAnalysis.maxDrawdown * 100).toFixed(2)),
          rsi: parseFloat(quantReport.technicalIndicators.rsi14.toFixed(2)),
          recommendation: technical.recommendation,
          confidence: technical.confidence
        }
      };
    });

    // Portfolio-level Monte Carlo simulation
    console.log('🎲 Running Monte Carlo simulation...');
    const portfolioReturn = enrichedAssets.reduce((sum, asset) => {
      const ret = asset.quantMetrics?.expectedReturn || 0;
      return sum + (ret / 100) * (asset.allocation / 100);
    }, 0);
    
    const portfolioVolatility = enrichedAssets.reduce((sum, asset) => {
      const vol = asset.quantMetrics?.volatility || 0;
      return sum + (vol / 100) * (asset.allocation / 100);
    }, 0);

    const initialInvestment = 10000;
    const mcResult = quantAnalyzer.simulateMonteCarlo(
      initialInvestment,
      portfolioReturn,
      portfolioVolatility,
      252 // 1 year
    );

    const monteCarloResult: MonteCarloResult = {
      percentiles: mcResult.percentiles,
      probabilityOfLoss: mcResult.probabilityOfLoss,
      expectedValue: mcResult.expectedValue
    };

    // Backtest using historical data
    console.log('📊 Running backtest...');
    const backtestResult = this.runBacktest(enrichedAssets, allHistoricalData);

    return {
      ...portfolio,
      assets: enrichedAssets,
      monteCarloResult,
      backtestResult
    };
  }

  private runBacktest(assets: PortfolioAsset[], historicalData: Record<string, HistoricalData[]>): BacktestResult {
    // Find common date range across all assets
    const allDates = Object.values(historicalData).map(hist => hist.map(h => h.date));
    if (allDates.length === 0) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        bestYear: 0,
        worstYear: 0,
        calmarRatio: 0
      };
    }

    // Get portfolio returns for each day
    const portfolioReturns: number[] = [];
    const portfolioValues: number[] = [10000]; // Start with $10,000

    // Simplified backtest: calculate weighted returns
    const minLength = Math.min(...Object.values(historicalData).map(h => h.length));
    
    for (let i = 1; i < minLength; i++) {
      let dailyReturn = 0;
      
      assets.forEach(asset => {
        const hist = historicalData[asset.symbol];
        if (hist && hist.length > i) {
          const prevClose = hist[i - 1].close;
          const currClose = hist[i].close;
          if (prevClose > 0) {
            const assetReturn = (currClose - prevClose) / prevClose;
            dailyReturn += assetReturn * (asset.allocation / 100);
          }
        }
      });
      
      portfolioReturns.push(dailyReturn);
      portfolioValues.push(portfolioValues[portfolioValues.length - 1] * (1 + dailyReturn));
    }

    // Calculate metrics
    const totalReturn = (portfolioValues[portfolioValues.length - 1] - portfolioValues[0]) / portfolioValues[0];
    const years = portfolioReturns.length / 252;
    const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn, 1 / years) - 1) * 100 : 0;

    // Sharpe ratio
    const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const stdDev = Math.sqrt(
      portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / portfolioReturns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn * Math.sqrt(252) - 0.045) / (stdDev * Math.sqrt(252)) : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let peak = portfolioValues[0];
    
    for (const value of portfolioValues) {
      if (value > peak) peak = value;
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Win rate
    const positiveReturns = portfolioReturns.filter(r => r > 0).length;
    const winRate = (positiveReturns / portfolioReturns.length) * 100;

    // Yearly returns (simplified)
    const yearlyReturns: number[] = [];
    for (let year = 0; year < Math.floor(portfolioReturns.length / 252); year++) {
      const yearStart = year * 252;
      const yearEnd = Math.min((year + 1) * 252, portfolioReturns.length);
      let yearReturn = 1;
      for (let i = yearStart; i < yearEnd; i++) {
        yearReturn *= (1 + portfolioReturns[i]);
      }
      yearlyReturns.push((yearReturn - 1) * 100);
    }

    const bestYear = yearlyReturns.length > 0 ? Math.max(...yearlyReturns) : 0;
    const worstYear = yearlyReturns.length > 0 ? Math.min(...yearlyReturns) : 0;

    // Calmar ratio
    const calmarRatio = maxDrawdown > 0.001 ? annualizedReturn / (maxDrawdown * 100) : 0;

    return {
      totalReturn: totalReturn * 100,
      annualizedReturn: isFinite(annualizedReturn) ? annualizedReturn : 0,
      sharpeRatio: isFinite(sharpeRatio) ? sharpeRatio : 0,
      maxDrawdown: maxDrawdown * 100,
      winRate: isFinite(winRate) ? winRate : 0,
      bestYear: isFinite(bestYear) ? bestYear : 0,
      worstYear: isFinite(worstYear) ? worstYear : 0,
      calmarRatio: isFinite(calmarRatio) ? calmarRatio : 0
    };
  }

  private async enrichWithMarketDataStreaming(
    portfolio: GeneratedPortfolio,
    onProgress: (symbol: string, progress: number) => void
  ): Promise<GeneratedPortfolio> {
    const total = portfolio.assets.length;
    let completed = 0;

    const enrichedAssets = await Promise.all(
      portfolio.assets.map(async (asset) => {
        try {
          const data = await marketDataService.getMarketData(asset.symbol);
          const quantReport = quantAnalyzer.analyze(asset.symbol, data.historical);
          
          completed++;
          onProgress(asset.symbol, (completed / total) * 100);

          return {
            ...asset,
            currentPrice: data.quote?.price,
            technicalSignal: `${quantReport.signals.trend} / ${quantReport.signals.momentum}`,
            quantMetrics: {
              sharpeRatio: parseFloat(quantReport.returnsAnalysis.sharpeRatio.toFixed(2)),
              volatility: parseFloat((quantReport.returnsAnalysis.annualizedVolatility * 100).toFixed(2)),
              expectedReturn: parseFloat((quantReport.returnsAnalysis.annualizedReturn * 100).toFixed(2)),
              maxDrawdown: parseFloat((quantReport.returnsAnalysis.maxDrawdown * 100).toFixed(2)),
              rsi: parseFloat(quantReport.technicalIndicators.rsi14.toFixed(2)),
              recommendation: quantReport.signals.recommendation,
              confidence: quantReport.signals.confidence
            }
          };
        } catch (error) {
          completed++;
          onProgress(asset.symbol, (completed / total) * 100);
          return asset;
        }
      })
    );

    return { ...portfolio, assets: enrichedAssets };
  }

  private async optimizePortfolio(portfolio: GeneratedPortfolio): Promise<GeneratedPortfolio> {
    console.log('🔧 Optimizing portfolio for risk-adjusted returns...');

    // Calculate diversification score (simplified Herfindahl index)
    const allocations = portfolio.assets.map(a => a.allocation / 100);
    const herfindahl = allocations.reduce((sum, a) => sum + a * a, 0);
    const diversificationScore = Math.round((1 - herfindahl) * 100);

    // Estimate Sharpe ratio (simplified, assumes risk-free rate of 4.5%)
    const expectedReturnMatch = portfolio.expectedReturn.match(/(\d+)/);
    const expectedReturn = expectedReturnMatch ? parseInt(expectedReturnMatch[0]) : 8;
    const volatilityMatch = portfolio.volatility.match(/(\d+)/);
    const volatility = volatilityMatch ? parseInt(volatilityMatch[0]) : 15;
    
    const sharpeRatioEstimate = ((expectedReturn - 4.5) / volatility).toFixed(2);

    return {
      ...portfolio,
      diversificationScore,
      sharpeRatioEstimate: parseFloat(sharpeRatioEstimate)
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
