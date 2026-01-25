import { invoke } from '@tauri-apps/api/core';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

class OpenRouterService {
  /**
   * Check if AI service is configured (has API key)
   */
  async isConfigured(): Promise<boolean> {
    try {
      return await invoke<boolean>('ai_is_configured');
    } catch {
      return false;
    }
  }

  /**
   * Send chat completion request via backend
   */
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
    console.log('[OPENROUTER] chat called with model:', model);
    try {
      const response = await invoke<string>('ai_chat', {
        messages,
        model,
        temperature: options?.temperature,
        maxTokens: options?.max_tokens,
      });
      
      // Check for empty response
      if (!response || response.trim().length === 0) {
        throw new Error('AI service returned empty response');
      }
      
      console.log('[OPENROUTER] chat success, response length:', response.length);
      return response;
    } catch (error) {
      console.error('[OPENROUTER] chat invoke failed:', error);
      
      // Re-throw with more context if needed
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check for common error patterns and provide helpful messages
      if (errorMsg.includes('not configured')) {
        throw new Error('AI service not configured. Please set up your OpenRouter API key in the .env file.');
      }
      if (errorMsg.includes('Invalid API key')) {
        throw new Error('Invalid OpenRouter API key. Please check your VITE_OPENROUTER_API_KEY.');
      }
      if (errorMsg.includes('Rate limited')) {
        throw new Error('AI service rate limited. Please wait a moment and try again.');
      }
      if (errorMsg.includes('Insufficient credits')) {
        throw new Error('Insufficient OpenRouter credits. Please add credits to your account.');
      }
      
      throw error;
    }
  }

  /**
   * Stream chat completion - yields chunks as they arrive
   * Note: Streaming is not yet supported via Tauri backend, falls back to non-streaming
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
    // For now, use non-streaming and yield the full response
    // TODO: Implement proper streaming via Tauri events
    try {
      console.log('[OPENROUTER] chatStream called with model:', model);
      const response = await this.chat(messages, model, options);
      console.log('[OPENROUTER] chatStream response received, length:', response?.length);
      
      // First yield the content with done: false so it gets captured
      yield { content: response, done: false };
      // Then signal completion
      yield { content: '', done: true };
    } catch (error) {
      console.error('[OPENROUTER] chatStream error:', error);
      throw error;
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
    const response = await this.chat(messages, model, options);
    options?.onProgress?.(response);
    return response;
  }

  async generatePortfolioInsight(portfolioData: unknown): Promise<string> {
    return invoke<string>('ai_generate_portfolio_insight', { portfolioData });
  }

  async chatWithAssistant(userMessage: string, conversationHistory: OpenRouterMessage[] = []): Promise<string> {
    return invoke<string>('ai_chat_assistant', {
      message: userMessage,
      history: conversationHistory,
    });
  }
}

export const openRouterService = new OpenRouterService();
