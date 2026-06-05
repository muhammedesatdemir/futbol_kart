export interface PRNG {
  next(): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  /** İç durumu (tek sayı) — serileştirip sonra restore etmek için. */
  getState(): number;
  /** İç durumu geri yükler (sunucu-otoriteli online'da kaldığı yerden devam). */
  setState(state: number): void;
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createPRNG(seed: string): PRNG {
  let a = hashSeed(seed) || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('cannot pick from empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    getState() {
      return a;
    },
    setState(state: number) {
      a = state | 0;
    },
  };
}
