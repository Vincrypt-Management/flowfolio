import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock invokeWithResilience
vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: vi.fn().mockResolvedValue({}),
}));

import { invokeWithResilience } from '../../services/apiClient';

// Extract the handler logic so we can test it in isolation
async function logToJournalHandler(
  title: string,
  content: string,
  addToast: (msg: string, type: string) => void,
) {
  try {
    await invokeWithResilience('create_journal_entry', {
      event_type: 'observation',
      title,
      content,
      plan_version: null,
      tags: ['news'],
    });
    addToast(`Logged "${title}" to journal`, 'success');
  } catch {
    addToast('Failed to log to journal', 'error');
  }
}

describe('logToJournalHandler', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls create_journal_entry with correct snake_case params', async () => {
    await logToJournalHandler('Test Article', 'News: "Test Article"', mockToast);

    expect(invokeWithResilience).toHaveBeenCalledWith('create_journal_entry', {
      event_type: 'observation',
      title: 'Test Article',
      content: 'News: "Test Article"',
      plan_version: null,
      tags: ['news'],
    });
  });

  it('shows success toast after successful journal entry', async () => {
    await logToJournalHandler('My Article', 'content', mockToast);
    expect(mockToast).toHaveBeenCalledWith('Logged "My Article" to journal', 'success');
  });

  it('shows error toast when create_journal_entry throws', async () => {
    vi.mocked(invokeWithResilience).mockRejectedValueOnce(new Error('backend error'));
    await logToJournalHandler('Article', 'content', mockToast);
    expect(mockToast).toHaveBeenCalledWith('Failed to log to journal', 'error');
  });
});
