import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiInlinePanel } from '../../components/AiInlinePanel';

const invokeMock = vi.fn();
const listenMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

describe('AiInlinePanel', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn()); // default: noop unlisten
  });

  it('renders the default trigger label', () => {
    render(<AiInlinePanel prompt="hello" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });

  it('honors a custom trigger label', () => {
    render(<AiInlinePanel prompt="hello" triggerLabel="Explain this" />);
    expect(screen.getByRole('button', { name: /explain this/i })).toBeInTheDocument();
  });

  it('shows empty hint when in idle phase', () => {
    render(<AiInlinePanel prompt="hello" emptyHint="Click to learn more" />);
    expect(screen.getByText(/click to learn more/i)).toBeInTheDocument();
  });

  it('disables the trigger when disabled prop is true', () => {
    render(<AiInlinePanel prompt="hello" disabled />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeDisabled();
  });

  it('disables the trigger when prompt is empty string', () => {
    render(<AiInlinePanel prompt="" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeDisabled();
  });

  it('invokes ai_chat_stream with the prompt on click', async () => {
    invokeMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AiInlinePanel prompt="explain backtest" />);
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    // Hook awaits listen() before calling invoke — flush microtasks + a macrotask.
    await new Promise((r) => setTimeout(r, 0));
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_chat_stream',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'explain backtest' }],
      }),
    );
  });
});
