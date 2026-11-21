// The habitats: each pairs one world with two creatures that differ in a
// single ability, so any gap between them can be put down to that ability.

/**
 * @typedef {object} Variant
 * @property {string} id
 * @property {string} label
 * @property {string} blurb One line on what this creature can do.
 * @property {import('./creature.js').Abilities} abilities
 */

/**
 * @typedef {object} Habitat
 * @property {string} id
 * @property {string} title
 * @property {string} question What the experiment asks.
 * @property {import('./world.js').WorldOptions} world
 * @property {[Variant, Variant]} variants Baseline first.
 * @property {string[]} metrics Metric ids reported by the harness, in order.
 */

/** Steps between rewirings in the movement habitat. */
export const REWIRE_EVERY = 6000;

/** @type {Habitat[]} */
export const HABITATS = [
  {
    id: 'seasons',
    title: 'Seasons and memory',
    question: 'Does remembering past seasons beat relearning them every time?',
    world: {},
    variants: [
      {
        id: 'simple',
        label: 'Simple',
        blurb: 'One set of beliefs, updated a little after every meal.',
        abilities: {},
      },
      {
        id: 'memory',
        label: 'Memory',
        blurb: 'Holds surprises aside, keeps a memory per season, recalls it, and sleeps.',
        abilities: { memory: true },
      },
    ],
    metrics: ['deaths', 'energy', 'goodMeals', 'surpriseNew', 'surpriseReturning', 'memories'],
  },
  {
    id: 'planning',
    title: 'Planning a route',
    question: 'Does imagining a route beat walking straight at food?',
    world: { walls: 0.1 },
    variants: [
      {
        id: 'greedy',
        label: 'Greedy',
        blurb: 'Steps straight towards the food it wants most.',
        abilities: { memory: true },
      },
      {
        id: 'planner',
        label: 'Planner',
        blurb: 'Searches for a route around walls and around food it believes is bad.',
        abilities: { memory: true, planner: true },
      },
    ],
    metrics: ['deaths', 'energy', 'goodMeals', 'badMeals'],
  },
  {
    id: 'movement',
    title: 'Learning to move',
    question: 'What happens to a planner when its own body stops working as it expects?',
    world: { walls: 0.1, ice: 0.12, scrambled: true, rewireEvery: REWIRE_EVERY },
    variants: [
      {
        id: 'innate',
        label: 'Born knowing',
        blurb: 'Knows its buttons and the ground from birth, and never revises that.',
        abilities: { memory: true, planner: true },
      },
      {
        id: 'learner',
        label: 'Learns movement',
        blurb: 'Starts knowing nothing about its buttons and keeps learning them.',
        abilities: { memory: true, planner: true, learnsMovement: true },
      },
    ],
    metrics: [
      'deathsBeforeRewire',
      'deathsAfterRewire',
      'energyBeforeRewire',
      'energyAfterRewire',
      'moveSurprisesAfterRewire',
    ],
  },
  {
    id: 'winter',
    title: 'Planning for winter',
    question: 'Can a creature learn that cold means famine, and sit it out?',
    world: { winters: true },
    variants: [
      {
        id: 'unprepared',
        label: 'Unprepared',
        blurb: 'Plans routes to food, but keeps searching all winter.',
        abilities: { memory: true, planner: true },
      },
      {
        id: 'forecaster',
        label: 'Winter planner',
        blurb: 'Learns what each temperature means for food, stocks up, and hibernates.',
        abilities: { memory: true, planner: true, forecast: true },
      },
    ],
    metrics: ['deaths', 'winterDeaths', 'energy', 'hibernated'],
  },
  {
    id: 'danger',
    title: 'One-trial danger memory',
    question: 'What should a creature do with a meal that nearly kills it?',
    world: { deadly: true },
    variants: [
      {
        id: 'gradual',
        label: 'Gradual learner',
        blurb: 'Treats a near-fatal meal like any other surprising meal.',
        abilities: { memory: true, planner: true },
      },
      {
        id: 'wary',
        label: 'Danger memory',
        blurb: 'Remembers the exact food that nearly killed it, after one meal.',
        abilities: { memory: true, planner: true, dangerMemory: true },
      },
    ],
    metrics: ['deaths', 'deadlyMeals', 'deadlyDeaths', 'energy', 'goodMeals'],
  },
];

/**
 * @param {string} id
 * @returns {Habitat}
 */
export function getHabitat(id) {
  const habitat = HABITATS.find((h) => h.id === id);
  if (!habitat) {
    const known = HABITATS.map((h) => h.id).join(', ');
    throw new Error(`Unknown habitat "${id}". Known habitats: ${known}`);
  }
  return habitat;
}
