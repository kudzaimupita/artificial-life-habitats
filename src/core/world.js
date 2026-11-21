// The world: a grid with ground and food, one creature living in it, and the
// rules that decide what happens when the creature presses a button or eats.

import {
  DIRECTIONS,
  FLOOR,
  FOOD_COUNT,
  ICE,
  MAX_ENERGY,
  REGROW_CHANCE,
  RESPAWN_ENERGY,
  ROT_CHANCE,
  SIGHT,
  SIZE,
  WALL,
  cellOf,
  inside,
} from './constants.js';
import { Creature } from './creature.js';
import {
  COLOURS,
  DEADLY_VALUE,
  SEASONS,
  SEASON_LENGTH,
  SHAPES,
  foodName,
  foodValue,
  isDeadly,
  seasonIndexAt,
} from './foods.js';
import { BIG_SURPRISE } from './mind.js';
import { resolveMove } from './movement.js';
import { makeRng, randomInt, shuffle } from './rng.js';
import { isWinter } from './weather.js';

/** Meals after a season change over which adaptation is measured. */
const ADAPTATION_MEALS = 15;
const EVENTS_KEPT = 60;

/**
 * @typedef {object} Food
 * @property {number} x
 * @property {number} y
 * @property {number} colour
 * @property {number} shape
 */

/**
 * @typedef {object} WorldOptions
 * @property {number} [walls] Share of cells that are walls.
 * @property {number} [ice] Share of cells that are ice.
 * @property {boolean} [scrambled] Wire the four buttons in a random order.
 * @property {number} [rewireEvery] Turn the wiring a quarter turn this often (0 = never).
 * @property {boolean} [winters] Stop all growth for the last part of each year.
 * @property {boolean} [deadly] Make one food per season nearly lethal.
 */

/**
 * @typedef {object} WorldEvent
 * @property {number} t
 * @property {string} kind
 * @property {string} text
 */

function newStats() {
  return {
    steps: 0,
    energySum: 0,
    deaths: 0,
    goodMeals: 0,
    badMeals: 0,
    // Prediction error over the first meals after a season change, split by
    // whether the season was new to the creature or one coming back.
    surpriseNewSum: 0,
    surpriseNewMeals: 0,
    surpriseReturningSum: 0,
    surpriseReturningMeals: 0,
    // Movement habitat: everything counted again from the first rewiring on.
    moveSurprises: 0,
    stepsAfterRewire: 0,
    energySumAfterRewire: 0,
    deathsAfterRewire: 0,
    moveSurprisesAfterRewire: 0,
    // Winter habitat.
    winterDeaths: 0,
    hibernatedSteps: 0,
    // Deadly food habitat.
    deadlyMeals: 0,
    deadlyDeaths: 0,
  };
}

/** @typedef {ReturnType<typeof newStats>} Stats */

export class World {
  /**
   * @param {number} seed
   * @param {WorldOptions} [options]
   * @param {import('./creature.js').Abilities} [abilities]
   */
  constructor(seed, options = {}, abilities = {}) {
    /** @type {Required<WorldOptions>} */
    this.options = {
      walls: 0,
      ice: 0,
      scrambled: false,
      rewireEvery: 0,
      winters: false,
      deadly: false,
      ...options,
    };
    this.seed = seed;
    this.rng = makeRng(seed);
    this.t = 0;
    this.stats = newStats();
    /** @type {WorldEvent[]} */
    this.events = [];

    // Ground, wiring and the first food all come from the start of the
    // random stream and do not depend on the creature, so every variant run
    // on the same seed starts in the same world.
    this.ground = new Uint8Array(SIZE * SIZE);
    for (let cell = 0; cell < this.ground.length; cell++) {
      const roll = this.rng();
      if (roll < this.options.walls) this.ground[cell] = WALL;
      else if (roll < this.options.walls + this.options.ice) this.ground[cell] = ICE;
    }
    const centre = SIZE / 2;
    for (let y = centre - 1; y <= centre + 1; y++) {
      for (let x = centre - 1; x <= centre + 1; x++) this.ground[cellOf(x, y)] = FLOOR;
    }

    /** Direction index each button is wired to right now. */
    this.wiring = [0, 1, 2, 3];
    if (this.options.scrambled) shuffle(this.rng, this.wiring);
    this.rewirings = 0;

    this.creature = new Creature(abilities, this.wiring);

    /** @type {Map<number, Food>} Food by cell index. */
    this.food = new Map();
    for (let i = 0; i < FOOD_COUNT; i++) this.growFood();

    this.seasonIndex = 0;
    /** @type {Set<number>} */
    this.seasonsMet = new Set([0]);
    this.mealsSinceChange = ADAPTATION_MEALS;
    this.returningSeason = false;
  }

  get season() {
    return SEASONS[this.seasonIndex];
  }

