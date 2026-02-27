/**
 * Seed-based uniqueness system for Remotion videos.
 * Every render with a different seed produces a visually distinct video.
 * Same seed = same video (deterministic).
 */
import { createContext, useContext } from 'react';

// ─── Deterministic PRNG (Mulberry32) ────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a numeric seed */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

// ─── VideoRNG Class ─────────────────────────────────────────────

export class VideoRNG {
  private rng: () => number;
  readonly seed: number;

  constructor(seed?: number | string) {
    if (seed === undefined) {
      this.seed = Date.now() ^ (Math.random() * 0xffffffff);
    } else if (typeof seed === 'string') {
      this.seed = hashString(seed);
    } else {
      this.seed = seed;
    }
    this.rng = mulberry32(this.seed);
  }

  /** Returns 0-1 */
  next(): number {
    return this.rng();
  }

  /** Returns integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from array */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick N unique elements from array */
  pickN<T>(arr: readonly T[], n: number): T[] {
    const shuffled = this.shuffle([...arr]);
    return shuffled.slice(0, Math.min(n, arr.length));
  }

  /** Shuffle array (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** Vary a number within ±range (percentage 0-1) */
  vary(base: number, range: number): number {
    const offset = (this.next() - 0.5) * 2 * range;
    return base * (1 + offset);
  }

  /** Vary a number additively within ±amount */
  offset(base: number, amount: number): number {
    return base + (this.next() - 0.5) * 2 * amount;
  }

  /** Create a child RNG with a derived seed for independent sequences */
  fork(salt: string): VideoRNG {
    return new VideoRNG(this.seed ^ hashString(salt));
  }

  /** Pick an index (0 to n-1) */
  index(n: number): number {
    return Math.floor(this.next() * n);
  }
}

// ─── React Context ──────────────────────────────────────────────

const defaultRNG = new VideoRNG(42);

export const VideoSeedContext = createContext<VideoRNG>(defaultRNG);

export function useVideoRNG(): VideoRNG {
  return useContext(VideoSeedContext);
}

/** Fork a new RNG for a specific scene/component */
export function useSceneRNG(sceneName: string): VideoRNG {
  const parent = useVideoRNG();
  return parent.fork(sceneName);
}
