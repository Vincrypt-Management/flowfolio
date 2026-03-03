/**
 * Chat History Service
 * 
 * Provides local persistence for chat conversations with:
 * - IndexedDB storage for reliability
 * - Auto-deletion of messages older than 30 days
 * - Session-based conversation grouping
 * - Export/import functionality
 */

import { createLogger } from '../core/logger';
import { OpenRouterMessage } from './openrouter';

const log = createLogger('chat-history');

const DB_NAME = 'flowfolio_chat_history';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';
const MESSAGE_STORE_NAME = 'messages';

// 30 days in milliseconds
const AUTO_DELETE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// Cleanup interval (run every hour)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface ChatMessage extends OpenRouterMessage {
  id: string;
  timestamp: number;
  conversationId: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string; // First user message or summary
  portfolioId?: string; // Optional link to a generated portfolio
}

export interface ConversationWithMessages extends Conversation {
  messages: ChatMessage[];
}

class ChatHistoryService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private cleanupInterval: number | null = null;

  constructor() {
    this.dbReady = this.initDB();
    this.startAutoCleanup();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        log.error('IndexedDB error', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        log.info('Database initialized');
        // Run initial cleanup
        this.cleanupOldMessages();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create conversations store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const conversationStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          conversationStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create messages store
        if (!db.objectStoreNames.contains(MESSAGE_STORE_NAME)) {
          const messageStore = db.createObjectStore(MESSAGE_STORE_NAME, { keyPath: 'id' });
          messageStore.createIndex('conversationId', 'conversationId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        log.info('Database schema created/upgraded');
      };
    });
  }

  /**
   * Start automatic cleanup of old messages
   */
  private startAutoCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupOldMessages();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop automatic cleanup (call when service is destroyed)
   */
  public stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Delete conversations and messages older than 30 days
   */
  public async cleanupOldMessages(): Promise<{ deletedConversations: number; deletedMessages: number }> {
    await this.dbReady;
    if (!this.db) return { deletedConversations: 0, deletedMessages: 0 };

    const cutoffTime = Date.now() - AUTO_DELETE_THRESHOLD_MS;
    let deletedConversations = 0;
    let deletedMessages = 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, MESSAGE_STORE_NAME], 'readwrite');
      const conversationStore = transaction.objectStore(STORE_NAME);
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

      // Find old conversations
      const conversationIndex = conversationStore.index('updatedAt');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const conversationRequest = conversationIndex.openCursor(range);

      const oldConversationIds: string[] = [];

      conversationRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const conversation = cursor.value as Conversation;
          oldConversationIds.push(conversation.id);
          cursor.delete();
          deletedConversations++;
          cursor.continue();
        } else {
          // After collecting old conversation IDs, delete their messages
          if (oldConversationIds.length > 0) {
            const messageIndex = messageStore.index('conversationId');
            
            oldConversationIds.forEach(convId => {
              const msgRange = IDBKeyRange.only(convId);
              const msgCursor = messageIndex.openCursor(msgRange);
              
              msgCursor.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                  cursor.delete();
                  deletedMessages++;
                  cursor.continue();
                }
              };
            });
          }
        }
      };

      transaction.oncomplete = () => {
        if (deletedConversations > 0 || deletedMessages > 0) {
          log.info(`Cleanup complete: ${deletedConversations} conversations, ${deletedMessages} messages deleted (older than 30 days)`);
        }
        resolve({ deletedConversations, deletedMessages });
      };

      transaction.onerror = () => {
        log.error('Cleanup error', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new conversation
   */
  public async createConversation(title?: string, portfolioId?: string): Promise<Conversation> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const conversation: Conversation = {
      id: this.generateId(),
      title: title || `Conversation ${new Date(now).toLocaleDateString()}`,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      preview: '',
      portfolioId,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(conversation);

      request.onsuccess = () => {
        log.debug(`Conversation created: ${conversation.id}`);
        resolve(conversation);
      };

      request.onerror = () => {
        log.error('Error creating conversation', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Add a message to a conversation
   */
  public async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<ChatMessage> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const message: ChatMessage = {
      id: this.generateId(),
      conversationId,
      role,
      content,
      timestamp: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([MESSAGE_STORE_NAME, STORE_NAME], 'readwrite');
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
      const conversationStore = transaction.objectStore(STORE_NAME);

      // Add message
      const addRequest = messageStore.add(message);

      addRequest.onsuccess = () => {
        // Update conversation metadata
        const getRequest = conversationStore.get(conversationId);

        getRequest.onsuccess = () => {
          const conversation = getRequest.result as Conversation;
          if (conversation) {
            conversation.updatedAt = now;
            conversation.messageCount++;
            
            // Update preview with first user message
            if (role === 'user' && !conversation.preview) {
              conversation.preview = content.substring(0, 100) + (content.length > 100 ? '...' : '');
            }

            conversationStore.put(conversation);
          }
        };
      };

      transaction.oncomplete = () => resolve(message);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Add multiple messages to a conversation (batch)
   */
  public async addMessages(
    conversationId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  ): Promise<ChatMessage[]> {
    const results: ChatMessage[] = [];
    for (const msg of messages) {
      const saved = await this.addMessage(conversationId, msg.role, msg.content);
      results.push(saved);
    }
    return results;
  }

  /**
   * Get all messages for a conversation
   */
  public async getMessages(conversationId: string): Promise<ChatMessage[]> {
    await this.dbReady;
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([MESSAGE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(MESSAGE_STORE_NAME);
      const index = store.index('conversationId');
      const request = index.getAll(IDBKeyRange.only(conversationId));

      request.onsuccess = () => {
        const messages = request.result as ChatMessage[];
        // Sort by timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);
        resolve(messages);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a conversation with its messages
   */
  public async getConversation(conversationId: string): Promise<ConversationWithMessages | null> {
    await this.dbReady;
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, MESSAGE_STORE_NAME], 'readonly');
      const conversationStore = transaction.objectStore(STORE_NAME);
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

      const convRequest = conversationStore.get(conversationId);

      convRequest.onsuccess = () => {
        const conversation = convRequest.result as Conversation | undefined;
        if (!conversation) {
          resolve(null);
          return;
        }

        const messageIndex = messageStore.index('conversationId');
        const msgRequest = messageIndex.getAll(IDBKeyRange.only(conversationId));

        msgRequest.onsuccess = () => {
          const messages = msgRequest.result as ChatMessage[];
          messages.sort((a, b) => a.timestamp - b.timestamp);
          resolve({ ...conversation, messages });
        };

        msgRequest.onerror = () => reject(msgRequest.error);
      };

      convRequest.onerror = () => reject(convRequest.error);
    });
  }

  /**
   * List all conversations (sorted by most recent first)
   */
  public async listConversations(): Promise<Conversation[]> {
    await this.dbReady;
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const conversations = request.result as Conversation[];
        // Sort by updatedAt descending (most recent first)
        conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(conversations);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update conversation title
   */
  public async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(conversationId);

      request.onsuccess = () => {
        const conversation = request.result as Conversation;
        if (conversation) {
          conversation.title = title;
          conversation.updatedAt = Date.now();
          store.put(conversation);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete a conversation and all its messages
   */
  public async deleteConversation(conversationId: string): Promise<void> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, MESSAGE_STORE_NAME], 'readwrite');
      const conversationStore = transaction.objectStore(STORE_NAME);
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

      // Delete conversation
      conversationStore.delete(conversationId);

      // Delete all messages for this conversation
      const messageIndex = messageStore.index('conversationId');
      const msgRequest = messageIndex.openCursor(IDBKeyRange.only(conversationId));

      msgRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        log.debug(`Conversation deleted: ${conversationId}`);
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete all conversations and messages
   */
  public async clearAll(): Promise<void> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, MESSAGE_STORE_NAME], 'readwrite');
      const conversationStore = transaction.objectStore(STORE_NAME);
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

      conversationStore.clear();
      messageStore.clear();

      transaction.oncomplete = () => {
        log.info('All data cleared');
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Export all conversations to JSON
   */
  public async exportAll(): Promise<ConversationWithMessages[]> {
    const conversations = await this.listConversations();
    const result: ConversationWithMessages[] = [];

    for (const conv of conversations) {
      const messages = await this.getMessages(conv.id);
      result.push({ ...conv, messages });
    }

    return result;
  }

  /**
   * Import conversations from JSON
   */
  public async importConversations(data: ConversationWithMessages[]): Promise<number> {
    let imported = 0;

    for (const conv of data) {
      try {
        // Create conversation
        const newConv = await this.createConversation(conv.title, conv.portfolioId);
        
        // Add messages
        for (const msg of conv.messages) {
          await this.addMessage(newConv.id, msg.role, msg.content);
        }
        
        imported++;
      } catch (error) {
        log.error('Error importing conversation', error);
      }
    }

    return imported;
  }

  /**
   * Get storage statistics
   */
  public async getStats(): Promise<{
    conversationCount: number;
    messageCount: number;
    oldestConversation: Date | null;
    newestConversation: Date | null;
  }> {
    await this.dbReady;
    if (!this.db) {
      return { conversationCount: 0, messageCount: 0, oldestConversation: null, newestConversation: null };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, MESSAGE_STORE_NAME], 'readonly');
      const conversationStore = transaction.objectStore(STORE_NAME);
      const messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

      let conversationCount = 0;
      let messageCount = 0;
      let oldest: number | null = null;
      let newest: number | null = null;

      const convCountRequest = conversationStore.count();
      convCountRequest.onsuccess = () => {
        conversationCount = convCountRequest.result;
      };

      const msgCountRequest = messageStore.count();
      msgCountRequest.onsuccess = () => {
        messageCount = msgCountRequest.result;
      };

      const convRequest = conversationStore.getAll();
      convRequest.onsuccess = () => {
        const conversations = convRequest.result as Conversation[];
        if (conversations.length > 0) {
          const sorted = conversations.sort((a, b) => a.createdAt - b.createdAt);
          oldest = sorted[0].createdAt;
          newest = sorted[sorted.length - 1].createdAt;
        }
      };

      transaction.oncomplete = () => {
        resolve({
          conversationCount,
          messageCount,
          oldestConversation: oldest ? new Date(oldest) : null,
          newestConversation: newest ? new Date(newest) : null,
        });
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get days until a conversation will be auto-deleted
   */
  public getDaysUntilDeletion(conversation: Conversation): number {
    const ageMs = Date.now() - conversation.updatedAt;
    const remainingMs = AUTO_DELETE_THRESHOLD_MS - ageMs;
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  }
}

// Export singleton instance
export const chatHistoryService = new ChatHistoryService();
export type { ChatHistoryService };
