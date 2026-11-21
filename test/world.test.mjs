import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOOD_COUNT,
  MAX_ENERGY,
  METABOLISM,
  RESPAWN_ENERGY,
  SIZE,
  START_ENERGY,
  WALL,
  cellOf,
} from '../src/core/constants.js';
import { DEADLY_VALUE, SEASONS, SEASON_LENGTH, foodValue } from '../src/core/foods.js';
import { WINTER_START } from '../src/core/weather.js';
import { World } from '../src/core/world.js';

/**
 * Replace all food with the given items.
 * @param {World} world
 * @param {import('../src/core/world.js').Food[]} items
 */
function setFood(world, items) {
  world.food.clear();
  for (const food of items) world.food.set(cellOf(food.x, food.y), food);
}

/** A world whose food never rots, so a test controls exactly what is there. */
function quietWorld(options = {}, abilities = {}) {
  const world = new World(1, options, abilities);
  const rolls = [0.99, 0.5];
  let i = 0;
  // Rolls alternate "no rot" and a mid value for anything else.
  world.rng = () => rolls[i++ % rolls.length];
  return world;
}

test('a new world has a full larder and a creature in the middle', () => {
  const world = new World(5);
  assert.equal(world.food.size, FOOD_COUNT);
  assert.equal(world.creature.x, SIZE / 2);
  assert.equal(world.creature.y, SIZE / 2);
  assert.equal(world.creature.energy, START_ENERGY);
  assert.equal(world.t, 0);
});

test('food never grows on a wall and the start area is clear', () => {
  const world = new World(11, { walls: 0.3, ice: 0.2 });
  for (const food of world.food.values()) {
    assert.notEqual(world.groundAt(food.x, food.y), WALL);
  }
  for (let y = 11; y <= 13; y++) {
    for (let x = 11; x <= 13; x++) assert.equal(world.groundAt(x, y), 0);
  }
  assert.equal(world.groundAt(-1, 0), WALL);
  assert.equal(world.groundAt(0, SIZE), WALL);
});

test('every variant of a seed starts in the same world', () => {
  const a = new World(21, { walls: 0.1, ice: 0.12, scrambled: true }, {});
  const b = new World(
    21,
    { walls: 0.1, ice: 0.12, scrambled: true },
    { memory: true, planner: true },
  );
  assert.deepEqual(a.ground, b.ground);
  assert.deepEqual(a.wiring, b.wiring);
  assert.deepEqual([...a.food.entries()], [...b.food.entries()]);
});

test('a waking step costs the metabolic rate', () => {
  const world = quietWorld();
  setFood(world, []);
  world.step();
  assert.ok(Math.abs(world.creature.energy - (START_ENERGY - METABOLISM)) < 1e-9);
  assert.equal(world.t, 1);
  assert.equal(world.stats.steps, 1);
});

test('eating adds the food value, within noise, and regrows the food elsewhere', () => {
  const world = quietWorld();
  const { creature } = world;
  creature.energy = 50;
  setFood(world, [{ x: creature.x + 1, y: creature.y, colour: 0, shape: 0 }]);
  const expected = foodValue(SEASONS[0], 0, 0);
  for (let i = 0; i < 3 && world.stats.goodMeals === 0; i++) world.step();
  assert.equal(world.stats.goodMeals, 1);
  const gained = creature.energy - 50 + METABOLISM * world.stats.steps;
  assert.ok(Math.abs(gained - expected) <= 1, `gained ${gained}`);
  assert.equal(world.food.size, 1);
  assert.equal(world.foodAt(SIZE / 2 + 1, SIZE / 2), undefined);
});

test('a bad meal costs energy and is counted as bad', () => {
  const world = quietWorld();
  const { creature } = world;
  const before = creature.energy;
  world.eat({ x: 0, y: 0, colour: 1, shape: 1 });
  assert.ok(creature.energy < before);
  assert.equal(world.stats.badMeals, 1);
  assert.equal(world.stats.goodMeals, 0);
});

