// What a creature believes about food.
//
// Beliefs are additive: predicted value = colour weight + shape weight. The
// simple mind keeps one set of beliefs and nudges it after every meal. The
// memory mind adds four things:
//
//   1. It learns faster from a meal that surprised it.
//   2. It holds a big surprise aside instead of writing it into its beliefs.
//      One surprise is a fluke; two in a row mean the world changed.
//   3. When the world changed, it looks for an old memory that explains the
//      surprises and switches to it, or starts a fresh one.
//   4. It sleeps: recent meals are replayed and duplicate memories merged.
//
// Separately, a mind can keep a one-trial danger memory: a food that nearly
// killed it is remembered as an exception to the additive rule.

import { COLOURS, SHAPES } from './foods.js';

const BASE_RATE = 0.15;
const SURPRISE_RATE = 0.45;
/** Prediction error above which a meal counts as a big surprise. */
export const BIG_SURPRISE = 5;
/** Big surprises in a row that make the mind reconsider which season it is in. */
const SURPRISES_TO_RECONSIDER = 2;
/** Meals in a fresh memory during which surprises are learned from, not held. */
const SETTLE_MEALS = 3;
/** An old memory explains the evidence if its mean error is below this. */
const RECALL_ERROR = 2.5;
/** Two memories are duplicates if no prediction differs by more than this. */
const MERGE_DIFFERENCE = 2;
const MEALS_KEPT = 40;
/** A meal worse than this is treated as near-fatal by the danger memory. */
export const DANGER_THRESHOLD = -30;
/** What a remembered danger is predicted to be worth. */
export const DANGER_PREDICTION = -40;
/** Weight of curiosity about foods the creature has rarely eaten. */
const CURIOSITY = 4;
/** Meals after which a food not eaten since counts as fully stale. */
const STALE_MEALS = 20;

/**
 * One memory of "how the world works": weights, how often each feature was
 * eaten, and the recent meals that produced them.
 * @typedef {object} Context
 * @property {number[]} colour
 * @property {number[]} shape
 * @property {number[]} colourCount
 * @property {number[]} shapeCount
 * @property {[number, number, number][]} meals Recent [colour, shape, value].
 */

/**
 * @typedef {object} MindEvent
 * @property {'recall' | 'new' | 'danger' | 'safe'} kind
 * @property {string} text
 */

/**
 * @typedef {object} Observation
 * @property {number} predicted
 * @property {number} surprise Absolute prediction error.
 * @property {MindEvent[]} events
 */

/** @returns {Context} */
function newContext() {
  return {
    colour: COLOURS.map(() => 0),
    shape: SHAPES.map(() => 0),
    colourCount: COLOURS.map(() => 0),
    shapeCount: SHAPES.map(() => 0),
    meals: [],
  };
}

/**
 * @param {number} colour
 * @param {number} shape
 */
const keyOf = (colour, shape) => colour * SHAPES.length + shape;

export class Mind {
  /**
   * @param {{ memory?: boolean, dangerMemory?: boolean }} [options]
   */
  constructor({ memory = false, dangerMemory = false } = {}) {
    this.memory = memory;
    this.dangerMemory = dangerMemory;
    /** @type {Context[]} */
    this.contexts = [newContext()];
    this.active = 0;
    /** @type {{ colour: number, shape: number, value: number }[]} */
    this.pending = [];
    this.mealCount = 0;
    this.lastSwitch = -99;
    /** @type {Set<number>} Foods remembered as near-fatal. */
    this.dangers = new Set();
    /** @type {Map<number, number>} Meal count at which each food was last eaten. */
    this.lastEaten = new Map();
  }

  get context() {
    return this.contexts[this.active];
  }

  /**
   * The additive belief, ignoring the danger memory.
   * @param {number} colour
   * @param {number} shape
   * @param {Context} [context]
   */
  belief(colour, shape, context = this.context) {
    return context.colour[colour] + context.shape[shape];
  }

