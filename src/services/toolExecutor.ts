import { ToolCall, ToolResult } from './tools';
import { marketDataService } from './marketData';
import { quantAnalyzer } from './quantAnalysis';

export class ToolExecutor {
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    try {
      console.log(`[INFO] Executing tool: ${toolCall.name}`, toolCall.arguments);

      switch (toolCall.name) {
        case 'fetch_stock_data':
          return await this.fetchStockData(toolCall.arguments);
        
        case 'fetch_multiple_stocks':
          return await this.fetchMultipleStocks(toolCall.arguments);
        
        case 'calculate_technical_indicators':
          return await this.calculateTechnicalIndicators(toolCall.arguments);
        
        case 'analyze_portfolio_metrics':
          return await this.analyzePortfolioMetrics(toolCall.arguments);
        
        case 'run_monte_carlo_simulation':
          return await this.runMonteCarloSimulation(toolCall.arguments);
        
        case 'backtest_portfolio':
          return await this.backtestPortfolio(toolCall.arguments);
        
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

  private async fetchStockData(args: any): Promise<ToolResult> {
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
          prices: marketData.historical.map((d: any) => ({ date: d.date, close: d.close }))
        } : null
      }
    };
  }

  private async fetchMultipleStocks(args: any): Promise<ToolResult> {
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

  private async calculateTechnicalIndicators(args: any): Promise<ToolResult> {
    const { symbol, indicators } = args;
    
    const marketData = await marketDataService.getMarketData(symbol);
    const prices = marketData.historical.map((d: any) => d.close);
    
    const results: any = { symbol };
    
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
      result: results
    };
  }

  private async analyzePortfolioMetrics(args: any): Promise<ToolResult> {
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
      result: metrics
    };
  }

  private async runMonteCarloSimulation(args: any): Promise<ToolResult> {
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
      result
    };
  }

  private async backtestPortfolio(_args: any): Promise<ToolResult> {
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

  private calculateMACD(prices: number[]): any {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    
    return {
      macd: macdLine,
      signal: 0, // Simplified
      histogram: macdLine
    };
  }

  private calculateBollingerBands(prices: number[], period: number = 20): any {
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
