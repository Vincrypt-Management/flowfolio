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

export interface StreamChunk {
  content: string;
  done: boolean;
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

  /**
   * Stream chat completion - yields chunks as they arrive
   */
  async *chatStream(
    messages: OpenRouterMessage[], 
    model?: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    }
  ): AsyncGenerator<StreamChunk> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const requestBody = {
      model: model || this.defaultModel,
      messages,
      max_tokens: options?.max_tokens || 4000,
      temperature: options?.temperature || 0.7,
      top_p: options?.top_p || 1,
      stream: true,
    };

    console.log('[STREAM] Starting streaming request to:', model || this.defaultModel);

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Flowfolio',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          yield { content: '', done: true };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                yield { content, done: false };
              }
            } catch (e) {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Collect full streamed response with optional progress callback
   */
  async chatWithProgress(
    messages: OpenRouterMessage[], 
    model?: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      onProgress?: (partial: string) => void;
    }
  ): Promise<string> {
    let fullContent = '';
    
    for await (const chunk of this.chatStream(messages, model, options)) {
      if (!chunk.done) {
        fullContent += chunk.content;
        options?.onProgress?.(fullContent);
      }
    }
    
    return fullContent;
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
      console.log('[INFO] Sending request to OpenRouter:', {
        model: model || this.defaultModel,
        messageCount: messages.length,
      });

      const requestBody: OpenRouterRequest = {
        model: model || this.defaultModel,
        messages,
        max_tokens: options?.max_tokens || 4000,
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
          timeout: 60000, // 60 second timeout
        }
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response structure from OpenRouter');
      }

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      if (axios.isAxiosError(error)) {
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
