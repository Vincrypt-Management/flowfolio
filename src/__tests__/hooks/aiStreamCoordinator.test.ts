import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claim, release, _resetForTests } from '../../hooks/aiStreamCoordinator';

describe('aiStreamCoordinator', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('claim with no active stream stores the new stop fn (no cancel)', () => {
    const stopA = vi.fn();
    claim(stopA);
    expect(stopA).not.toHaveBeenCalled();
  });

  it('claim while another is active cancels the prior one', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    claim(stopB);
    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).not.toHaveBeenCalled();
  });

  it('claim with the same stop fn does not cancel itself', () => {
    const stopA = vi.fn();
    claim(stopA);
    claim(stopA);
    expect(stopA).not.toHaveBeenCalled();
  });

  it('release of the active stop clears the slot', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    release(stopA);
    claim(stopB);
    expect(stopA).not.toHaveBeenCalled();
    expect(stopB).not.toHaveBeenCalled();
  });

  it('release of a non-active stop is a no-op', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    release(stopB);
    // stopA is still the active one — claiming again should cancel it
    const stopC = vi.fn();
    claim(stopC);
    expect(stopA).toHaveBeenCalledOnce();
  });
});
