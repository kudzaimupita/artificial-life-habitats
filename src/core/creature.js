// A creature: a body with energy, a mind that values food, a model of its own
// movement, and optional abilities switched on per variant.

import {
  DISTANCE_COST,
  HIBERNATE_COST,
  METABOLISM,
  REPLAN_EVERY,
  SIZE,
  SLEEP_COST,
  SLEEP_EVERY,
  SLEEP_LENGTH,
  START_ENERGY,
  TARGET_THRESHOLD,
  cellOf,
} from './constants.js';
import { Mind } from './mind.js';
import { InnateMovement, LearnedMovement } from './movement.js';
import { planRoute } from './planner.js';
import { randomInt } from './rng.js';
import { FAMINE, Forecaster } from './weather.js';

/** Appeal lost per step when a famine is forecast: food is worth a longer walk. */
const STOCK_UP_DISTANCE_COST = 0.1;

/** Below this energy a creature is hungry, and hunger makes it less picky. */
const HUNGRY = 40;
/** How strongly a starving creature is drawn to foods it has not checked lately. */
const HUNGER_CURIOSITY = 10;

/**
 * @typedef {import('./world.js').World} World
 * @typedef {import('./world.js').Food} Food
 */

/**
 * @typedef {object} Abilities
 * @property {boolean} [memory] Surprise-held memories, recall and sleep.
 * @property {boolean} [planner] Plans routes instead of stepping straight at food.
 * @property {boolean} [learnsMovement] Learns its buttons and the terrain from scratch.
 * @property {boolean} [forecast] Learns the seasons of famine, hibernates and stocks up.
 * @property {boolean} [dangerMemory] Remembers a near-fatal food after one meal.
 */

/** @typedef {'exploring' | 'heading for food' | 'following a plan' | 'trying buttons' | 'sleeping' | 'hibernating'} Activity */

export class Creature {
  /**
   * @param {Abilities} abilities
   * @param {number[]} wiring Button wiring at birth.
   */
  constructor(abilities, wiring) {
    /** @type {Required<Abilities>} */
    this.abilities = {
      memory: false,
      planner: false,
      learnsMovement: false,
      forecast: false,
      dangerMemory: false,
      ...abilities,
    };
    this.mind = new Mind(this.abilities);
    /** @type {import('./movement.js').MovementModel} */
    this.model = this.abilities.learnsMovement ? new LearnedMovement() : new InnateMovement(wiring);
    this.forecaster = this.abilities.forecast ? new Forecaster() : null;

    this.x = SIZE / 2;
    this.y = SIZE / 2;
    this.energy = START_ENERGY;
    this.sleeping = 0;
    /** @type {Activity} */
    this.activity = 'exploring';
    /** @type {import('./planner.js').Plan | null} */
    this.plan = null;
    /** @type {Food | null} */
    this.target = null;
    /** Button it keeps pressing while exploring. */
    this.heading = 0;
  }

  /**
   * How much the creature wants a food right now. On top of what its mind
   * expects, a hungry creature is drawn to foods it has not eaten for a
   * while. Without that, a creature whose beliefs have gone wrong can starve
   * next to good food it never tries again.
   * @param {Food} food
   */
  appeal(food) {
    const hunger = Math.max(0, 1 - this.energy / HUNGRY);
    return (
      this.mind.appeal(food.colour, food.shape) +
      hunger * HUNGER_CURIOSITY * this.mind.staleness(food.colour, food.shape)
    );
  }

  /**
   * Whether the creature refuses to step on a food.
   * @param {Food} food
   */
  avoids(food) {
    return this.mind.predict(food.colour, food.shape) < 0 && this.appeal(food) < TARGET_THRESHOLD;
  }

