/** Deterministic pseudo-randomness: same (seed, session, resource, index) always
 *  produces the same value, which is what makes --seed and per-session seeding
 *  reproducible. */

/** FNV-1a style string hash -> unsigned 32-bit int. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 - small, fast, good enough for mock data. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random generator whose stream is bound to one (session, resource, index). */
export function scopedRandom(parts: Array<string | number>): () => number {
  return createRandom(hashString(parts.join("\u0000")));
}

export function randomInt(rand: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rand() * (max - min + 1));
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() needs a non-empty list");
  return items[Math.floor(rand() * items.length)]!;
}
