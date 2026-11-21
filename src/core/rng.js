// Seeded random numbers. Every world owns one generator, so a seed fully
// determines a run in the browser and in Node alike.

/** @typedef {() => number} Rng A function returning a float in [0, 1). */

/**
 * Mulberry32: a small, fast 32-bit generator with a full 2^32 period.
 * @param {number} seed Any integer; only the low 32 bits are used.
 * @returns {Rng}
 */
export function makeRng(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {Rng} rng
 * @param {number} n
 * @returns {number} An integer in [0, n).
 */
export function randomInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Fisher-Yates shuffle, in place.
 * @template T
 * @param {Rng} rng
 * @param {T[]} items
 * @returns {T[]}
 */
export function shuffle(rng, items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
