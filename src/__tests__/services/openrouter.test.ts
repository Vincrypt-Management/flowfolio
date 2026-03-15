import { describe, it, expect, vi } from 'vitest';

// Mock @tauri-apps/api/core before the module loads.
// In a non-Tauri test environment the invoke call throws, so isConfigured()
// falls back to false — which is the behaviour we want to verify.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Tauri not available in test environment')),
}));

// Import after mock is registered
const { openRouterService } = await import('../../services/openrouter');

describe('OpenRouterService', () => {
  it('isConfigured() returns a boolean', async () => {
    const result = await openRouterService.isConfigured();
    expect(typeof result).toBe('boolean');
  });

  it('isConfigured() returns false when no Tauri backend is available', async () => {
    // The mock rejects, so the catch block returns false
    const result = await openRouterService.isConfigured();
    expect(result).toBe(false);
  });

  it('openRouterService is defined and is an object', () => {
    expect(openRouterService).toBeDefined();
    expect(typeof openRouterService).toBe('object');
  });

  it('openRouterService exposes expected methods', () => {
    expect(typeof openRouterService.isConfigured).toBe('function');
    expect(typeof openRouterService.chat).toBe('function');
    expect(typeof openRouterService.chatStream).toBe('function');
    expect(typeof openRouterService.chatWithProgress).toBe('function');
    expect(typeof openRouterService.generatePortfolioInsight).toBe('function');
    expect(typeof openRouterService.chatWithAssistant).toBe('function');
  });
});
