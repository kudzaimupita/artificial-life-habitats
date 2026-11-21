import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTANCE_COST, SIZE, WALL, cellOf } from '../src/core/constants.js';
import { planRoute } from '../src/core/planner.js';
import { World } from '../src/core/world.js';

/**
 * An empty world with a planner at (12, 12) that already likes amber circles
 * and dislikes blue squares.
 */
function setUp() {
  const world = new World(1, {}, { planner: true });
  world.food.clear();
  const { mind } = world.creature;
  for (let i = 0; i < 40; i++) {
    mind.observe(0, 0, 8);
    mind.observe(1, 1, -8);
  }
  return world;
}

/**
 * @param {World} world
 * @param {number} x
 * @param {number} y
 * @param {number} colour
 * @param {number} shape
 */
function put(world, x, y, colour, shape) {
  const food = { x, y, colour, shape };
  world.food.set(cellOf(x, y), food);
  return food;
}

test('there is no plan when nothing is in sight', () => {
  const world = setUp();
  assert.equal(planRoute(world, world.creature, DISTANCE_COST), null);
  put(world, 0, 0, 0, 0);
  assert.equal(planRoute(world, world.creature, DISTANCE_COST), null, 'too far to see');
});

test('a plan is the shortest route to good food', () => {
  const world = setUp();
  const food = put(world, 15, 12, 0, 0);
  const plan = planRoute(world, world.creature, DISTANCE_COST);
  assert.ok(plan);
  assert.equal(plan.target, food);
  assert.deepEqual(plan.buttons, [0, 0, 0]);
  assert.deepEqual(plan.cells, [cellOf(13, 12), cellOf(14, 12), cellOf(15, 12)]);
});

test('food believed to be bad is never a target', () => {
  const world = setUp();
  put(world, 13, 12, 1, 1);
  assert.equal(planRoute(world, world.creature, DISTANCE_COST), null);
});

test('a route bends around walls', () => {
  const world = setUp();
  const food = put(world, 14, 12, 0, 0);
  for (let y = 10; y <= 14; y++) world.ground[cellOf(13, y)] = WALL;
  const plan = planRoute(world, world.creature, DISTANCE_COST);
  assert.ok(plan);
  assert.equal(plan.target, food);
  assert.ok(plan.buttons.length > 2);
  for (const cell of plan.cells) assert.notEqual(world.ground[cell], WALL);
});

test('a route bends around food believed to be bad', () => {
  const world = setUp();
  put(world, 13, 12, 1, 1);
  const food = put(world, 14, 12, 0, 0);
  const plan = planRoute(world, world.creature, DISTANCE_COST);
  assert.ok(plan);
  assert.equal(plan.target, food);
  assert.equal(plan.buttons.length, 4);
  assert.ok(!plan.cells.includes(cellOf(13, 12)));
});

test('nearer food wins over equally good food further away', () => {
  const world = setUp();
  put(world, 17, 12, 0, 0);
  const near = put(world, 12, 10, 0, 0);
  assert.equal(planRoute(world, world.creature, DISTANCE_COST)?.target, near);
});

test('following a plan step by step reaches and eats the food', () => {
  const world = setUp();
  world.growFood = () => {};
  world.rng = () => 0.99; // no rot
  put(world, 15, 14, 0, 0);
  for (let i = 0; i < 5; i++) world.step();
  assert.equal(world.stats.goodMeals, 1);
  assert.equal(world.creature.x, 15);
  assert.equal(world.creature.y, 14);
});

test('a hungry creature will try food it has not checked for a long time', () => {
  const world = setUp();
  const { creature } = world;
  const stale = put(world, 13, 12, 2, 1);
  // Believed slightly bad and not eaten for many meals.
  for (let i = 0; i < 20; i++) creature.mind.observe(2, 1, -2);
  for (let i = 0; i < 30; i++) creature.mind.observe(0, 0, 8);
  assert.ok(creature.avoids(stale));
  creature.energy = 5;
  assert.ok(!creature.avoids(stale));
  assert.equal(planRoute(world, creature, DISTANCE_COST)?.target, stale);
});

test('plans stay inside the grid', () => {
  const world = setUp();
  world.creature.x = 0;
  world.creature.y = 0;
  put(world, 3, 0, 0, 0);
  const plan = planRoute(world, world.creature, DISTANCE_COST);
  assert.ok(plan);
  for (const cell of plan.cells) assert.ok(cell >= 0 && cell < SIZE * SIZE);
});
