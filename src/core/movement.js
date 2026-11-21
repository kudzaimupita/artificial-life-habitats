// How a creature thinks its buttons move it.
//
// Movement is by four buttons. Each button is wired to a direction, walls
// block, and ice slides the creature one extra cell. A creature needs a model
// of this to plan. The innate model is correct at birth and never changes.
// The learned model starts empty and is built from what each press did.

import { DIRECTIONS, FLOOR, ICE, SIZE, WALL, cellOf, inside } from './constants.js';

/**
 * The part of the world a movement model may look at: the ground.
 * @typedef {object} Ground
 * @property {(x: number, y: number) => number} groundAt
 */

/**
 * @typedef {object} MovementModel
 * @property {(ground: Ground, x: number, y: number, button: number) => number} landing
 *   The cell a press is expected to land on, or -1 if the model has no idea.
 * @property {(ground: Ground, x: number, y: number, button: number, toX: number, toY: number) => void} learn
 * @property {() => number} untriedButton A button never pressed, or -1.
 * @property {(button: number) => number} direction Believed direction index, or -1.
 */

/**
 * The true rule: where a move in a given direction ends up.
 * @param {Ground} ground
 * @param {number} x
 * @param {number} y
 * @param {number} direction Index into DIRECTIONS.
 * @returns {number} Cell index.
 */
export function resolveMove(ground, x, y, direction) {
  const [dx, dy] = DIRECTIONS[direction];
  const nx = x + dx;
  const ny = y + dy;
  if (ground.groundAt(nx, ny) === WALL) return cellOf(x, y);
  if (ground.groundAt(nx, ny) === ICE && ground.groundAt(nx + dx, ny + dy) !== WALL) {
    return cellOf(nx + dx, ny + dy);
  }
  return cellOf(nx, ny);
}

/**
 * Built-in knowledge: the wiring at birth and the true ground rules.
 * @implements {MovementModel}
 */
export class InnateMovement {
  /** @param {number[]} wiring Direction index for each button, as wired at birth. */
  constructor(wiring) {
    this.wiring = wiring.slice();
  }

  /**
   * @param {Ground} ground
   * @param {number} x
   * @param {number} y
   * @param {number} button
   */
  landing(ground, x, y, button) {
    return resolveMove(ground, x, y, this.wiring[button]);
  }

  learn() {}

  untriedButton() {
    return -1;
  }

  /** @param {number} button */
  direction(button) {
    return this.wiring[button];
  }
}

const BUTTON_FADE = 0.85;
const GROUND_FADE = 0.95;
/** Ground outcomes the learned model counts. */
const BLOCKED = 0;
const ONE_STEP = 1;
const SLIDE = 2;

/**
 * Learned from experience: counts of which way each button moved the
 * creature, and of what each kind of ground did. Counts fade, so recent
 * experience outweighs old. That is what lets it relearn after a rewiring.
 * @implements {MovementModel}
 */
export class LearnedMovement {
  constructor() {
    /** @type {number[][]} Per button, evidence for each direction. */
    this.buttons = DIRECTIONS.map(() => DIRECTIONS.map(() => 0));
    /** @type {number[][]} Per ground kind, evidence for blocked / one step / slide. */
    this.outcomes = [FLOOR, ICE, WALL].map(() => [0, 0, 0]);
  }

  /** @param {number} button */
  direction(button) {
    const counts = this.buttons[button];
    const total = counts.reduce((a, b) => a + b, 0);
    return total < 0.5 ? -1 : counts.indexOf(Math.max(...counts));
  }

  untriedButton() {
    return this.buttons.findIndex((_, button) => this.direction(button) < 0);
  }

  /**
   * @param {number} kind Ground code.
   * @returns {number} Most likely outcome of stepping onto that ground, or -1.
   */
  outcome(kind) {
    const counts = this.outcomes[kind];
    const total = counts.reduce((a, b) => a + b, 0);
    return total < 0.5 ? -1 : counts.indexOf(Math.max(...counts));
  }

  /**
   * @param {Ground} ground
   * @param {number} x
   * @param {number} y
   * @param {number} button
   */
  landing(ground, x, y, button) {
    const direction = this.direction(button);
    if (direction < 0) return -1;
    const [dx, dy] = DIRECTIONS[direction];
    const nx = x + dx;
    const ny = y + dy;
    // The edge of the world is plain to see and always blocks.
    if (!inside(nx, ny)) return cellOf(x, y);
    const outcome = this.outcome(ground.groundAt(nx, ny));
    if (outcome === BLOCKED) return cellOf(x, y);
    if (outcome === SLIDE) {
      const fx = nx + dx;
      const fy = ny + dy;
      if (inside(fx, fy) && this.outcome(ground.groundAt(fx, fy)) !== BLOCKED) {
        return cellOf(fx, fy);
      }
    }
    // One step, or ground never met: assume it can be walked on.
    return cellOf(nx, ny);
  }

  /**
   * @param {Ground} ground
   * @param {number} x
   * @param {number} y
   * @param {number} button
   * @param {number} toX
   * @param {number} toY
   */
  learn(ground, x, y, button, toX, toY) {
    const dx = toX - x;
    const dy = toY - y;
    if (dx === 0 && dy === 0) {
      // Nothing happened. Blame the ground it believes it pushed against.
      const believed = this.direction(button);
      if (believed >= 0) {
        const [bx, by] = DIRECTIONS[believed];
        this.countGround(ground.groundAt(x + bx, y + by), BLOCKED);
      }
      return;
    }
    const moved = DIRECTIONS.findIndex((d) => d[0] === Math.sign(dx) && d[1] === Math.sign(dy));
    const counts = this.buttons[button];
    for (let i = 0; i < counts.length; i++) counts[i] *= BUTTON_FADE;
    counts[moved] += 1;
    const distance = Math.abs(dx) + Math.abs(dy);
    const [mx, my] = DIRECTIONS[moved];
    this.countGround(ground.groundAt(x + mx, y + my), distance === 2 ? SLIDE : ONE_STEP);
  }

  /**
   * @param {number} kind
   * @param {number} outcome
   */
  countGround(kind, outcome) {
    const counts = this.outcomes[kind];
    for (let i = 0; i < counts.length; i++) counts[i] *= GROUND_FADE;
    counts[outcome] += 1;
  }
}

/** Number of cells, for callers sizing per-cell arrays. */
export const CELLS = SIZE * SIZE;
