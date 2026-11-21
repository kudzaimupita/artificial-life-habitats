// An experiment: the two variants of a habitat, each alone in its own copy of
// the same seeded world, stepped in lockstep.

import { getHabitat } from './habitats.js';
import { World } from './world.js';

/** Default length of a headless run: ten seasons, five years, two wirings. */
export const DEFAULT_STEPS = 12000;

/**
 * @typedef {object} Summary
 * @property {number} steps
 * @property {number} deaths
 * @property {number} energy Average energy over the run.
 * @property {number} goodMeals Share of meals that gave energy, 0 to 1.
 * @property {number} badMeals Count of meals that cost energy.
 * @property {number} surpriseNew Mean prediction error over the first meals of a new season.
 * @property {number} surpriseReturning The same for a season met before.
 * @property {number} memories Season memories held at the end.
 * @property {number} deathsBeforeRewire
 * @property {number} deathsAfterRewire
 * @property {number} energyBeforeRewire
 * @property {number} energyAfterRewire
 * @property {number} moveSurprisesAfterRewire
 * @property {number} winterDeaths
 * @property {number} hibernated Steps spent hibernating.
 * @property {number} deadlyMeals
 * @property {number} deadlyDeaths
 */

/**
 * @param {number} sum
 * @param {number} count
 * @returns {number} The mean, or NaN when there is nothing to average.
 */
const mean = (sum, count) => (count > 0 ? sum / count : NaN);

/**
 * @param {World} world
 * @returns {Summary}
 */
export function summarise(world) {
  const s = world.stats;
  const stepsBefore = s.steps - s.stepsAfterRewire;
  return {
    steps: s.steps,
    deaths: s.deaths,
    energy: mean(s.energySum, s.steps),
    goodMeals: mean(s.goodMeals, s.goodMeals + s.badMeals),
    badMeals: s.badMeals,
    surpriseNew: mean(s.surpriseNewSum, s.surpriseNewMeals),
    surpriseReturning: mean(s.surpriseReturningSum, s.surpriseReturningMeals),
    memories: world.creature.mind.contexts.length,
    deathsBeforeRewire: s.deaths - s.deathsAfterRewire,
    deathsAfterRewire: s.deathsAfterRewire,
    energyBeforeRewire: mean(s.energySum - s.energySumAfterRewire, stepsBefore),
    energyAfterRewire: mean(s.energySumAfterRewire, s.stepsAfterRewire),
    moveSurprisesAfterRewire: s.moveSurprisesAfterRewire,
    winterDeaths: s.winterDeaths,
    hibernated: s.hibernatedSteps,
    deadlyMeals: s.deadlyMeals,
    deadlyDeaths: s.deadlyDeaths,
  };
}

export class Experiment {
  /**
   * @param {string} habitatId
   * @param {number} seed
   */
  constructor(habitatId, seed) {
    this.habitat = getHabitat(habitatId);
    this.seed = seed;
    this.worlds = this.habitat.variants.map(
      (variant) => new World(seed, this.habitat.world, variant.abilities),
    );
  }

  get t() {
    return this.worlds[0].t;
  }

  /** @param {number} [steps] */
  run(steps = 1) {
    for (let i = 0; i < steps; i++) for (const world of this.worlds) world.step();
    return this;
  }

  /** @returns {Summary[]} One summary per variant, baseline first. */
  summaries() {
    return this.worlds.map(summarise);
  }
}

/**
 * Run one habitat on one seed and summarise both variants.
 * @param {string} habitatId
 * @param {number} seed
 * @param {number} [steps]
 * @returns {Summary[]}
 */
export function runExperiment(habitatId, seed, steps = DEFAULT_STEPS) {
  return new Experiment(habitatId, seed).run(steps).summaries();
}
