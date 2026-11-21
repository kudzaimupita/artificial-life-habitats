// Winters, and a creature's learned sense of when food is scarce.
//
// In a habitat with winters nothing grows for the last part of every year.
// Temperature follows a smooth yearly curve that is lowest in midwinter. A
// creature cannot see the calendar, only the temperature and whether it is
// rising, so it has to learn what each temperature means for food.

/** Steps in a year. */
export const YEAR = 2400;
/** Step of the year at which winter starts; it lasts until the year ends. */
export const WINTER_START = 1600;
const MIDWINTER = (WINTER_START + YEAR) / 2;

/** How far ahead the forecast looks, in steps. */
export const LOOKAHEAD = 200;
/** Fewer visible foods than this, on average, counts as famine. */
export const FAMINE = 1.2;

const LEVELS = 8;
const TREND_WINDOW = 50;
const LEARNING_RATE = 0.05;

/**
 * @param {number} t
 * @returns {boolean}
 */
export function isWinter(t) {
  return t % YEAR >= WINTER_START;
}

/**
 * @param {number} t
 * @returns {number} Temperature in [-1, 1], lowest in midwinter.
 */
export function temperature(t) {
  return -Math.cos((2 * Math.PI * ((t % YEAR) - MIDWINTER)) / YEAR);
}

/**
 * What the creature senses: a coarse temperature level and its trend.
 * @param {number} t
 * @returns {number} A bucket in [0, 2 * LEVELS).
 */
export function senseBucket(t) {
  const now = temperature(t);
  const level = Math.min(LEVELS - 1, Math.floor(((now + 1) / 2) * LEVELS));
  const rising = now > temperature(Math.max(0, t - TREND_WINDOW));
  return level + (rising ? LEVELS : 0);
}

/**
 * Learns two tables from experience: how much food is usually in sight at
 * each sensed temperature, and which temperature tends to follow a while
 * later. Together they give a forecast of food LOOKAHEAD steps ahead.
 */
export class Forecaster {
  constructor() {
    /** Average food in sight per bucket; -1 where nothing is known yet. */
    this.food = new Array(2 * LEVELS).fill(-1);
    /** Bucket seen LOOKAHEAD steps after each bucket; -1 where unknown. */
    this.next = new Array(2 * LEVELS).fill(-1);
    /** @type {number[]} Ring of recent buckets. */
    this.recent = new Array(LOOKAHEAD).fill(-1);
  }

  /**
   * @param {number} t
   * @param {number} foodInSight
   * @returns {{ now: number, soon: number }} Expected food in sight now and
   *   LOOKAHEAD steps ahead; -1 where the creature has no experience yet.
   */
  sense(t, foodInSight) {
    const bucket = senseBucket(t);
    const known = this.food[bucket];
    this.food[bucket] = known < 0 ? foodInSight : known + LEARNING_RATE * (foodInSight - known);

    const slot = t % LOOKAHEAD;
    const earlier = this.recent[slot];
    if (earlier >= 0) this.next[earlier] = bucket;
    this.recent[slot] = bucket;

    const following = this.next[bucket];
    return { now: this.food[bucket], soon: following < 0 ? -1 : this.food[following] };
  }
}
