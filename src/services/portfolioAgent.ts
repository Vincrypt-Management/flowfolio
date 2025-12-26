import { openRouterService, OpenRouterMessage } from './openrouter';
import { marketDataService } from './marketData';

interface PortfolioAsset {
  symbol: string;
  name: string;
  allocation: number; // percentage
  rationale: string;
  currentPrice?: number;
  sector?: string;
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
}

class PortfolioAgentService {
  private vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01';

  async generatePortfolio(userPrompt: string): Promise<GeneratedPortfolio> {
    console.log('🚀 Starting portfolio generation for:', userPrompt);

    // Step 1: Use AI to understand user intent and extract key parameters
    const intentAnalysis = await this.analyzeUserIntent(userPrompt);
    console.log('📊 Intent analysis:', intentAnalysis);

    // Step 2: Generate initial portfolio structure with AI
    const portfolioStructure = await this.generatePortfolioStructure(userPrompt, intentAnalysis);
    console.log('🏗️ Portfolio structure:', portfolioStructure);

    // Step 3: Fetch real market data for recommended assets
    const enrichedPortfolio = await this.enrichWithMarketData(portfolioStructure);
    console.log('💰 Enriched portfolio:', enrichedPortfolio);

    return enrichedPortfolio;
  }

  private async analyzeUserIntent(prompt: string): Promise<any> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a financial portfolio analysis AI. Extract key investment parameters from user queries.
        
Respond ONLY with valid JSON in this exact format:
{
  "riskTolerance": "low|medium|high",
  "timeHorizon": "short-term (<1yr)|medium-term (1-5yr)|long-term (>5yr)",
  "investmentGoal": "growth|income|balanced|preservation",
  "sectors": ["technology", "healthcare", "energy"],
  "preferences": ["ESG", "dividend", "growth", "value"],
  "rebalanceFrequency": "monthly|quarterly|annually"
}`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await openRouterService.chat(messages, this.vibeModel);
    
    // Extract JSON from response (handle markdown code blocks)
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
        content: `You are an expert portfolio manager AI. Create diversified investment portfolios.

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanations, just pure JSON.

Required JSON structure:
{
  "title": "Portfolio Name",
  "description": "Brief description",
  "strategy": "Investment strategy explanation",
  "riskLevel": "Low|Medium|High",
  "timeHorizon": "1-5 years|5-10 years|10+ years",
  "rebalanceFrequency": "Quarterly|Semi-annually|Annually",
  "assets": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "allocation": 15.5,
      "rationale": "Why this asset",
      "sector": "Technology"
    }
  ],
  "expectedReturn": "8-12% annually",
  "volatility": "Medium (12-18% standard deviation)",
  "reasoning": "Overall portfolio reasoning"
}

Rules:
- Use real ticker symbols (US stocks/ETFs)
- Allocations must sum to 100%
- Include 5-15 assets for diversification
- Mix stocks, ETFs, and bonds based on risk tolerance
- Consider sector diversification`
      },
      {
        role: 'user',
        content: `Create a portfolio for: ${userPrompt}

Based on this analysis:
- Risk Tolerance: ${intent.riskTolerance}
- Time Horizon: ${intent.timeHorizon}
- Goal: ${intent.investmentGoal}
- Sectors: ${intent.sectors?.join(', ') || 'diversified'}
- Preferences: ${intent.preferences?.join(', ') || 'none'}
- Rebalance: ${intent.rebalanceFrequency}

Return ONLY valid JSON matching the structure above.`
      }
    ];

    const response = await openRouterService.chat(messages, this.vibeModel);
    console.log('📝 Raw AI response:', response);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse portfolio structure from AI response');
    }

    const portfolio = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    if (!portfolio.assets || !Array.isArray(portfolio.assets)) {
      throw new Error('Invalid portfolio structure: missing assets array');
    }

    return portfolio;
  }

  private async enrichWithMarketData(portfolio: GeneratedPortfolio): Promise<GeneratedPortfolio> {
    console.log('📈 Fetching market data for assets...');
    
    const symbols = portfolio.assets.map(a => a.symbol);
    const marketData = await marketDataService.getBatchMarketData(symbols);

    // Enrich each asset with current market data
    const enrichedAssets = portfolio.assets.map(asset => {
      const data = marketData[asset.symbol];
      return {
        ...asset,
        currentPrice: data?.quote?.price || undefined,
      };
    });

    return {
      ...portfolio,
      assets: enrichedAssets,
    };
  }

  // Chat interface for follow-up questions
  async chatAboutPortfolio(
    userMessage: string,
    portfolio: GeneratedPortfolio,
    conversationHistory: OpenRouterMessage[] = []
  ): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are Flowfolio AI, an expert portfolio advisor. You previously recommended this portfolio:

${JSON.stringify(portfolio, null, 2)}

Answer user questions about this portfolio, provide insights, explain your reasoning, or suggest adjustments. Be concise and helpful.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage
      }
    ];

    return openRouterService.chat(messages, this.vibeModel);
  }

  // Analyze and suggest rebalancing
  async analyzeRebalancing(
    currentHoldings: Record<string, number>, // symbol -> current allocation %
    targetPortfolio: GeneratedPortfolio
  ): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a portfolio rebalancing advisor. Compare current holdings to target allocation and provide specific rebalancing recommendations.'
      },
      {
        role: 'user',
        content: `Current Holdings:
${JSON.stringify(currentHoldings, null, 2)}

Target Portfolio:
${JSON.stringify(targetPortfolio.assets.map(a => ({ symbol: a.symbol, allocation: a.allocation })), null, 2)}

Provide specific buy/sell recommendations to rebalance the portfolio.`
      }
    ];

    return openRouterService.chat(messages, this.vibeModel);
  }

  // Enhanced market analysis with real-time data
  async analyzeMarketOpportunity(symbol: string, context?: string): Promise<string> {
    console.log(`🔍 Analyzing market opportunity for ${symbol}...`);

    // Fetch real market data
    const marketData = await marketDataService.getMarketData(symbol);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a market analyst AI. Analyze stocks using real-time market data and provide investment insights.'
      },
      {
        role: 'user',
        content: `Analyze ${symbol} with this real-time data:

Current Price: $${marketData.quote?.price}
Change: ${marketData.quote?.changePercent}%
Volume: ${marketData.quote?.volume}
Recent Performance: ${marketData.historical.slice(0, 5).map(d => `${d.date}: $${d.close}`).join(', ')}

${context ? `Context: ${context}` : ''}

Provide:
1. Price trend analysis
2. Volume analysis
3. Risk assessment
4. Investment recommendation (Buy/Hold/Sell)
5. Target price range`
      }
    ];

    return openRouterService.chat(messages, this.vibeModel);
  }
}

export const portfolioAgent = new PortfolioAgentService();
export type { GeneratedPortfolio, PortfolioAsset };
