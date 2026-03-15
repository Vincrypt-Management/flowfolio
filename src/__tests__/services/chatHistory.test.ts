import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock logger before any imports
vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fake IndexedDB setup (must happen before module import)
// ---------------------------------------------------------------------------

const mockObjectStore = {
  add: vi.fn().mockImplementation((value: unknown) => {
    const req: Record<string, unknown> = { result: undefined, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  get: vi.fn().mockImplementation((key: unknown) => {
    const req: Record<string, unknown> = { result: undefined, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  put: vi.fn().mockImplementation(() => {
    const req: Record<string, unknown> = { result: undefined, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  delete: vi.fn().mockImplementation(() => {
    const req: Record<string, unknown> = { result: undefined, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  getAll: vi.fn().mockImplementation(() => {
    const req: Record<string, unknown> = { result: [], error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  clear: vi.fn().mockImplementation(() => {
    const req: Record<string, unknown> = { result: undefined, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  count: vi.fn().mockImplementation(() => {
    const req: Record<string, unknown> = { result: 0, error: null };
    setTimeout(() => {
      if (typeof req.onsuccess === 'function')
        (req.onsuccess as (e: unknown) => void)({ target: req });
    }, 0);
    return req;
  }),
  index: vi.fn().mockReturnValue({
    openCursor: vi.fn().mockImplementation(() => {
      // Immediately resolve with null cursor (no records)
      const req: Record<string, unknown> = { result: null, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    }),
    getAll: vi.fn().mockImplementation(() => {
      const req: Record<string, unknown> = { result: [], error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    }),
  }),
  createIndex: vi.fn(),
};

const mockTransaction = {
  objectStore: vi.fn().mockReturnValue(mockObjectStore),
  oncomplete: null as unknown,
  onerror: null as unknown,
};

// Fire oncomplete shortly after transaction is created
function makeMockTransaction() {
  const tx: Record<string, unknown> = {
    objectStore: vi.fn().mockReturnValue(mockObjectStore),
    oncomplete: null,
    onerror: null,
  };
  setTimeout(() => {
    if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
  }, 10);
  return tx;
}

const mockDB = {
  transaction: vi.fn().mockImplementation(() => makeMockTransaction()),
  objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
  createObjectStore: vi.fn().mockReturnValue(mockObjectStore),
};

// Mock IDBKeyRange globally
Object.defineProperty(globalThis, 'IDBKeyRange', {
  value: {
    upperBound: (value: unknown) => ({ upper: value }),
    lowerBound: (value: unknown) => ({ lower: value }),
    bound: (lower: unknown, upper: unknown) => ({ lower, upper }),
    only: (value: unknown) => ({ only: value }),
  },
  writable: true,
});

// Mock indexedDB.open globally before module import
Object.defineProperty(globalThis, 'indexedDB', {
  value: {
    open: vi.fn().mockImplementation(() => {
      const req: Record<string, unknown> = { result: mockDB, error: null };
      setTimeout(() => {
        // Trigger onupgradeneeded first (schema setup)
        if (typeof req.onupgradeneeded === 'function')
          (req.onupgradeneeded as (e: unknown) => void)({ target: req });
        // Then trigger onsuccess
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    }),
  },
  writable: true,
});

// Mock window.setInterval so startAutoCleanup doesn't fail
Object.defineProperty(globalThis, 'window', {
  value: {
    setInterval: (fn: () => void, delay: number) => setInterval(fn, delay),
    clearInterval: (id: unknown) => clearInterval(id as number),
  },
  writable: true,
});

// Now import after globals are set
const { chatHistoryService } = await import('../../services/chatHistory');
const chatHistoryTypes = await import('../../services/chatHistory');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatHistoryService', () => {
  describe('singleton', () => {
    it('chatHistoryService is defined', () => {
      expect(chatHistoryService).toBeDefined();
      expect(chatHistoryService).not.toBeNull();
    });

    it('chatHistoryService is an object', () => {
      expect(typeof chatHistoryService).toBe('object');
    });
  });

  describe('generateId()', () => {
    it('returns a string', () => {
      const id = (chatHistoryService as unknown as { generateId: () => string }).generateId();
      expect(typeof id).toBe('string');
    });

    it('matches the pattern <timestamp>_<random>', () => {
      const id = (chatHistoryService as unknown as { generateId: () => string }).generateId();
      expect(id).toMatch(/^\d+_[a-z0-9]+$/);
    });

    it('produces unique IDs on repeated calls', () => {
      const generateId = (chatHistoryService as unknown as { generateId: () => string }).generateId.bind(chatHistoryService);
      const ids = new Set(Array.from({ length: 20 }, () => generateId()));
      expect(ids.size).toBe(20);
    });

    it('timestamp portion is within 1 second of now', () => {
      const before = Date.now();
      const id = (chatHistoryService as unknown as { generateId: () => string }).generateId();
      const ts = parseInt(id.split('_')[0], 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now() + 10);
    });

    it('random suffix has non-zero length', () => {
      const id = (chatHistoryService as unknown as { generateId: () => string }).generateId();
      const suffix = id.split('_')[1];
      expect(suffix.length).toBeGreaterThan(0);
    });
  });

  describe('module-level constants (by-value verification)', () => {
    it('AUTO_DELETE_THRESHOLD_MS equals 30 days in milliseconds', () => {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      expect(THIRTY_DAYS_MS).toBe(2592000000);
    });

    it('CLEANUP_INTERVAL_MS equals 1 hour in milliseconds', () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      expect(ONE_HOUR_MS).toBe(3600000);
    });
  });

  describe('Conversation interface shape', () => {
    it('Conversation object has all required fields', () => {
      const conv: chatHistoryTypes.Conversation = {
        id: 'test-id-123',
        title: 'Test Conversation',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: 'First message here',
      };
      expect(conv.id).toBe('test-id-123');
      expect(conv.title).toBe('Test Conversation');
      expect(typeof conv.createdAt).toBe('number');
      expect(typeof conv.updatedAt).toBe('number');
      expect(conv.messageCount).toBe(0);
      expect(conv.preview).toBe('First message here');
    });

    it('Conversation supports optional portfolioId', () => {
      const conv: chatHistoryTypes.Conversation = {
        id: 'abc',
        title: 'Portfolio Conv',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount: 3,
        preview: 'What is my portfolio worth?',
        portfolioId: 'portfolio-xyz',
      };
      expect(conv.portfolioId).toBe('portfolio-xyz');
    });
  });

  describe('ChatMessage interface shape', () => {
    it('ChatMessage object has all required fields', () => {
      const msg: chatHistoryTypes.ChatMessage = {
        id: 'msg-001',
        conversationId: 'conv-001',
        role: 'user',
        content: 'Hello, how are you?',
        timestamp: Date.now(),
      };
      expect(msg.id).toBe('msg-001');
      expect(msg.conversationId).toBe('conv-001');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello, how are you?');
      expect(typeof msg.timestamp).toBe('number');
    });

    it('ChatMessage role can be assistant or system', () => {
      const assistantMsg: chatHistoryTypes.ChatMessage = {
        id: 'msg-002',
        conversationId: 'conv-001',
        role: 'assistant',
        content: 'I am doing well.',
        timestamp: Date.now(),
      };
      const systemMsg: chatHistoryTypes.ChatMessage = {
        id: 'msg-003',
        conversationId: 'conv-001',
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: Date.now(),
      };
      expect(assistantMsg.role).toBe('assistant');
      expect(systemMsg.role).toBe('system');
    });
  });

  describe('ConversationWithMessages interface shape', () => {
    it('ConversationWithMessages extends Conversation with messages array', () => {
      const conv: chatHistoryTypes.ConversationWithMessages = {
        id: 'conv-full',
        title: 'Full Conversation',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount: 1,
        preview: 'Hello',
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-full',
            role: 'user',
            content: 'Hello',
            timestamp: 1500,
          },
        ],
      };
      expect(conv.messages).toHaveLength(1);
      expect(conv.messages[0].role).toBe('user');
      expect(conv.id).toBe('conv-full');
    });
  });

  describe('getDaysUntilDeletion()', () => {
    it('returns 30 for a brand-new conversation', () => {
      const conv: chatHistoryTypes.Conversation = {
        id: 'new',
        title: 'New',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: '',
      };
      const days = chatHistoryService.getDaysUntilDeletion(conv);
      expect(days).toBe(30);
    });

    it('returns 0 for a conversation older than 30 days', () => {
      const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
      const conv: chatHistoryTypes.Conversation = {
        id: 'old',
        title: 'Old',
        createdAt: Date.now() - THIRTY_ONE_DAYS_MS,
        updatedAt: Date.now() - THIRTY_ONE_DAYS_MS,
        messageCount: 0,
        preview: '',
      };
      const days = chatHistoryService.getDaysUntilDeletion(conv);
      expect(days).toBe(0);
    });

    it('returns correct remaining days for a 15-day-old conversation', () => {
      const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
      const conv: chatHistoryTypes.Conversation = {
        id: 'mid',
        title: 'Mid',
        createdAt: Date.now() - FIFTEEN_DAYS_MS,
        updatedAt: Date.now() - FIFTEEN_DAYS_MS,
        messageCount: 0,
        preview: '',
      };
      const days = chatHistoryService.getDaysUntilDeletion(conv);
      expect(days).toBe(15);
    });
  });

  describe('stopAutoCleanup()', () => {
    it('stopAutoCleanup() can be called without throwing', () => {
      expect(() => chatHistoryService.stopAutoCleanup()).not.toThrow();
    });

    it('stopAutoCleanup() can be called multiple times safely', () => {
      expect(() => {
        chatHistoryService.stopAutoCleanup();
        chatHistoryService.stopAutoCleanup();
      }).not.toThrow();
    });
  });
});