  get winter() {
    return this.options.winters && isWinter(this.t);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Ground code; everything outside the grid is wall.
   */
  groundAt(x, y) {
    return inside(x, y) ? this.ground[cellOf(x, y)] : WALL;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Food | undefined}
   */
  foodAt(x, y) {
    return this.food.get(cellOf(x, y));
  }

  /**
   * @param {number} cell
   * @returns {Food | undefined}
   */
  foodAtCell(cell) {
    return this.food.get(cell);
  }

  /** @param {Food} food */
  hasFood(food) {
    return this.food.get(cellOf(food.x, food.y)) === food;
  }

  /**
   * @param {{ x: number, y: number }} from
   * @param {Food} food
   */
  sees(from, food) {
    return Math.abs(food.x - from.x) <= SIGHT && Math.abs(food.y - from.y) <= SIGHT;
  }

  /**
   * @param {{ x: number, y: number }} from
   * @returns {Food[]}
   */
  visibleFood(from) {
    const visible = [];
    for (const food of this.food.values()) if (this.sees(from, food)) visible.push(food);
    return visible;
  }

  /** Put one new food on a free floor or ice cell. */
  growFood() {
    const creature = this.creature;
    let x, y;
    do {
      x = randomInt(this.rng, SIZE);
      y = randomInt(this.rng, SIZE);
    } while (
      this.groundAt(x, y) === WALL ||
      this.food.has(cellOf(x, y)) ||
      (x === creature.x && y === creature.y)
    );
    const colour = randomInt(this.rng, COLOURS.length);
    const shape = randomInt(this.rng, SHAPES.length);
    this.food.set(cellOf(x, y), { x, y, colour, shape });
  }

  /**
   * Apply a button press to the creature with the real wiring and ground.
   * @param {number} button
   * @returns {number} The cell the creature ends up on.
   */
  move(button) {
    const creature = this.creature;
    const cell = resolveMove(this, creature.x, creature.y, this.wiring[button]);
    creature.x = cell % SIZE;
    creature.y = (cell - creature.x) / SIZE;
    return cell;
  }

  countMoveSurprise() {
    this.stats.moveSurprises++;
    if (this.rewirings > 0) this.stats.moveSurprisesAfterRewire++;
  }

  /**
   * The creature eats the food it is standing on.
   * @param {Food} food
   */
  eat(food) {
    const { creature, stats, season } = this;
    const deadly = this.options.deadly && isDeadly(season, food.colour, food.shape);
    const base = deadly ? DEADLY_VALUE : foodValue(season, food.colour, food.shape);
    const value = base + (this.rng() * 2 - 1);
    const seen = creature.mind.observe(food.colour, food.shape, value);
    creature.energy = Math.min(MAX_ENERGY, creature.energy + value);

    if (value > 0) stats.goodMeals++;
    else stats.badMeals++;
    if (deadly) {
      stats.deadlyMeals++;
      if (creature.energy <= 0) stats.deadlyDeaths++;
    }
    if (this.mealsSinceChange < ADAPTATION_MEALS) {
      this.mealsSinceChange++;
      if (this.returningSeason) {
        stats.surpriseReturningSum += seen.surprise;
        stats.surpriseReturningMeals++;
      } else {
        stats.surpriseNewSum += seen.surprise;
        stats.surpriseNewMeals++;
      }
    }

    const name = foodName(food.colour, food.shape);
    if (deadly) {
      this.log('deadly', `Ate a deadly ${name}.`);
    } else if (seen.surprise > BIG_SURPRISE) {
      const sign = (/** @type {number} */ v) => (v > 0 ? '+' : '') + v.toFixed(1);
      this.log('surprise', `Expected ${sign(seen.predicted)} from ${name}, got ${sign(value)}.`);
    }
    for (const event of seen.events) this.log(event.kind, event.text);

    this.food.delete(cellOf(food.x, food.y));
    if (!this.winter) this.growFood();
  }

  /**
   * @param {string} kind
   * @param {string} text
   */
  log(kind, text) {
    this.events.push({ t: this.t, kind, text });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
  }

  /** Advance the world by one step. */
  step() {
    const { creature, stats, options } = this;
    const t = this.t;

    if (t > 0 && t % SEASON_LENGTH === 0) {
      this.seasonIndex = seasonIndexAt(t);
      this.returningSeason = this.seasonsMet.has(this.seasonIndex);
      this.seasonsMet.add(this.seasonIndex);
      this.mealsSinceChange = 0;
      this.log('season', `The ${this.season.name} began.`);
    }
    if (options.rewireEvery > 0 && t > 0 && t % options.rewireEvery === 0) {
      this.wiring = this.wiring.map((direction) => (direction + 1) % DIRECTIONS.length);
      this.rewirings++;
      this.log('rewire', 'The buttons were rewired a quarter turn.');
    }

    stats.steps++;
    stats.energySum += creature.energy;
    if (this.rewirings > 0) {
      stats.stepsAfterRewire++;
      stats.energySumAfterRewire += creature.energy;
    }

    // Food rots and regrows elsewhere, so poison cannot pile up while the
    // good food gets eaten. In winter nothing grows back.
    const winter = this.winter;
    if (this.food.size > 0 && this.rng() < ROT_CHANCE) {
      const cells = [...this.food.keys()];
      this.food.delete(cells[randomInt(this.rng, cells.length)]);
      if (!winter) this.growFood();
    }
    if (!winter && this.food.size < FOOD_COUNT && this.rng() < REGROW_CHANCE) this.growFood();

    creature.act(this);

    if (creature.energy <= 0) {
      stats.deaths++;
      if (winter) stats.winterDeaths++;
      if (this.rewirings > 0) stats.deathsAfterRewire++;
      this.log('death', winter ? 'Starved in winter.' : 'Ran out of energy and died.');
      // It comes back somewhere else with its memories intact, so a run
      // measures how well a mind copes, not how long one body lasts.
      creature.energy = RESPAWN_ENERGY;
      creature.sleeping = 0;
      creature.plan = null;
      creature.target = null;
      do {
        creature.x = randomInt(this.rng, SIZE);
        creature.y = randomInt(this.rng, SIZE);
      } while (this.groundAt(creature.x, creature.y) === WALL);
    }

    this.t = t + 1;
  }
}
