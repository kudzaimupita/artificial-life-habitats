import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRng, randomInt, shuffle } from '../src/core/rng.js';

test('the same seed gives the same stream', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test('different seeds give different streams', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean).length;
  assert.equal(same, 0);
});

test('values stay in [0, 1) and are roughly uniform', () => {
  const rng = makeRng(7);
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1);
    sum += value;
  }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
});

test('randomInt stays in range and reaches every value', () => {
  const rng = makeRng(3);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(randomInt(rng, 4));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test('shuffle keeps every item and is deterministic', () => {
  const first = shuffle(makeRng(9), [0, 1, 2, 3, 4, 5]);
  const second = shuffle(makeRng(9), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), [0, 1, 2, 3, 4, 5]);
});
