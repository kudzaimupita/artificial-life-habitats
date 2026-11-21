import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FAMINE,
  Forecaster,
  WINTER_START,
  YEAR,
  isWinter,
  senseBucket,
  temperature,
} from '../src/core/weather.js';

test('winter covers the end of every year', () => {
  assert.equal(isWinter(0), false);
  assert.equal(isWinter(WINTER_START - 1), false);
  assert.equal(isWinter(WINTER_START), true);
  assert.equal(isWinter(YEAR - 1), true);
  assert.equal(isWinter(YEAR), false);
  assert.equal(isWinter(YEAR + WINTER_START), true);
});

test('temperature is lowest in midwinter and repeats every year', () => {
  const midwinter = (WINTER_START + YEAR) / 2;
  let coldest = 0;
  for (let t = 0; t < YEAR; t++) {
    const now = temperature(t);
    assert.ok(now >= -1 && now <= 1);
    if (now < temperature(coldest)) coldest = t;
    assert.ok(Math.abs(now - temperature(t + YEAR)) < 1e-9);
  }
  assert.equal(coldest, midwinter);
});

test('the sensed bucket tells cooling from warming', () => {
  const midwinter = (WINTER_START + YEAR) / 2;
  assert.notEqual(senseBucket(midwinter - 100), senseBucket(midwinter + 100));
});

test('a forecaster learns that cold means famine and sees it coming', () => {
  const forecaster = new Forecaster();
  const first = forecaster.sense(0, 8);
  assert.equal(first.now, 8);
  assert.equal(first.soon, -1);

  /** @type {{ t: number, now: number, soon: number }[]} */
  const thirdYear = [];
  for (let t = 1; t < 3 * YEAR; t++) {
    const forecast = forecaster.sense(t, isWinter(t) ? 0 : 8);
    if (t >= 2 * YEAR) thirdYear.push({ t: t % YEAR, ...forecast });
  }
  const at = (/** @type {number} */ t) => thirdYear[t];
  // High summer: plenty now, plenty soon.
  assert.ok(at(600).now > FAMINE && at(600).soon > FAMINE);
  // Deep winter: famine now.
  assert.ok(at(WINTER_START + 300).now < FAMINE);
  // Late autumn: still food, but famine forecast.
  const warned = thirdYear.some(
    (f) => f.t < WINTER_START && f.t > WINTER_START - 300 && f.now > FAMINE && f.soon < FAMINE,
  );
  assert.ok(warned);
});