  /**
   * @param {number} colour
   * @param {number} shape
   * @returns {boolean}
   */
  isDangerous(colour, shape) {
    return this.dangers.has(keyOf(colour, shape));
  }

  /**
   * What the creature expects a food to be worth.
   * @param {number} colour
   * @param {number} shape
   */
  predict(colour, shape) {
    if (this.isDangerous(colour, shape)) return DANGER_PREDICTION;
    return this.belief(colour, shape);
  }

  /**
   * 1 for a food never eaten, falling towards 0 with experience.
   * @param {number} colour
   * @param {number} shape
   */
  uncertainty(colour, shape) {
    if (this.isDangerous(colour, shape)) return 0;
    const { colourCount, shapeCount } = this.context;
    return 1 / Math.sqrt(1 + Math.min(colourCount[colour], shapeCount[shape]));
  }

  /**
   * How much the creature wants a food: expected value plus curiosity.
   * @param {number} colour
   * @param {number} shape
   */
  appeal(colour, shape) {
    return this.predict(colour, shape) + CURIOSITY * this.uncertainty(colour, shape);
  }

  /**
   * How long ago the creature last checked a food by eating it: 1 for never
   * or long ago, 0 for just now. A remembered danger is never worth checking.
   * @param {number} colour
   * @param {number} shape
   */
  staleness(colour, shape) {
    if (this.isDangerous(colour, shape)) return 0;
    const last = this.lastEaten.get(keyOf(colour, shape));
    if (last === undefined) return 1;
    return Math.min(1, (this.mealCount - last) / STALE_MEALS);
  }

  /**
   * Move a context's weights towards an observed value. The error is split
   * evenly between the colour weight and the shape weight.
   * @param {Context} context
   * @param {number} colour
   * @param {number} shape
   * @param {number} value
   * @param {number} rate
   * @param {boolean} [count] Whether this counts as fresh experience.
   */
  learn(context, colour, shape, value, rate, count = true) {
    const error = value - this.belief(colour, shape, context);
    context.colour[colour] += rate * error * 0.5;
    context.shape[shape] += rate * error * 0.5;
    if (count) {
      context.colourCount[colour]++;
      context.shapeCount[shape]++;
    }
  }

  /**
   * Learn from a meal and keep it for replay.
   * @param {Context} context
   * @param {number} colour
   * @param {number} shape
   * @param {number} value
   * @param {number} rate
   */
  remember(context, colour, shape, value, rate) {
    this.learn(context, colour, shape, value, rate);
    context.meals.push([colour, shape, value]);
    if (context.meals.length > MEALS_KEPT) context.meals.shift();
  }

  /**
   * The creature ate a food and felt what it was worth.
   * @param {number} colour
   * @param {number} shape
   * @param {number} value
   * @returns {Observation}
   */
  observe(colour, shape, value) {
    /** @type {MindEvent[]} */
    const events = [];
    const key = keyOf(colour, shape);
    this.mealCount++;
    this.lastEaten.set(key, this.mealCount);

    if (this.dangerMemory && value < DANGER_THRESHOLD) {
      const predicted = this.predict(colour, shape);
      this.dangers.add(key);
      events.push({ kind: 'danger', text: 'Nearly died. Will not touch that food again.' });
      return { predicted, surprise: Math.abs(value - predicted), events };
    }
    if (this.dangers.delete(key)) {
      // A remembered danger turned out harmless: forget it and judge the meal
      // by the ordinary beliefs.
      events.push({ kind: 'safe', text: 'A food it feared was harmless. Fear dropped.' });
    }

    const predicted = this.belief(colour, shape);
    const surprise = Math.abs(value - predicted);

    if (!this.memory) {
      this.remember(this.context, colour, shape, value, BASE_RATE);
      return { predicted, surprise, events };
    }

    // A memory with almost no meals in it has nothing to be surprised
    // against: a newborn's first meals are lessons, not signs of change.
    const settled =
      this.mealCount - this.lastSwitch >= SETTLE_MEALS && this.context.meals.length >= SETTLE_MEALS;
    if (surprise > BIG_SURPRISE && settled) {
      this.pending.push({ colour, shape, value });
      if (this.pending.length >= SURPRISES_TO_RECONSIDER) {
        events.push(this.reconsider(this.pending));
        this.pending = [];
      }
      return { predicted, surprise, events };
    }

    // A lone surprise followed by an expected meal was a fluke or a small
    // drift: learn from it now.
    for (const meal of this.pending) {
      this.remember(this.context, meal.colour, meal.shape, meal.value, 0.3);
    }
    this.pending = [];
    const rate = BASE_RATE + SURPRISE_RATE * Math.min(1, surprise / 8);
    this.remember(this.context, colour, shape, value, rate);
    return { predicted, surprise, events };
  }

