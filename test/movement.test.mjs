import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLOOR, ICE, WALL, cellOf, inside } from '../src/core/constants.js';
import { InnateMovement, LearnedMovement, resolveMove } from '../src/core/movement.js';

/**
 * A ground made of floor except where listed.
 * @param {Record<string, number>} [special] Ground by "x,y".
 */
function groundWith(special = {}) {
  return {
    /** @param {number} x @param {number} y */
    groundAt: (x, y) => (inside(x, y) ? (special[`${x},${y}`] ?? FLOOR) : WALL),
  };
}

const EAST = 0;
const SOUTH = 1;
const WEST = 2;
const NORTH = 3;

test('a move over floor goes one cell', () => {
  assert.equal(resolveMove(groundWith(), 5, 5, EAST), cellOf(6, 5));
  assert.equal(resolveMove(groundWith(), 5, 5, SOUTH), cellOf(5, 6));
  assert.equal(resolveMove(groundWith(), 5, 5, WEST), cellOf(4, 5));
  assert.equal(resolveMove(groundWith(), 5, 5, NORTH), cellOf(5, 4));
});

test('walls and the edge of the world block', () => {
  assert.equal(resolveMove(groundWith({ '6,5': WALL }), 5, 5, EAST), cellOf(5, 5));
  assert.equal(resolveMove(groundWith(), 0, 0, WEST), cellOf(0, 0));
  assert.equal(resolveMove(groundWith(), 0, 0, NORTH), cellOf(0, 0));
});

test('ice slides one extra cell unless something blocks the slide', () => {
  assert.equal(resolveMove(groundWith({ '6,5': ICE }), 5, 5, EAST), cellOf(7, 5));
  assert.equal(resolveMove(groundWith({ '6,5': ICE, '7,5': WALL }), 5, 5, EAST), cellOf(6, 5));
});

test('the innate model predicts with the wiring it was born with', () => {
  const model = new InnateMovement([SOUTH, EAST, NORTH, WEST]);
  assert.equal(model.landing(groundWith(), 5, 5, 0), cellOf(5, 6));
  assert.equal(model.untriedButton(), -1);
  assert.equal(model.direction(2), NORTH);
});

/**
 * Press every button from open floor and let the model learn the result.
 * @param {LearnedMovement} model
 * @param {number[]} wiring
 * @param {number} rounds
 */
function practise(model, wiring, rounds) {
  const ground = groundWith();
  for (let round = 0; round < rounds; round++) {
    wiring.forEach((direction, button) => {
      const cell = resolveMove(ground, 10, 10, direction);
      model.learn(ground, 10, 10, button, cell % 24, Math.floor(cell / 24));
    });
  }
}

test('the learned model starts knowing nothing', () => {
  const model = new LearnedMovement();
  assert.equal(model.untriedButton(), 0);
  assert.equal(model.landing(groundWith(), 5, 5, 0), -1);
});

test('one press per button is enough to learn the wiring on open floor', () => {
  const wiring = [NORTH, WEST, SOUTH, EAST];
  const model = new LearnedMovement();
  practise(model, wiring, 1);
  assert.equal(model.untriedButton(), -1);
  assert.deepEqual(
    wiring.map((_, button) => model.direction(button)),
    wiring,
  );
});

test('the learned model relearns after a rewiring', () => {
  const model = new LearnedMovement();
  practise(model, [EAST, SOUTH, WEST, NORTH], 30);
  const rewired = [SOUTH, WEST, NORTH, EAST];
  practise(model, rewired, 6);
  assert.deepEqual(
    rewired.map((_, button) => model.direction(button)),
    rewired,
  );
});

test('the learned model discovers that walls block and ice slides', () => {
  const ground = groundWith({ '6,5': WALL, '5,6': ICE });
  const model = new LearnedMovement();
  practise(model, [EAST, SOUTH, WEST, NORTH], 1);
  // Before meeting them, unknown ground is assumed walkable.
  assert.equal(model.landing(ground, 5, 5, 0), cellOf(6, 5));

  model.learn(ground, 5, 5, 0, 5, 5);
  assert.equal(model.landing(ground, 5, 5, 0), cellOf(5, 5));

  model.learn(ground, 5, 5, 1, 5, 7);
  assert.equal(model.landing(ground, 5, 5, 1), cellOf(5, 7));
});