  /**
   * One step of life.
   * @param {World} world
   */
  act(world) {
    const { abilities, mind } = this;
    const t = world.t;

    if (this.sleeping > 0) {
      this.sleeping--;
      this.energy -= SLEEP_COST;
      this.activity = 'sleeping';
      return;
    }
    if (abilities.memory && t > 0 && t % SLEEP_EVERY === 0) {
      this.sleeping = SLEEP_LENGTH;
      this.activity = 'sleeping';
      this.plan = null;
      const merged = mind.sleep();
      world.log('sleep', merged ? `Slept and merged ${merged} duplicate memories.` : 'Slept.');
      return;
    }

    let distanceCost = DISTANCE_COST;
    if (this.forecaster) {
      const visible = world.visibleFood(this);
      const forecast = this.forecaster.sense(t, visible.length);
      const worthEating = visible.some((food) => mind.predict(food.colour, food.shape) > 1);
      if (forecast.now >= 0 && forecast.now < FAMINE && !worthEating) {
        // Famine now and nothing worth the walk: wait it out cheaply.
        this.energy -= HIBERNATE_COST;
        this.activity = 'hibernating';
        this.plan = null;
        this.target = null;
        world.stats.hibernatedSteps++;
        return;
      }
      if (forecast.soon >= 0 && forecast.soon < FAMINE) distanceCost = STOCK_UP_DISTANCE_COST;
    }

    this.energy -= METABOLISM;
    const untried = this.model.untriedButton();
    if (untried >= 0) {
      this.plan = null;
      this.target = null;
      this.activity = 'trying buttons';
      this.press(world, untried);
    } else if (abilities.planner) {
      this.followPlan(world, distanceCost);
    } else {
      this.stepTowardsFood(world, distanceCost);
    }

    const food = world.foodAt(this.x, this.y);
    if (food) world.eat(food);
  }

  /**
   * Press a button and learn from where it landed.
   * @param {World} world
   * @param {number} button
   * @returns {number} The cell the creature is on afterwards.
   */
  press(world, button) {
    const fromX = this.x;
    const fromY = this.y;
    const expected = this.model.landing(world, fromX, fromY, button);
    const cell = world.move(button);
    if (expected >= 0 && expected !== cell) world.countMoveSurprise();
    this.model.learn(world, fromX, fromY, button, this.x, this.y);
    return cell;
  }

  /**
   * @param {World} world
   * @param {number} distanceCost
   */
  followPlan(world, distanceCost) {
    const stale =
      !this.plan ||
      this.plan.buttons.length === 0 ||
      !world.hasFood(this.plan.target) ||
      world.t % REPLAN_EVERY === 0;
    if (stale) this.plan = planRoute(world, this, distanceCost);
    if (!this.plan) {
      this.target = null;
      this.wander(world);
      return;
    }
    this.target = this.plan.target;
    this.activity = 'following a plan';
    const button = /** @type {number} */ (this.plan.buttons.shift());
    const expected = this.plan.cells.shift();
    // A move that did not land where imagined means the plan is wrong.
    if (this.press(world, button) !== expected) this.plan = null;
  }

  /**
   * The planless way to forage: pick the most appealing food in sight and
   * press whichever button is believed to bring it closer.
   * @param {World} world
   * @param {number} distanceCost
   */
  stepTowardsFood(world, distanceCost) {
    /** @param {Food} food */
    const distanceTo = (food) => Math.abs(food.x - this.x) + Math.abs(food.y - this.y);

    if (!this.target || !world.hasFood(this.target) || world.t % REPLAN_EVERY === 0) {
      this.target = null;
      let bestScore = TARGET_THRESHOLD;
      for (const food of world.visibleFood(this)) {
        const score = this.appeal(food) - distanceCost * distanceTo(food);
        if (score > bestScore) {
          bestScore = score;
          this.target = food;
        }
      }
    }
    const target = this.target;
    if (!target) {
      this.wander(world);
      return;
    }

    let bestButton = -1;
    let bestDistance = distanceTo(target);
    for (let button = 0; button < 4; button++) {
      const cell = this.model.landing(world, this.x, this.y, button);
      if (cell < 0) continue;
      const x = cell % SIZE;
      const distance = Math.abs(target.x - x) + Math.abs(target.y - (cell - x) / SIZE);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestButton = button;
      }
    }
    if (bestButton < 0) {
      this.wander(world);
      return;
    }
    this.activity = 'heading for food';
    this.press(world, bestButton);
  }

  /**
   * Explore: keep going the same way, turning now and then, and turning away
   * from anything believed to block. A planner also steers around food it
   * believes is bad.
   * @param {World} world
   */
  wander(world) {
    this.activity = 'exploring';
    if (world.rng() < 0.2) this.heading = randomInt(world.rng, 4);
    const here = cellOf(this.x, this.y);
    for (let turn = 0; turn < 4; turn++) {
      const button = (this.heading + turn) % 4;
      const cell = this.model.landing(world, this.x, this.y, button);
      if (cell < 0 || cell === here) continue;
      const food = world.foodAtCell(cell);
      if (this.abilities.planner && food && this.avoids(food)) continue;
      this.heading = button;
      this.press(world, button);
      return;
    }
    this.press(world, this.heading);
  }
}
