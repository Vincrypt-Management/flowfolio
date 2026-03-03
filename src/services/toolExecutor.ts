import { createLogger } from '../core/logger';
import { ToolCall, ToolResult } from './tools';
import { marketDataService } from './marketData';
import { quantAnalyzer } from './quantAnalysis';
import { mcpWebSearch } from './mcpWebSearch';

const log = createLogger('tool-executor');

interface FetchStockDataArgs {
  symbol: string;
  includeHistorical?: boolean;
}

interface FetchMultipleStocksArgs {
  symbols: string[];
}

interface TechnicalIndicatorsArgs {
  symbol: string;
  indicators: string[];
}

interface PortfolioMetricsArgs {
  symbols: string[];
}

interface MonteCarloArgs {
  symbols: string[];
  allocations: number[];
  timeHorizon: number;
}

interface BacktestArgs {
  symbols: string[];
  allocations: number[];
  startDate: string;
  endDate: string;
  rebalanceFrequency?: string;
}

interface WebSearchArgs {
  query: string;
  type?: 'news' | 'general' | 'finance';
  count?: number;
}

interface StockNewsArgs {
  symbol: string;
  query?: string;
  days?: number;
}

interface MarketTrendsArgs {
  topic: string;
  timeframe?: 'today' | 'week' | 'month';
}

interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
}

interface TechnicalIndicatorResults {
  symbol: string;
  rsi?: number;
  macd?: MACDResult;
  bollingerBands?: BollingerBandsResult;
  sma20?: number;
  sma50?: number;
  sma200?: number;
}

export class ToolExecutor {
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    try {
      log.info(`Executing tool: ${toolCall.name}`, toolCall.arguments);

      switch (toolCall.name) {
        case 'fetch_stock_data':
          return await this.fetchStockData(toolCall.arguments as unknown as FetchStockDataArgs);
        
        case 'fetch_multiple_stocks':
          return await this.fetchMultipleStocks(toolCall.arguments as unknown as FetchMultipleStocksArgs);
        
        case 'calculate_technical_indicators':
          return await this.calculateTechnicalIndicators(toolCall.arguments as unknown as TechnicalIndicatorsArgs);
        
        case 'analyze_portfolio_metrics':
          return await this.analyzePortfolioMetrics(toolCall.arguments as unknown as PortfolioMetricsArgs);
        
        case 'run_monte_carlo_simulation':
          return await this.runMonteCarloSimulation(toolCall.arguments as unknown as MonteCarloArgs);
        
        case 'backtest_portfolio':
          return await this.backtestPortfolio(toolCall.arguments as unknown as BacktestArgs);
        
        // Web search tools
        case 'web_search':
          return await this.webSearch(toolCall.arguments as unknown as WebSearchArgs);
        
        case 'search_stock_news':
          return await this.searchStockNews(toolCall.arguments as unknown as StockNewsArgs);
        
        case 'search_market_trends':
          return await this.searchMarketTrends(toolCall.arguments as unknown as MarketTrendsArgs);
        
        default:
          return {
            tool: toolCall.name,
            result: null,
            error: `Unknown tool: ${toolCall.name}`
          };
      }
    } catch (error) {
      return {
        tool: toolCall.name,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async executeMultipleTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    // Execute all tool calls in parallel for maximum speed
    const results = await Promise.all(
      toolCalls.map(toolCall => this.executeTool(toolCall))
    );
    return results;
  }

  private async fetchStockData(args: FetchStockDataArgs): Promise<ToolResult> {
    const { symbol, includeHistorical = true } = args;
    
    const marketData = await marketDataService.getMarketData(symbol);

    return {
      tool: 'fetch_stock_data',
      result: {
        symbol,
        quote: marketData.quote ? {
          price: marketData.quote.price,
          change: marketData.quote.change,
          changePercent: marketData.quote.changePercent,
          volume: marketData.quote.volume
        } : null,
        historical: includeHistorical ? {
          dataPoints: marketData.historical.length,
          startDate: marketData.historical[0]?.date,
          endDate: marketData.historical[marketData.historical.length - 1]?.date,
          prices: marketData.historical.map((d) => ({ date: d.date, close: d.close }))
        } : null
      }
    };
  }

  private async fetchMultipleStocks(args: FetchMultipleStocksArgs): Promise<ToolResult> {
    const { symbols } = args;
    
    // Fetch all stocks in parallel
    const results = await Promise.all(
      symbols.map(async (symbol: string) => {
        try {
          const marketData = await marketDataService.getMarketData(symbol);
          return {
            symbol,
            price: marketData.quote?.price || 0,
            change: marketData.quote?.changePercent || 0,
            volume: marketData.quote?.volume || 0,
            success: true
          };
        } catch (error) {
          return {
            symbol,
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch'
          };
        }
      })
    );

    return {
      tool: 'fetch_multiple_stocks',
      result: {
        stocks: results,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      }
    };
  }

  private async calculateTechnicalIndicators(args: TechnicalIndicatorsArgs): Promise<ToolResult> {
    const { symbol, indicators } = args;
    
    const marketData = await marketDataService.getMarketData(symbol);
    const prices = marketData.historical.map((d) => d.close);
    
    const results: TechnicalIndicatorResults = { symbol };
    
    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'rsi':
          results.rsi = this.calculateRSI(prices);
          break;
        case 'macd':
          results.macd = this.calculateMACD(prices);
          break;
        case 'bollinger':
          results.bollingerBands = this.calculateBollingerBands(prices);
          break;
        case 'sma_20':
          results.sma20 = this.calculateSMA(prices, 20);
          break;
        case 'sma_50':
          results.sma50 = this.calculateSMA(prices, 50);
          break;
        case 'sma_200':
          results.sma200 = this.calculateSMA(prices, 200);
          break;
      }
    }
    
