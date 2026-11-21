// Route planning: imagine button presses with the creature's own movement
// model, and pick the food that is worth the walk.

import { SIZE, TARGET_THRESHOLD, cellOf } from './constants.js';

/** Routes longer than this are not considered. */
const MAX_DEPTH = 20;
const CELLS = SIZE * SIZE;
const BUTTONS = [0, 1, 2, 3];

// Scratch buffers reused by every search. A search is synchronous and leaves
// nothing behind that a later search reads, so sharing them is safe.
const depth = new Int16Array(CELLS);
const parent = new Int16Array(CELLS);
const via = new Int8Array(CELLS);
const queue = new Int16Array(CELLS);

/**
 * @typedef {import('./world.js').World} World
 * @typedef {import('./world.js').Food} Food
 * @typedef {import('./creature.js').Creature} Creature
 */

/**
 * @typedef {object} Plan
 * @property {Food} target
 * @property {number[]} buttons Presses still to make.
 * @property {number[]} cells The cell each press is expected to land on.
 */

/**
 * Breadth-first search over imagined presses. Food the creature believes is
 * bad acts as a wall, because stepping on food eats it. Each food in sight
 * scores its appeal minus the length of the route to it; the best wins.
 * @param {World} world
 * @param {Creature} creature
 * @param {number} distanceCost Appeal lost per step of the route.
 * @returns {Plan | null}
 */
export function planRoute(world, creature, distanceCost) {
  // The most any route could score. If nothing in sight is worth one step,
  // there is nothing to search for.
  let bestPossible = -Infinity;
  for (const food of world.visibleFood(creature)) {
    bestPossible = Math.max(bestPossible, creature.appeal(food));
  }
  if (bestPossible - distanceCost <= TARGET_THRESHOLD) return null;

  const start = cellOf(creature.x, creature.y);
  depth.fill(-1);
  depth[start] = 0;
  queue[0] = start;
  let queued = 1;

  /** @type {Food | null} */
  let target = null;
  let bestScore = TARGET_THRESHOLD;

  for (let head = 0; head < queued; head++) {
    const cell = queue[head];
    const steps = depth[cell] + 1;
    // Cells come off the queue nearest first, so once no longer route can
    // beat the best found, the search is over.
    if (steps > MAX_DEPTH || bestPossible - distanceCost * steps <= bestScore) break;
    const x = cell % SIZE;
    const y = (cell - x) / SIZE;
    for (const button of BUTTONS) {
      const next = creature.model.landing(world, x, y, button);
      if (next < 0 || depth[next] >= 0) continue;
      const food = world.foodAtCell(next);
      if (food && creature.avoids(food)) continue;
      depth[next] = steps;
      parent[next] = cell;
      via[next] = button;
      queue[queued++] = next;
      if (!food || !world.sees(creature, food)) continue;
      const score = creature.appeal(food) - distanceCost * steps;
      if (score > bestScore) {
        bestScore = score;
        target = food;
      }
    }
  }
  if (!target) return null;

  const buttons = [];
  const cells = [];
  for (let cell = cellOf(target.x, target.y); cell !== start; cell = parent[cell]) {
    buttons.unshift(via[cell]);
    cells.unshift(cell);
  }
  return { target, buttons, cells };
}
