import axios from 'axios';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class OpenRouterService {
  private apiKey: string;
  private apiUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
    this.apiUrl = import.meta.env.VITE_OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
    this.defaultModel = import.meta.env.VITE_DEFAULT_LLM_MODEL || 'anthropic/claude-3-sonnet-20240229';
  }

  async chat(
    messages: OpenRouterMessage[], 
    model?: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      response_format?: { type: 'json_object' };
    }
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      console.log('Sending request to OpenRouter:', {
        url: `${this.apiUrl}/chat/completions`,
        model: model || this.defaultModel,
        messageCount: messages.length,
        options
      });

      const requestBody: OpenRouterRequest = {
        model: model || this.defaultModel,
        messages,
        max_tokens: options?.max_tokens || 8000,
        temperature: options?.temperature || 0.7,
        top_p: options?.top_p || 1,
      };
      
      // Add response_format if specified (for models that support it)
      if (options?.response_format) {
        requestBody.response_format = options.response_format;
      }

      const response = await axios.post(
        `${this.apiUrl}/chat/completions`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Flowfolio',
          },
        }
      );

      console.log('Full OpenRouter response:', JSON.stringify(response.data, null, 2));

      if (!response.data) {
        throw new Error('No response data from OpenRouter API');
      }

      if (!response.data.choices) {
        console.error('Response missing choices:', response.data);
        throw new Error(`Invalid response structure: ${JSON.stringify(response.data).substring(0, 200)}`);
      }

      if (!response.data.choices[0]) {
        throw new Error('No choices in response');
      }

      if (!response.data.choices[0].message) {
        console.error('Choice missing message:', response.data.choices[0]);
        throw new Error('Response choice missing message field');
      }

      const content = response.data.choices[0].message.content;
      if (!content) {
        throw new Error('Empty content in response');
      }

      return content;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers
        });
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error(`OpenRouter API error: ${errorMsg}`);
      }
      throw error;
    }
  }

  async generatePortfolioInsight(portfolioData: any): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a financial advisor AI assistant. Analyze portfolio data and provide concise, actionable insights about diversification, risk, and opportunities.'
      },
      {
        role: 'user',
        content: `Analyze this portfolio and provide insights:\n${JSON.stringify(portfolioData, null, 2)}`
      }
    ];

    return this.chat(messages);
  }

  async generateGoalRecommendation(goal: any, currentPortfolio: any): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a financial planning AI assistant. Provide personalized recommendations for achieving financial goals based on current portfolio status.'
      },
      {
        role: 'user',
        content: `Goal: ${JSON.stringify(goal)}\nCurrent Portfolio: ${JSON.stringify(currentPortfolio)}\n\nProvide specific recommendations to achieve this goal.`
      }
    ];

    return this.chat(messages);
  }

  async analyzeInvestmentOpportunity(ticker: string, marketData: any, portfolioContext: any): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are an investment analysis AI. Analyze potential investments considering market data and portfolio context. Provide risk assessment and fit analysis.'
      },
      {
        role: 'user',
        content: `Analyze ${ticker}:\nMarket Data: ${JSON.stringify(marketData)}\nPortfolio Context: ${JSON.stringify(portfolioContext)}`
      }
    ];

    return this.chat(messages);
  }

  async generateRiskAssessment(portfolio: any, riskProfile: string): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a risk management AI. Assess portfolio risk levels and provide recommendations for alignment with risk tolerance.'
      },
      {
        role: 'user',
        content: `Portfolio: ${JSON.stringify(portfolio)}\nRisk Profile: ${riskProfile}\n\nProvide risk assessment and recommendations.`
      }
    ];

    return this.chat(messages);
  }

  async generateTaxOptimizationAdvice(portfolio: any, taxSituation: any): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are a tax optimization AI advisor. Provide strategies for tax-efficient investing. Note: This is educational information, not professional tax advice.'
      },
      {
        role: 'user',
        content: `Portfolio: ${JSON.stringify(portfolio)}\nTax Situation: ${JSON.stringify(taxSituation)}\n\nSuggest tax optimization strategies.`
      }
    ];

    return this.chat(messages);
  }

  async chatWithAssistant(userMessage: string, conversationHistory: OpenRouterMessage[] = []): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are Flowfolio AI, a helpful financial assistant. Provide clear, concise answers about portfolio management, investments, and financial planning.'
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage
      }
    ];

    return this.chat(messages);
  }
}

export const openRouterService = new OpenRouterService();
