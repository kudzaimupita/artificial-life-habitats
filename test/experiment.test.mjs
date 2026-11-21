import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOOD_COUNT, MAX_ENERGY, SIZE, WALL } from '../src/core/constants.js';
import { Experiment, runExperiment } from '../src/core/experiment.js';
import { HABITATS, getHabitat } from '../src/core/habitats.js';

const STEPS = 3000;

/**
 * Everything observable about an experiment, for comparing two runs.
 * @param {Experiment} experiment
 */
function snapshot(experiment) {
  return experiment.worlds.map((world) => ({
    stats: world.stats,
    creature: [world.creature.x, world.creature.y, world.creature.energy],
    food: [...world.food.entries()],
    wiring: world.wiring,
    beliefs: world.creature.mind.contexts,
  }));
}

test('there are five habitats, each with a baseline and one changed ability', () => {
  assert.equal(HABITATS.length, 5);
  assert.equal(new Set(HABITATS.map((h) => h.id)).size, 5);
  for (const habitat of HABITATS) {
    assert.equal(habitat.variants.length, 2);
    const [baseline, other] = habitat.variants;
    const keys = new Set([...Object.keys(baseline.abilities), ...Object.keys(other.abilities)]);
    const changed = [...keys].filter(
      (key) =>
        Boolean(/** @type {Record<string, boolean>} */ (baseline.abilities)[key]) !==
        Boolean(/** @type {Record<string, boolean>} */ (other.abilities)[key]),
    );
    assert.equal(changed.length, 1, `${habitat.id} should differ in exactly one ability`);
  }
});

test('an unknown habitat is an error that names the known ones', () => {
  assert.throws(() => getHabitat('nowhere'), /Unknown habitat "nowhere".*seasons/);
});

for (const habitat of HABITATS) {
  test(`${habitat.id}: the same seed gives the same outcome`, () => {
    const first = snapshot(new Experiment(habitat.id, 7).run(STEPS));
    const second = snapshot(new Experiment(habitat.id, 7).run(STEPS));
    assert.deepEqual(first, second);
  });

  test(`${habitat.id}: a different seed gives a different outcome`, () => {
    const first = snapshot(new Experiment(habitat.id, 7).run(STEPS));
    const second = snapshot(new Experiment(habitat.id, 8).run(STEPS));
    assert.notDeepEqual(first, second);
  });

  test(`${habitat.id}: running in pieces equals running in one go`, () => {
    const whole = new Experiment(habitat.id, 3).run(1000);
    const pieces = new Experiment(habitat.id, 3);
    for (let i = 0; i < 10; i++) pieces.run(100);
    assert.deepEqual(snapshot(whole), snapshot(pieces));
  });

  test(`${habitat.id}: both variants run ${STEPS} steps and the world stays sane`, () => {
    const experiment = new Experiment(habitat.id, 11);
    for (let step = 0; step < STEPS; step++) {
      experiment.run(1);
      for (const world of experiment.worlds) {
        const { creature } = world;
        assert.ok(creature.energy > 0 && creature.energy <= MAX_ENERGY);
        assert.ok(creature.x >= 0 && creature.x < SIZE && creature.y >= 0 && creature.y < SIZE);
        assert.notEqual(world.terrainAt(creature.x, creature.y), WALL);
        assert.ok(world.food.size <= FOOD_COUNT);
      }
    }
    assert.equal(experiment.t, STEPS);
    for (const world of experiment.worlds) {
      for (const food of world.food.values()) {
        assert.notEqual(world.terrainAt(food.x, food.y), WALL);
      }
      assert.ok(world.stats.goodMeals > 0, 'the creature found something to eat');
    }
  });
}

test('summaries are complete and consistent', () => {
  const [baseline, other] = runExperiment('movement', 5, 8000);
  for (const summary of [baseline, other]) {
    assert.equal(summary.steps, 8000);
    assert.equal(summary.deaths, summary.deathsBeforeRewire + summary.deathsAfterRewire);
    assert.ok(summary.energy > 0 && summary.energy <= MAX_ENERGY);
    assert.ok(summary.goodMeals >= 0 && summary.goodMeals <= 1);
    assert.ok(summary.energyBeforeRewire > 0 && summary.energyAfterRewire > 0);
  }
});

test('a run too short to reach the rewiring reports no after-rewiring energy', () => {
  const [summary] = runExperiment('movement', 5, 100);
  assert.ok(Number.isNaN(summary.energyAfterRewire));
  assert.equal(summary.deathsAfterRewire, 0);
});
