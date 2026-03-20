import { describe, it, expect } from 'vitest';
import { hasTierAccess } from '../../contexts/SubscriptionContext';

describe('hasTierAccess', () => {
  it('free tier has no premium access', () => {
    expect(hasTierAccess('free', 'ai')).toBe(false);
    expect(hasTierAccess('free', 'sync')).toBe(false);
    expect(hasTierAccess('free', 'pro')).toBe(false);
  });

  it('ai tier grants ai access only', () => {
    expect(hasTierAccess('ai', 'ai')).toBe(true);
    expect(hasTierAccess('ai', 'sync')).toBe(false);
    expect(hasTierAccess('ai', 'pro')).toBe(false);
  });

  it('sync tier grants sync access only', () => {
    expect(hasTierAccess('sync', 'sync')).toBe(true);
    expect(hasTierAccess('sync', 'ai')).toBe(false);
  });

  it('pro tier grants both ai and sync', () => {
    expect(hasTierAccess('pro', 'ai')).toBe(true);
    expect(hasTierAccess('pro', 'sync')).toBe(true);
    expect(hasTierAccess('pro', 'pro')).toBe(true);
  });
});
