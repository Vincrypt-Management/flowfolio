import { describe, it, expect, vi } from 'vitest';

// The openrouter service calls invokeWithResilience which ultimately calls
// invoke() from ../../services/tauri. The global setup.ts mocks that module
// with vi.fn() returning undefined (not throwing), so isConfigured() would
// return undefined rather than false. Override the mock here to reject so the
// catch block in isConfigured() returns false as intended.
vi.mock('../../services/tauri', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Tauri not available in test environment')),
  isTauriContext: vi.fn().mockReturnValue(false),
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