test('energy never goes above the maximum', () => {
  const world = quietWorld();
  world.creature.energy = MAX_ENERGY - 1;
  world.eat({ x: 0, y: 0, colour: 0, shape: 0 });
  assert.equal(world.creature.energy, MAX_ENERGY);
});

test('a creature that runs out of energy dies, is counted, and comes back', () => {
  const world = quietWorld({ walls: 0.1 });
  setFood(world, []);
  const { creature } = world;
  creature.energy = METABOLISM / 2;
  const mind = creature.mind;
  world.step();
  assert.equal(world.stats.deaths, 1);
  assert.equal(creature.energy, RESPAWN_ENERGY);
  assert.notEqual(world.groundAt(creature.x, creature.y), WALL);
  assert.equal(creature.mind, mind, 'memories survive death');
  assert.equal(world.events.at(-1)?.kind, 'death');
});

test('a creature starves in about energy / metabolism steps without food', () => {
  const world = new World(3);
  world.growFood = () => {};
  setFood(world, []);
  let steps = 0;
  while (world.stats.deaths === 0) {
    world.step();
    steps++;
    assert.ok(steps < 2000);
  }
  assert.equal(steps, Math.ceil(START_ENERGY / METABOLISM));
});

test('the season changes on schedule and changes what food is worth', () => {
  const world = new World(2);
  world.t = SEASON_LENGTH;
  world.step();
  assert.equal(world.seasonIndex, 1);
  assert.equal(world.events.find((e) => e.kind === 'season')?.t, SEASON_LENGTH);
  const before = world.creature.energy;
  world.eat({ x: 0, y: 0, colour: 1, shape: 0 });
  assert.ok(world.creature.energy > before, 'blue circle feeds in the blue season');
});

test('a deadly food costs most of a full store of energy', () => {
  const world = quietWorld({ deadly: true });
  world.creature.energy = MAX_ENERGY;
  const [colour, shape] = SEASONS[0].deadly;
  world.eat({ x: 0, y: 0, colour, shape });
  assert.ok(Math.abs(world.creature.energy - (MAX_ENERGY + DEADLY_VALUE)) <= 1);
  assert.equal(world.stats.deadlyMeals, 1);
  assert.equal(world.stats.deadlyDeaths, 0);
});

test('the same food is harmless where deadly food is switched off', () => {
  const world = quietWorld();
  world.creature.energy = 50;
  const [colour, shape] = SEASONS[0].deadly;
  world.eat({ x: 0, y: 0, colour, shape });
  assert.ok(world.creature.energy > 50);
  assert.equal(world.stats.deadlyMeals, 0);
});

test('nothing grows in winter', () => {
  const world = new World(4, { winters: true });
  world.t = WINTER_START;
  assert.equal(world.winter, true);
  for (let i = 0; i < 300; i++) {
    const before = world.food.size;
    world.creature.energy = MAX_ENERGY;
    world.step();
    assert.ok(world.food.size <= before);
  }
  assert.ok(world.food.size < FOOD_COUNT / 2);
});

test('food grows back after winter', () => {
  const world = new World(4, { winters: true });
  setFood(world, []);
  for (let i = 0; i < 200; i++) world.step();
  assert.ok(world.food.size > FOOD_COUNT / 2);
});

test('a rewiring turns every button a quarter turn', () => {
  const world = new World(6, { scrambled: true, rewireEvery: 10 });
  const before = world.wiring.slice();
  for (let i = 0; i <= 10; i++) world.step();
  assert.deepEqual(
    world.wiring,
    before.map((direction) => (direction + 1) % 4),
  );
  assert.equal(world.rewirings, 1);
});

test('the event log is bounded', () => {
  const world = new World(1);
  for (let i = 0; i < 500; i++) world.log('test', 'x');
  assert.ok(world.events.length <= 60);
});
