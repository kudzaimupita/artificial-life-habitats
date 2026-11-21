// World and body constants shared by every habitat.

/** Side of the square grid, in cells. */
export const SIZE = 24;
/** How far a creature sees, in cells, in every direction (a square window). */
export const SIGHT = 7;
/** Food items a world holds when nothing stops growth. */
export const FOOD_COUNT = 22;
/** Chance per step that one food item rots and is replaced elsewhere. */
export const ROT_CHANCE = 0.08;
/** Chance per step that a missing food item regrows (matters after a winter). */
export const REGROW_CHANCE = 0.3;

export const MAX_ENERGY = 100;
export const START_ENERGY = 80;
/** Energy a creature has when it comes back after dying. */
export const RESPAWN_ENERGY = 60;
/** Energy spent per waking step. */
export const METABOLISM = 0.12;
/** Energy spent per step asleep. */
export const SLEEP_COST = 0.06;
/** Energy spent per step hibernating. */
export const HIBERNATE_COST = 0.035;

/** A creature with memory sleeps this often, for this long. */
export const SLEEP_EVERY = 400;
export const SLEEP_LENGTH = 25;

/** Creatures reconsider their target or route this often. */
export const REPLAN_EVERY = 4;
/** Each step of distance takes this much off a food's appeal. */
export const DISTANCE_COST = 0.35;
/** A food must be at least this appealing, after distance, to be worth a trip. */
export const TARGET_THRESHOLD = 0.5;

/** Terrain codes. */
export const FLOOR = 0;
export const ICE = 1;
export const WALL = 2;

/** The four directions a button can be wired to: east, south, west, north. */
export const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * @param {number} x
 * @param {number} y
 * @returns {number} The cell index of a grid position.
 */
export function cellOf(x, y) {
  return y * SIZE + x;
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inside(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}
