/**
 * Integration tests for the investment journal flow.
 *
 * Tests simulate the round-trip through mocked Tauri command handlers with
 * in-memory storage, mirroring the Rust `Journal` module's behaviour without
 * requiring a live Tauri process.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriCommand, clearTauriMocks } from './tauri-mock';
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types that mirror the Rust structs in src-tauri/src/modules/journal/mod.rs
// ---------------------------------------------------------------------------

interface JournalEntry {
  id: string;
  timestamp: string;
  event_type: string;
  title: string;
  content: string;
  plan_version: string | null;
  metadata: Record<string, string>;
  tags: string[];
}

interface JournalFilter {
  event_types?: string[];
  tags?: string[];
  date_from?: string;
  date_to?: string;
  search_query?: string;
}

interface JournalStats {
  total_entries: number;
  entries_by_type: Record<string, number>;
  entries_by_month: Record<string, number>;
  common_tags: [string, number][];
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeEntry(
  event_type: string,
  title: string,
  content: string,
  tags: string[],
  timestamp: string,
  metadata: Record<string, string> = {},
): JournalEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    timestamp,
    event_type,
    title,
    content,
    plan_version: null,
    metadata,
    tags,
  };
}

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Journal Flow Integration', () => {
  let store: JournalEntry[] = [];

  beforeEach(() => {
    clearTauriMocks();
    store = [];

    // ---- create_journal_entry ----
    mockTauriCommand('create_journal_entry', (args) => {
      const { event_type, title, content, plan_version, tags, metadata } = args as {
        event_type: string;
        title: string;
        content: string;
        plan_version?: string;
        tags: string[];
        metadata?: Record<string, string>;
      };
      const entry: JournalEntry = {
        id: `entry-${store.length + 1}`,
        timestamp: nowISO(),
        event_type,
        title,
        content,
        plan_version: plan_version ?? null,
        metadata: metadata ?? {},
        tags,
      };
      store.push(entry);
      return entry;
    });

    // ---- filter_journal_entries ----
    mockTauriCommand('filter_journal_entries', (args) => {
      const filter = ((args as { filter?: JournalFilter })?.filter ?? {}) as JournalFilter;
      return store.filter((entry) => {
        if (filter.event_types && !filter.event_types.includes(entry.event_type)) return false;
        if (filter.tags && !filter.tags.some((t) => entry.tags.includes(t))) return false;
        if (filter.date_from && entry.timestamp < filter.date_from) return false;
        if (filter.date_to && entry.timestamp > filter.date_to) return false;
        if (filter.search_query) {
          const q = filter.search_query.toLowerCase();
          if (!entry.title.toLowerCase().includes(q) && !entry.content.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    });

    // ---- calculate_journal_stats ----
    mockTauriCommand('calculate_journal_stats', () => {
      const entries_by_type: Record<string, number> = {};
      const entries_by_month: Record<string, number> = {};
      const tag_counts: Record<string, number> = {};

      for (const entry of store) {
        entries_by_type[entry.event_type] = (entries_by_type[entry.event_type] ?? 0) + 1;
        const month = entry.timestamp.slice(0, 7);
        entries_by_month[month] = (entries_by_month[month] ?? 0) + 1;
        for (const tag of entry.tags) {
          tag_counts[tag] = (tag_counts[tag] ?? 0) + 1;
        }
      }

      const common_tags: [string, number][] = Object.entries(tag_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const stats: JournalStats = {
        total_entries: store.length,
        entries_by_type,
        entries_by_month,
        common_tags,
      };
      return stats;
    });

    // ---- export_journal_markdown ----
    mockTauriCommand('export_journal_markdown', (args) => {
      const { entries } = args as { entries: JournalEntry[] };
      let md = '# Investment Journal\n\n';
      md += `Total Entries: ${entries.length}\n\n`;
      md += '---\n\n';
      for (const entry of entries) {
        md += `## ${entry.title} (${entry.event_type})\n\n`;
        md += `**Date:** ${entry.timestamp}\n\n`;
        if (entry.tags.length > 0) {
          md += `**Tags:** ${entry.tags.join(', ')}\n\n`;
        }
        md += `${entry.content}\n\n`;
        if (Object.keys(entry.metadata).length > 0) {
          md += '**Metadata:**\n';
          for (const [k, v] of Object.entries(entry.metadata)) {
            md += `- ${k}: ${v}\n`;
          }
          md += '\n';
        }
        md += '---\n\n';
      }
      return md;
    });
  });

  // =========================================================================
  // create_journal_entry -> filter_journal_entries
  // =========================================================================

  describe('create_journal_entry -> filter_journal_entries', () => {
    it('created entry appears when listing with no filter', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Buy AAPL',
        content: 'Strong fundamentals and momentum.',
        tags: ['trade', 'AAPL'],
      });

      const results = await invoke<JournalEntry[]>('filter_journal_entries', { filter: {} });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Buy AAPL');
      expect(results[0].event_type).toBe('trade_decision');
      expect(results[0].tags).toContain('AAPL');
    });

    it('entry is excluded when event_type filter does not match', async () => {
      await invoke('create_journal_entry', {
        event_type: 'reflection',
        title: 'Year-end reflection',
        content: 'Overall a good year.',
        tags: ['annual'],
      });
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Buy MSFT',
        content: 'Cloud growth.',
        tags: ['trade'],
      });

      const trades = await invoke<JournalEntry[]>('filter_journal_entries', {
        filter: { event_types: ['trade_decision'] },
      });
      expect(trades).toHaveLength(1);
      expect(trades[0].event_type).toBe('trade_decision');
    });

    it('entry is found when tag filter matches', async () => {
      await invoke('create_journal_entry', {
        event_type: 'review',
        title: 'Q2 Review',
        content: 'Quarterly performance summary.',
        tags: ['quarterly', 'review'],
      });
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Buy VTI',
        content: 'Index fund.',
        tags: ['trade', 'etf'],
      });

      const quarterly = await invoke<JournalEntry[]>('filter_journal_entries', {
        filter: { tags: ['quarterly'] },
      });
      expect(quarterly).toHaveLength(1);
      expect(quarterly[0].title).toBe('Q2 Review');
    });

    it('search_query matches content case-insensitively', async () => {
      await invoke('create_journal_entry', {
        event_type: 'reflection',
        title: 'Market thoughts',
        content: 'Apple is looking strong this quarter.',
        tags: [],
      });
      await invoke('create_journal_entry', {
        event_type: 'reflection',
        title: 'Sector rotation note',
        content: 'Moving out of energy.',
        tags: [],
      });

      const results = await invoke<JournalEntry[]>('filter_journal_entries', {
        filter: { search_query: 'apple' },
      });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Market thoughts');
    });

    it('search_query matches title as well as content', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Apple Watch demand surge',
        content: 'Hardware cycle is strong.',
        tags: [],
      });

      const results = await invoke<JournalEntry[]>('filter_journal_entries', {
        filter: { search_query: 'Apple' },
      });
      expect(results).toHaveLength(1);
    });

    it('plan_version is stored on the entry', async () => {
      const entry = await invoke<JournalEntry>('create_journal_entry', {
        event_type: 'strategy_change',
        title: 'Updated vibe plan',
        content: 'Shifted to growth factors.',
        plan_version: 'v2.0',
        tags: ['strategy'],
      });
      expect(entry.plan_version).toBe('v2.0');
    });

    it('entry id is unique across multiple creates', async () => {
      const a = await invoke<JournalEntry>('create_journal_entry', {
        event_type: 'reflection',
        title: 'Entry A',
        content: 'Content A',
        tags: [],
      });
      const b = await invoke<JournalEntry>('create_journal_entry', {
        event_type: 'reflection',
        title: 'Entry B',
        content: 'Content B',
        tags: [],
      });
      expect(a.id).not.toBe(b.id);
    });
  });

  // =========================================================================
  // calculate_journal_stats
  // =========================================================================

  describe('calculate_journal_stats', () => {
    it('returns zero stats for empty journal', async () => {
      const stats = await invoke<JournalStats>('calculate_journal_stats', {});
      expect(stats.total_entries).toBe(0);
      expect(Object.keys(stats.entries_by_type)).toHaveLength(0);
      expect(stats.common_tags).toHaveLength(0);
    });

    it('total_entries matches number of created entries', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Buy AAPL',
        content: 'Strong fundamentals.',
        tags: ['trade'],
      });
      await invoke('create_journal_entry', {
        event_type: 'trade_decision',
        title: 'Buy MSFT',
        content: 'Cloud growth.',
        tags: ['trade'],
      });
      await invoke('create_journal_entry', {
        event_type: 'review',
        title: 'Q1 Review',
        content: 'Good quarter.',
        tags: ['review', 'quarterly'],
      });

      const stats = await invoke<JournalStats>('calculate_journal_stats', {});
      expect(stats.total_entries).toBe(3);
    });

    it('entries_by_type counts are correct', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision', title: 'T1', content: 'c', tags: [],
      });
      await invoke('create_journal_entry', {
        event_type: 'trade_decision', title: 'T2', content: 'c', tags: [],
      });
      await invoke('create_journal_entry', {
        event_type: 'review', title: 'R1', content: 'c', tags: [],
      });

      const stats = await invoke<JournalStats>('calculate_journal_stats', {});
      expect(stats.entries_by_type['trade_decision']).toBe(2);
      expect(stats.entries_by_type['review']).toBe(1);
    });

    it('common_tags are sorted by frequency descending', async () => {
      // Use pre-built entries with predictable timestamps to avoid month issues
      const seedEntries: JournalEntry[] = [
        makeEntry('trade', 'T1', 'c', ['stock', 'tech'], '2024-03-01T00:00:00Z'),
        makeEntry('trade', 'T2', 'c', ['stock', 'tech'], '2024-03-02T00:00:00Z'),
        makeEntry('trade', 'T3', 'c', ['stock'], '2024-03-03T00:00:00Z'),
        makeEntry('review', 'R1', 'c', ['quarterly'], '2024-03-15T00:00:00Z'),
      ];
      // Directly push into store (bypassing the command) for deterministic timestamps
      store.push(...seedEntries);

      const stats = await invoke<JournalStats>('calculate_journal_stats', {});
      // stock: 3, tech: 2, quarterly: 1
      const stockEntry = stats.common_tags.find(([tag]) => tag === 'stock');
      const techEntry = stats.common_tags.find(([tag]) => tag === 'tech');
      const quarterlyEntry = stats.common_tags.find(([tag]) => tag === 'quarterly');

      expect(stockEntry).toBeDefined();
      expect(stockEntry![1]).toBe(3);
      expect(techEntry).toBeDefined();
      expect(techEntry![1]).toBe(2);
      expect(quarterlyEntry).toBeDefined();
      expect(quarterlyEntry![1]).toBe(1);

      // Verify descending order
      const counts = stats.common_tags.map(([, c]) => c);
      const sorted = [...counts].sort((a, b) => b - a);
      expect(counts).toEqual(sorted);
    });

    it('entries_by_month groups entries by YYYY-MM prefix', async () => {
      store.push(
        makeEntry('trade', 'T1', 'c', [], '2024-01-15T00:00:00Z'),
        makeEntry('trade', 'T2', 'c', [], '2024-01-20T00:00:00Z'),
        makeEntry('trade', 'T3', 'c', [], '2024-03-05T00:00:00Z'),
      );

      const stats = await invoke<JournalStats>('calculate_journal_stats', {});
      expect(stats.entries_by_month['2024-01']).toBe(2);
      expect(stats.entries_by_month['2024-03']).toBe(1);
    });
  });

  // =========================================================================
  // export_journal_markdown
  // =========================================================================

  describe('export_journal_markdown', () => {
    it('exports empty journal with correct header', async () => {
      const md = await invoke<string>('export_journal_markdown', { entries: [] });
      expect(md).toContain('# Investment Journal');
      expect(md).toContain('Total Entries: 0');
    });

    it('exported markdown contains entry title and event_type', async () => {
      const entries: JournalEntry[] = [
        makeEntry('trade_decision', 'Buy AAPL', 'Great fundamentals.', ['trade'], '2024-03-01T00:00:00Z'),
      ];
      const md = await invoke<string>('export_journal_markdown', { entries });
      expect(md).toContain('## Buy AAPL (trade_decision)');
      expect(md).toContain('Great fundamentals.');
    });

    it('exported markdown includes tags when present', async () => {
      const entries: JournalEntry[] = [
        makeEntry('trade_decision', 'Buy MSFT', 'Cloud dominance.', ['trade', 'tech'], '2024-03-02T00:00:00Z'),
      ];
      const md = await invoke<string>('export_journal_markdown', { entries });
      expect(md).toContain('**Tags:** trade, tech');
    });

    it('exported markdown omits tags section when entry has no tags', async () => {
      const entries: JournalEntry[] = [
        makeEntry('reflection', 'My Thoughts', 'Some content.', [], '2024-03-03T00:00:00Z'),
      ];
      const md = await invoke<string>('export_journal_markdown', { entries });
      expect(md).not.toContain('**Tags:**');
    });

    it('exported markdown includes metadata when present', async () => {
      const entries: JournalEntry[] = [
        makeEntry(
          'trade_decision',
          'Buy AAPL',
          'Strong buy.',
          ['trade'],
          '2024-03-01T00:00:00Z',
          { symbol: 'AAPL', action: 'BUY' },
        ),
      ];
      const md = await invoke<string>('export_journal_markdown', { entries });
      expect(md).toContain('**Metadata:**');
      expect(md).toContain('symbol: AAPL');
      expect(md).toContain('action: BUY');
    });

    it('each entry is separated by a horizontal rule', async () => {
      const entries: JournalEntry[] = [
        makeEntry('trade_decision', 'Buy AAPL', 'Content A.', [], '2024-03-01T00:00:00Z'),
        makeEntry('review', 'Q1 Review', 'Content B.', [], '2024-03-15T00:00:00Z'),
      ];
      const md = await invoke<string>('export_journal_markdown', { entries });
      // Header separator + one per entry = 3 occurrences of '---'
      const separators = (md.match(/^---$/gm) ?? []).length;
      expect(separators).toBe(3);
    });

    it('create then export round-trip produces correct total count', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision', title: 'Trade A', content: 'Content A.', tags: ['trade'],
      });
      await invoke('create_journal_entry', {
        event_type: 'reflection', title: 'Reflection B', content: 'Content B.', tags: [],
      });

      const all = await invoke<JournalEntry[]>('filter_journal_entries', { filter: {} });
      const md = await invoke<string>('export_journal_markdown', { entries: all });

      expect(md).toContain('Total Entries: 2');
      expect(md).toContain('Trade A');
      expect(md).toContain('Reflection B');
    });
  });

  // =========================================================================
  // Error cases
  // =========================================================================

  describe('error handling', () => {
    it('throws a descriptive error for unmocked commands', async () => {
      await expect(invoke('delete_journal_entry', { id: '1' })).rejects.toThrow(
        'Unmocked Tauri command: delete_journal_entry',
      );
    });

    it('filter returns empty array when no entries match', async () => {
      await invoke('create_journal_entry', {
        event_type: 'trade_decision', title: 'Buy AAPL', content: 'Bullish.', tags: ['trade'],
      });

      const results = await invoke<JournalEntry[]>('filter_journal_entries', {
        filter: { event_types: ['review'] },
      });
      expect(results).toHaveLength(0);
    });
  });
});
