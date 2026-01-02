import { openRouterService, OpenRouterMessage } from './openrouter';
import { marketDataService, HistoricalData } from './marketData';
import { fundamentalDataService } from './fundamentalData';
import { newsService } from './newsService';
import type { MarketInsight } from './webSearch';
// FundamentalMetrics type is used in the PortfolioAsset interface

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
    sortinoRatio?: number;
    calmarRatio?: number;
    beta?: number;
    alpha?: number;
    var95?: number;
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
  "description": "Brief 1-2 sentence description",
  "strategy": "Detailed 200-300 word strategy explanation",
  "riskLevel": "Low",
  "timeHorizon": "5-10 years",
  "rebalanceFrequency": "Quarterly",
  "assets": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "allocation": 15.0,
      "rationale": "Detailed investment rationale",
      "sector": "Technology"
    }
  ],
  "expectedReturn": "8-12% annually",
  "volatility": "12-18%",
  "reasoning": "Comprehensive 300+ word reasoning"
}

JSON FORMATTING RULES:
- All field names in "double quotes"
- String values in "double quotes"
- Numbers without quotes (15.0 not "15.0")
- allocation must be a number between 0 and 100
- Use escape sequences for quotes in strings (\")
- No trailing commas
- riskLevel must be exactly: "Low", "Medium", or "High"

PORTFOLIO REQUIREMENTS:
- 8-15 different assets
- Real, liquid US tickers only
- Allocations must sum to approximately 100%
- Diverse sectors and asset types
- Current market: December 2025, elevated rates, AI boom, energy transition

START YOUR RESPONSE WITH { AND END WITH } - NOTHING ELSE!`
      },
      {
        role: 'user',
        content: `Create a professional portfolio for: ${userPrompt}

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
    console.log('[INFO] Fetching market data...');
    
    const symbols = portfolio.assets.map(a => a.symbol);
    console.log(`Processing ${symbols.length} symbols:`, symbols);
    
    try {
      // STEP 1: Backend fetches prices and quant metrics (uses its own rate limiting)
      // The backend will fetch historical data once and cache prices
      console.log('[INFO] Step 1/2: Fetching prices and quant metrics from backend...');
      const [pricesMap, quantMetricsArray] = await Promise.all([
        marketDataService.getCurrentPricesBatch(symbols),
        marketDataService.getQuantMetricsBatch(symbols),
      ]);
      console.log(`Backend data: ${Object.keys(pricesMap).length} prices, ${quantMetricsArray.length} metrics`);

      // STEP 2: Frontend fetches additional data (fundamentals, sentiment, analyst)
      // These use the global rate limiter and are fetched in background
      console.log('[INFO] Step 2/2: Fetching fundamentals, sentiment & analyst ratings...');
      
      // Fetch all in parallel - they share the global rate limiter so won't conflict
      const [fundamentalsMap, sentimentMap, analystMap] = await Promise.all([
        fundamentalDataService.getBatchFundamentals(symbols).catch(e => {
          console.warn('Fundamentals fetch failed:', e);
          return {} as Record<string, any>;
        }),
        newsService.getBatchSentiment(symbols).catch(e => {
          console.warn('Sentiment fetch failed:', e);
          return {} as Record<string, any>;
        }),
        newsService.getBatchAnalystRatings(symbols).catch(e => {
          console.warn('Analyst ratings fetch failed:', e);
          return {} as Record<string, any>;
        })
      ]);
      
      console.log(`Additional data: ${Object.keys(fundamentalsMap).length} fundamentals, ${Object.keys(sentimentMap).length} sentiment, ${Object.keys(analystMap).length} analyst`);

      // STEP 3: Skip market insights for now to avoid rate limits
      // Market insights will be fetched on-demand in a future update
      console.log('[INFO] Step 3/3: Skipping market insights (rate limit protection)...');
      const insightsMap: Record<string, MarketInsight[]> = {};
      
      // Disabled: Fetch insights for top 3 allocations only to save time
      // This causes too many API calls and triggers rate limits
      /*
      const topSymbols = [...portfolio.assets]
        .sort((a, b) => b.allocation - a.allocation)
        .slice(0, 3)
        .map(a => a.symbol);
      
      /*
      for (const sym of topSymbols) {
        try {
          const insights = await webSearchService.generateMarketInsights(sym);
          if (insights.length > 0) {
            insightsMap[sym] = insights;
          }
        } catch (e) {
          console.warn(`Market insights fetch failed for ${sym}:`, e);
        }
      }
      */
      console.log(`Market insights: disabled for rate limit protection`);
      
      // Verify data completeness - but allow partial data
      const validPrices = Object.values(pricesMap).filter(p => p !== null && p !== undefined && p > 0).length;
      const validMetrics = quantMetricsArray.filter(m => m.signal !== 'INSUFFICIENT DATA').length;
      
      console.log(`Data quality: ${validPrices}/${symbols.length} prices, ${validMetrics}/${symbols.length} metrics`);
      
      // Only fail if we have ZERO data - otherwise proceed with partial data
      if (validPrices === 0 && Object.keys(fundamentalsMap).length === 0) {
        // Try one more time with a longer delay
        console.warn('[WARN] No data received, retrying with longer delay...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Re-fetch just prices from frontend
        const retryPrices = await marketDataService.getCurrentPricesBatch(symbols);
        const retryValidPrices = Object.values(retryPrices).filter(p => p > 0).length;
        
        if (retryValidPrices === 0) {
          throw new Error('Unable to fetch market data. Please try again in a few minutes.');
        }
        
        // Use retry prices
        Object.assign(pricesMap, retryPrices);
      }
      
      const metricsMap = new Map(quantMetricsArray.map(m => [m.symbol, m]));

      // Enrich assets with COMPLETE data
      const enrichedAssets = portfolio.assets.map((asset) => {
        const price = pricesMap[asset.symbol];
        const metrics = metricsMap.get(asset.symbol);
        const fundamentals = fundamentalsMap[asset.symbol];
        const sentiment = sentimentMap[asset.symbol];
        const analyst = analystMap[asset.symbol];
        const insights = insightsMap[asset.symbol];
        
        if (!price) {
          console.warn(`Missing price for ${asset.symbol}`);
        }
        
        if (!fundamentals) {
          console.warn(`Missing fundamentals for ${asset.symbol}`);
        }
        
        // Calculate upside to target price
        let upside: number | null = null;
        if (price && analyst?.targetPriceMean) {
          upside = ((analyst.targetPriceMean - price) / price) * 100;
        }
        
        // Calculate composite score (0-100)
        const compositeScore = this.calculateCompositeScore(metrics, fundamentals, sentiment, analyst, upside);
        
        const baseAsset = {
          ...asset,
          currentPrice: price,
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
          marketInsights: insights || undefined
        };
        
        if (!metrics || metrics.signal === 'INSUFFICIENT DATA') {
          console.warn(`Insufficient metrics for ${asset.symbol}`);
          return {
            ...baseAsset,
            technicalSignal: 'Data pending',
            quantMetrics: {
              sharpeRatio: 0,
              volatility: 0,
              expectedReturn: 0,
              maxDrawdown: 0,
              rsi: 50,
              recommendation: 'Data pending',
              confidence: 0
            },
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
        }
        
        return {
          ...baseAsset,
          technicalSignal: metrics.signal,
          quantMetrics: {
            sharpeRatio: metrics.sharpe_ratio,
            volatility: metrics.volatility,
            expectedReturn: metrics.annualized_return,
            maxDrawdown: metrics.max_drawdown,
            rsi: metrics.rsi,
            recommendation: metrics.signal,
            confidence: metrics.confidence,
            sortinoRatio: metrics.sortino_ratio,
            calmarRatio: metrics.calmar_ratio,
            beta: metrics.beta,
            alpha: metrics.alpha,
            var95: metrics.var_95,
          },
          dailyReturns: metrics.daily_returns || [],
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

      const fullyEnriched = enrichedAssets.filter(a => 
        a.currentPrice && 
        a.quantMetrics?.recommendation !== 'Data pending' &&
        a.fundamentals
      ).length;
      console.log(`COMPLETE: ${fullyEnriched}/${symbols.length} assets fully enriched with all data`);
      
      if (fullyEnriched < symbols.length * 0.5) {
        console.warn(`WARNING: Only ${fullyEnriched}/${symbols.length} assets have complete data`);
      }
      
      return { ...portfolio, assets: enrichedAssets };
    } catch (error) {
      console.error('[ERROR] CRITICAL: Market data enrichment failed:', error);
      throw new Error(`Failed to fetch market data: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    console.log('[INFO] Fast portfolio optimization started');

    const assets = portfolio.assets;
    const n = assets.length;

    // Calculate allocations as decimals
    const allocations = assets.map(a => a.allocation / 100);
    
    // Herfindahl-Hirschman Index for concentration (lower = more diversified)
    const herfindahl = allocations.reduce((sum, a) => sum + a * a, 0);
    
    // Diversification score: 0 = concentrated, 100 = well diversified
    // Normalized against theoretical max (1/n for equal weight)
    const minHHI = 1 / n;
    const diversificationScore = Math.round(((1 - herfindahl) / (1 - minHHI)) * 100);

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

    // Portfolio volatility (simplified - assumes zero correlation for conservative estimate)
    // In reality would need correlation matrix for accurate calculation
    const portfolioVolatility = Math.sqrt(totalVolSq) * 0.7 + totalVol * 0.3; // Blend of methods
    
    // Sharpe ratio with risk-free rate of 4.5%
    const riskFreeRate = 4.5;
    const sharpeRatioEstimate = portfolioVolatility > 0 
      ? ((totalReturn - riskFreeRate) / portfolioVolatility) 
      : 0;

    // Enhanced Monte Carlo simulation (1000 paths)
    const monteCarloResult = this.runMonteCarlo(10000, totalReturn, portfolioVolatility, 252);

    // Enhanced backtest estimation
    const backtestResult = this.estimateBacktest(totalReturn, portfolioVolatility, assets);

    console.log(`[INFO] Portfolio optimization complete: Sharpe=${sharpeRatioEstimate.toFixed(2)}, Diversification=${diversificationScore}%`);

    return {
      ...portfolio,
      diversificationScore,
      sharpeRatioEstimate: parseFloat(sharpeRatioEstimate.toFixed(2)),
      monteCarloResult,
      backtestResult
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
