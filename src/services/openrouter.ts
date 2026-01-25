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
      const result = await invoke<string>('ai_chat', {
        messages,
        model,
        temperature: options?.temperature,
        maxTokens: options?.max_tokens,
      });
      console.log('[OPENROUTER] chat success');
      return result;
    } catch (error) {
      console.error('[OPENROUTER] chat invoke failed:', error);
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
      yield { content: response, done: true };
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
