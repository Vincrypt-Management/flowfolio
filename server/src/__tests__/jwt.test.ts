import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, signRefreshToken } from '../jwt';

describe('signAccessToken', () => {
  it('returns a string', async () => {
    const token = await signAccessToken({ userId: 'u1', email: 'a@b.com', tier: 'free' }, 'testsecret');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });
});

describe('verifyAccessToken', () => {
  it('round-trips a token', async () => {
    const token = await signAccessToken({ userId: 'u1', email: 'a@b.com', tier: 'ai' }, 'testsecret');
    const payload = await verifyAccessToken(token, 'testsecret');
    expect(payload.userId).toBe('u1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.tier).toBe('ai');
  });

  it('throws on invalid token', async () => {
    await expect(verifyAccessToken('not.a.token', 'testsecret')).rejects.toThrow();
  });
});

describe('signRefreshToken', () => {
  it('returns a non-empty string', async () => {
    const token = await signRefreshToken('u1', 'testsecret');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});
