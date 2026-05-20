import { createLogger } from '../core/logger';
import { listen } from '@tauri-apps/api/event';
import { isTauriContext } from './tauri';
import { invokeWithResilience } from './apiClient';

const log = createLogger('openrouter');

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
      return await invokeWithResilience<boolean>('ai_is_configured');
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
    log.debug(`chat called with model: ${model}`);
    try {
      const response = await invokeWithResilience<string>('ai_chat', {
        messages,
        model,
        temperature: options?.temperature,
        maxTokens: options?.max_tokens,
      });
      
      // Check for empty response
      if (!response || response.trim().length === 0) {
        throw new Error('AI service returned empty response');
      }
      
      log.debug(`chat success, response length: ${response.length}`);
      return response;
    } catch (error) {
      log.error('chat invoke failed', error);
      
      // Re-throw with more context if needed
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check for common error patterns and provide helpful messages
      if (errorMsg.includes('not configured')) {
        throw new Error('AI service not configured. Please set up your OpenRouter API key in the .env file.');
      }
      if (errorMsg.includes('Invalid API key')) {
        throw new Error('Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY in .env.');
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
   * Real streaming via Tauri `ai_chat_stream` + `ai-token` events. Each event payload
   * is yielded as a non-terminal chunk; a final `{ content: '', done: true }` marks completion.
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
    log.debug(`chatStream called with model: ${model}`);

    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let finished = false;
    let error: Error | null = null;

    const unlisten = await listen<string>('ai-token', (event) => {
      queue.push(event.payload);
      resolveNext?.();
      resolveNext = null;
    });

    const invokePromise = invokeWithResilience<string>('ai_chat_stream', {
      messages,
      model,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
    })
      .then(() => { finished = true; resolveNext?.(); resolveNext = null; })
      .catch((e) => {
        error = e instanceof Error ? e : new Error(String(e));
        finished = true;
        resolveNext?.();
        resolveNext = null;
      });

    try {
      while (true) {
        while (queue.length > 0) {
          const content = queue.shift()!;
          yield { content, done: false };
        }
        if (finished) break;
        await new Promise<void>((res) => { resolveNext = res; });
      }
      // Drain any tokens that arrived between the queue check and finished flag.
      while (queue.length > 0) {
        yield { content: queue.shift()!, done: false };
      }
      if (error) throw error;
      yield { content: '', done: true };
    } finally {
      unlisten();
      await invokePromise;
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
    return invokeWithResilience<string>('ai_generate_portfolio_insight', { portfolioData });
  }

  async chatWithAssistant(userMessage: string, conversationHistory: OpenRouterMessage[] = []): Promise<string> {
    return invokeWithResilience<string>('ai_chat_assistant', {
      message: userMessage,
      history: conversationHistory,
    });
  }
}

export const openRouterService = new OpenRouterService();

/**
 * Stream a chat completion using the Tauri ai_chat_stream backend command.
 * Each token is delivered to `onToken` as it arrives via the 'ai-token' event.
 * Falls back to a non-streaming single call when running in web mode.
 */
export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!isTauriContext()) {
    // Web mode fallback: non-streaming, deliver the full response as one token
    const result = await invokeWithResilience<string>('ai_chat', {
      messages,
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    onToken(result);
    return result;
  }

  const unlisten = await listen<string>('ai-token', (event) => {
    onToken(event.payload);
  });

  try {
    const result = await invokeWithResilience<string>('ai_chat_stream', {
      messages,
      model: options?.model,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    });
    return result;
  } finally {
    unlisten();
  }
}