    return {
      tool: 'calculate_technical_indicators',
      result: results as unknown as Record<string, unknown>
    };
  }

  private async analyzePortfolioMetrics(args: PortfolioMetricsArgs): Promise<ToolResult> {
    const { symbols } = args;
    
    // Fetch historical data for all symbols
    const historicalDataArray = await Promise.all(
      symbols.map((symbol: string) => marketDataService.getMarketData(symbol))
    );
    
    const returnsData: Record<string, number[]> = {};
    symbols.forEach((symbol: string, idx: number) => {
      const historical = historicalDataArray[idx].historical;
      const returns = [];
      for (let i = 1; i < historical.length; i++) {
        const prevClose = historical[i - 1].close;
        const currClose = historical[i].close;
        if (prevClose > 0) {
          returns.push((currClose - prevClose) / prevClose);
        }
      }
      returnsData[symbol] = returns;
    });
    
    const metrics = quantAnalyzer.optimizePortfolio(symbols, returnsData);
    
    return {
      tool: 'analyze_portfolio_metrics',
      result: metrics as unknown as Record<string, unknown>
    };
  }

  private async runMonteCarloSimulation(args: MonteCarloArgs): Promise<ToolResult> {
    const { symbols, allocations, timeHorizon } = args;
    
    const historicalDataArray = await Promise.all(
      symbols.map((symbol: string) => marketDataService.getMarketData(symbol))
    );
    
    // Calculate portfolio expected return and volatility
    const returnsData: Record<string, number[]> = {};
    symbols.forEach((symbol: string, idx: number) => {
      const historical = historicalDataArray[idx].historical;
      const returns = [];
      for (let i = 1; i < historical.length; i++) {
        const prevClose = historical[i - 1].close;
        const currClose = historical[i].close;
        if (prevClose > 0) {
          returns.push((currClose - prevClose) / prevClose);
        }
      }
      returnsData[symbol] = returns;
    });
    
    // Weighted returns
    let expectedReturn = 0;
    let volatility = 0;
    symbols.forEach((symbol: string, idx: number) => {
      const returns = returnsData[symbol];
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      
      expectedReturn += avgReturn * (allocations[idx] / 100);
      volatility += stdDev * (allocations[idx] / 100);
    });
    
    const result = quantAnalyzer.simulateMonteCarlo(
      10000,
      expectedReturn * 252, // Annualized
      volatility * Math.sqrt(252), // Annualized
      timeHorizon * 252 // Convert years to trading days
    );
    
    return {
      tool: 'run_monte_carlo_simulation',
      result: result as unknown as Record<string, unknown>
    };
  }

  private async backtestPortfolio(_args: BacktestArgs): Promise<ToolResult> {
    // This is a simplified implementation
    // In production, you'd want more sophisticated backtesting
    
    return {
      tool: 'backtest_portfolio',
      result: {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        note: 'Backtest requires more historical data'
      }
    };
  }

  // Web search tools
  private async webSearch(args: WebSearchArgs): Promise<ToolResult> {
    const { query, type = 'general', count = 5 } = args;
    
    const response = await mcpWebSearch.search(query, type, Math.min(count, 10));
    
    return {
      tool: 'web_search',
      result: {
        query: response.query,
        provider: response.provider,
        totalResults: response.totalResults,
        results: response.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
          publishedDate: r.publishedDate,
          isTrustedSource: mcpWebSearch.isTrustedFinancialSource(r.url)
        }))
      }
    };
  }

  private async searchStockNews(args: StockNewsArgs): Promise<ToolResult> {
    const { symbol, query, days = 7 } = args;
    
    const results = await mcpWebSearch.searchStockNews(symbol, query, days);
    
    return {
      tool: 'search_stock_news',
      result: {
        symbol,
        newsCount: results.length,
        articles: results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
          publishedDate: r.publishedDate,
          sentiment: r.sentiment,
          isTrustedSource: mcpWebSearch.isTrustedFinancialSource(r.url)
        })),
        sentimentSummary: {
          positive: results.filter(r => r.sentiment === 'positive').length,
          negative: results.filter(r => r.sentiment === 'negative').length,
          neutral: results.filter(r => r.sentiment === 'neutral').length
        }
      }
    };
  }

  private async searchMarketTrends(args: MarketTrendsArgs): Promise<ToolResult> {
    const { topic, timeframe = 'week' } = args;
    
    const response = await mcpWebSearch.searchMarketTrends(topic, timeframe);
    
    return {
      tool: 'search_market_trends',
      result: {
        topic,
        timeframe,
        provider: response.provider,
        insights: response.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
          isTrustedSource: mcpWebSearch.isTrustedFinancialSource(r.url)
        }))
      }
    };
  }

  // Technical indicator calculations
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): MACDResult {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    
    return {
      macd: macdLine,
      signal: 0, // Simplified
      histogram: macdLine
    };
  }

  private calculateBollingerBands(prices: number[], period: number = 20): BollingerBandsResult {
    const sma = this.calculateSMA(prices, period);
    const recentPrices = prices.slice(-period);
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (2 * stdDev),
      middle: sma,
      lower: sma - (2 * stdDev)
    };
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const recentPrices = prices.slice(-period);
    return recentPrices.reduce((a, b) => a + b, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
}

export const toolExecutor = new ToolExecutor();
