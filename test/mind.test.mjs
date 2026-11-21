import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEASONS, foodValue } from '../src/core/foods.js';
import { DANGER_PREDICTION, Mind } from '../src/core/mind.js';

/**
 * Feed a mind every food of a season, several times over.
 * @param {Mind} mind
 * @param {number} seasonIndex
 * @param {number} rounds
 */
function live(mind, seasonIndex, rounds) {
  const season = SEASONS[seasonIndex];
  /** @type {import('../src/core/mind.js').MindEvent[]} */
  const events = [];
  for (let round = 0; round < rounds; round++) {
    for (let colour = 0; colour < 3; colour++) {
      for (let shape = 0; shape < 2; shape++) {
        const seen = mind.observe(colour, shape, foodValue(season, colour, shape));
        events.push(...seen.events);
      }
    }
  }
  return events;
}

test('a new mind expects nothing and is fully uncertain', () => {
  const mind = new Mind();
  assert.equal(mind.predict(0, 0), 0);
  assert.equal(mind.uncertainty(0, 0), 1);
  assert.equal(mind.staleness(0, 0), 1);
});

test('the simple mind learns the values of a season', () => {
  const mind = new Mind();
  live(mind, 0, 30);
  for (let colour = 0; colour < 3; colour++) {
    for (let shape = 0; shape < 2; shape++) {
      const error = Math.abs(mind.predict(colour, shape) - foodValue(SEASONS[0], colour, shape));
      assert.ok(error < 1, `colour ${colour} shape ${shape} off by ${error}`);
    }
  }
  assert.equal(mind.contexts.length, 1);
});

test('experience lowers uncertainty and resets staleness', () => {
  const mind = new Mind();
  mind.observe(0, 0, 8);
  assert.ok(mind.uncertainty(0, 0) < 1);
  assert.equal(mind.staleness(0, 0), 0);
  assert.equal(mind.staleness(1, 1), 1);
});

test('a bigger surprise moves the memory mind further', () => {
  const small = new Mind({ memory: true });
  const large = new Mind({ memory: true });
  small.observe(0, 0, 1);
  large.observe(0, 0, 4);
  assert.ok(large.predict(0, 0) / 4 > small.predict(0, 0) / 1);
});

test('the memory mind holds one big surprise aside', () => {
  const mind = new Mind({ memory: true });
  live(mind, 0, 10);
  const before = mind.predict(0, 0);
  mind.observe(0, 0, -8);
  assert.equal(mind.predict(0, 0), before);
  assert.equal(mind.pending.length, 1);
  assert.equal(mind.contexts.length, 1);
});

test('two big surprises in a row start a new memory', () => {
  const mind = new Mind({ memory: true });
  live(mind, 0, 10);
  const oldBelief = mind.predict(0, 0);
  const first = mind.observe(0, 0, -4);
  const second = mind.observe(1, 0, 8);
  assert.deepEqual(first.events, []);
  assert.equal(second.events[0].kind, 'new');
  assert.equal(mind.contexts.length, 2);
  assert.equal(mind.active, 1);
  // The old memory is untouched by the meals that revealed the change.
  assert.equal(mind.belief(0, 0, mind.contexts[0]), oldBelief);
});

test('the memory mind recalls a season it has lived through before', () => {
  const mind = new Mind({ memory: true });
  live(mind, 0, 10);
  live(mind, 1, 10);
  const memories = mind.contexts.length;
  const events = live(mind, 0, 2);
  assert.ok(events.some((event) => event.kind === 'recall'));
  assert.equal(mind.contexts.length, memories);
  assert.equal(mind.active, 0);
});

test('the simple mind never keeps more than one memory', () => {
  const mind = new Mind();
  live(mind, 0, 10);
  live(mind, 1, 10);
  live(mind, 2, 10);
  assert.equal(mind.contexts.length, 1);
});

test('sleep merges memories that describe the same season', () => {
  const mind = new Mind({ memory: true });
  live(mind, 0, 10);
  // Force a duplicate: a second memory taught the same season.
  mind.contexts.push(structuredClone(mind.contexts[0]));
  assert.equal(mind.contexts.length, 2);
  assert.equal(mind.sleep(), 1);
  assert.equal(mind.contexts.length, 1);
});

test('sleep keeps memories of different seasons apart', () => {
  const mind = new Mind({ memory: true });
  live(mind, 0, 10);
  live(mind, 1, 10);
  const memories = mind.contexts.length;
  assert.equal(mind.sleep(), 0);
  assert.equal(mind.contexts.length, memories);
});

test('the danger memory stores a near-fatal food after one meal', () => {
  const mind = new Mind({ memory: true, dangerMemory: true });
  live(mind, 0, 10);
  const amberCircle = mind.predict(0, 0);
  const seen = mind.observe(0, 1, -80);
  assert.equal(seen.events[0].kind, 'danger');
  assert.equal(mind.predict(0, 1), DANGER_PREDICTION);
  assert.equal(mind.uncertainty(0, 1), 0);
  assert.equal(mind.staleness(0, 1), 0);
  // Foods that only share a colour or a shape with it are not blamed.
  assert.equal(mind.predict(0, 0), amberCircle);
  assert.equal(mind.pending.length, 0);
});

test('a danger survives a change of season', () => {
  const mind = new Mind({ memory: true, dangerMemory: true });
  live(mind, 0, 10);
  mind.observe(0, 1, -80);
  mind.observe(0, 0, -4);
  mind.observe(1, 0, 8);
  assert.equal(mind.active, 1);
  assert.equal(mind.predict(0, 1), DANGER_PREDICTION);
});

test('a feared food eaten without harm is no longer feared', () => {
  const mind = new Mind({ dangerMemory: true });
  mind.observe(0, 1, -80);
  const seen = mind.observe(0, 1, 4);
  assert.equal(seen.events[0].kind, 'safe');
  assert.ok(!mind.isDangerous(0, 1));
});

test('without the danger memory a near-fatal meal is blamed on colour and shape', () => {
  const mind = new Mind();
  live(mind, 0, 10);
  const amberCircle = mind.predict(0, 0);
  mind.observe(0, 1, -80);
  assert.ok(mind.predict(0, 0) < amberCircle - 3);
});