  /**
   * Several big surprises in a row: decide whether an old memory explains
   * them, or whether this is somewhere new.
   * @param {{ colour: number, shape: number, value: number }[]} evidence
   * @returns {MindEvent}
   */
  reconsider(evidence) {
    /** @param {Context} context */
    const meanError = (context) =>
      evidence.reduce(
        (sum, meal) => sum + Math.abs(meal.value - this.belief(meal.colour, meal.shape, context)),
        0,
      ) / evidence.length;

    let best = -1;
    let bestError = Infinity;
    this.contexts.forEach((context, index) => {
      if (index === this.active || context.meals.length < 3) return;
      const error = meanError(context);
      if (error < bestError) {
        bestError = error;
        best = index;
      }
    });
    this.lastSwitch = this.mealCount;

    if (best >= 0 && bestError < RECALL_ERROR) {
      this.active = best;
      for (const meal of evidence) {
        this.remember(this.context, meal.colour, meal.shape, meal.value, 0.2);
      }
      return {
        kind: 'recall',
        text: `Recognised a season it has seen before (memory ${best + 1}).`,
      };
    }

    this.contexts.push(newContext());
    this.active = this.contexts.length - 1;
    for (const meal of evidence) {
      this.remember(this.context, meal.colour, meal.shape, meal.value, 0.5);
    }
    for (const meal of evidence) {
      this.learn(this.context, meal.colour, meal.shape, meal.value, 0.5, false);
    }
    return {
      kind: 'new',
      text: `The world changed in a new way. Started memory ${this.active + 1}.`,
    };
  }

  /**
   * Sleep: replay recent meals gently, then merge memories that turned out to
   * describe the same season.
   * @returns {number} How many duplicate memories were merged away.
   */
  sleep() {
    const current = this.context;
    for (let pass = 0; pass < 3; pass++) {
      for (const [colour, shape, value] of current.meals.slice(-25)) {
        this.learn(current, colour, shape, value, 0.05, false);
      }
    }

    let merged = 0;
    for (let i = this.contexts.length - 1; i >= 0; i--) {
      const other = this.contexts[i];
      if (other === current || other.meals.length < 5 || current.meals.length < 5) continue;
      let difference = 0;
      for (let c = 0; c < COLOURS.length; c++) {
        for (let s = 0; s < SHAPES.length; s++) {
          const gap = Math.abs(this.belief(c, s, current) - this.belief(c, s, other));
          difference = Math.max(difference, gap);
        }
      }
      if (difference >= MERGE_DIFFERENCE) continue;
      current.meals = current.meals.concat(other.meals).slice(-MEALS_KEPT);
      for (let c = 0; c < COLOURS.length; c++) current.colourCount[c] += other.colourCount[c];
      for (let s = 0; s < SHAPES.length; s++) current.shapeCount[s] += other.shapeCount[s];
      this.contexts.splice(i, 1);
      if (i < this.active) this.active--;
      merged++;
    }
    return merged;
  }
}
