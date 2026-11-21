import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HABITATS } from '../src/core/habitats.js';
import { mount, parseSeed } from '../src/ui/app.js';
import { History } from '../src/ui/chart.js';
import { World } from '../src/core/world.js';
import { fakeEnv } from './fake-dom.mjs';

/**
 * @param {string} id
 * @param {string} [search]
 */
function start(id, search) {
  const fake = fakeEnv(search);
  const app = mount(id, /** @type {any} */ (fake.env));
  return { ...fake, app };
}

test('seeds are read leniently', () => {
  assert.equal(parseSeed('42'), 42);
  assert.equal(parseSeed(' 7 '), 7);
  assert.equal(parseSeed('abc'), 1);
  assert.equal(parseSeed(null), 1);
  assert.equal(parseSeed('-3'), 1);
  assert.equal(parseSeed('99999999999'), 999999);
});

for (const habitat of HABITATS) {
  test(`${habitat.id}: the page mounts, runs frames and draws`, () => {
    const { app, root, runFrames } = start(habitat.id);
    assert.equal(root.querySelectorAll('[data-world]').length, 2);
    assert.equal(root.querySelectorAll('[data-speed]').length, 4);
    for (const variant of habitat.variants) assert.ok(root.innerHTML.includes(variant.label));

    runFrames(120);
    assert.equal(app.experiment.t, 120 * 4, 'default speed is four steps a frame');

    for (const canvas of root.querySelectorAll('[data-world]')) {
      assert.ok(canvas.canvas.calls.count > 0);
      assert.equal(canvas.width, canvas.clientWidth * 2, 'bitmap matches the pixel ratio');
    }
    assert.ok(root.querySelector('[data-chart]').canvas.calls.count > 0);
    for (const stats of root.querySelectorAll('[data-stats]')) {
      assert.match(stats.innerHTML, /<dt>deaths<\/dt><dd>\d+<\/dd>/);
      assert.equal(stats.innerHTML.match(/<dt>/g)?.length, 6);
    }
    for (const beliefs of root.querySelectorAll('[data-beliefs]')) {
      assert.equal(beliefs.innerHTML.match(/<tr>/g)?.length, 6);
    }
    assert.match(root.querySelector('[data-status]').innerHTML, /step <b>\d+<\/b>/);
  });
}

test('pause, step, speed and reset do what they say', () => {
  const { app, root, runFrames, urls } = start('seasons');
  const play = root.querySelector('[data-play]');
  runFrames(5);
  assert.equal(app.experiment.t, 20);

  play.fire('click');
  assert.equal(app.running, false);
  assert.equal(play.textContent, 'Play');
  runFrames(5);
  assert.equal(app.experiment.t, 20);

  root.querySelector('[data-step]').fire('click');
  assert.equal(app.experiment.t, 21);

  play.fire('click');
  const [, , , fastest] = root.querySelectorAll('[data-speed]');
  fastest.fire('click');
  assert.equal(fastest.attributes['aria-pressed'], 'true');
  runFrames(2);
  assert.equal(app.experiment.t, 21 + 128);

  const seed = root.querySelector('[data-seed]');
  seed.value = '77';
  root.querySelector('[data-reset]').fire('click');
  assert.equal(app.seed, 77);
  assert.equal(app.experiment.t, 0);
  assert.deepEqual(urls, ['?seed=77']);

  seed.value = '78';
  seed.fire('keydown', { key: 'Enter' });
  assert.equal(app.seed, 78);

  root.querySelector('[data-random]').fire('click');
  assert.ok(app.seed >= 1 && app.seed <= 999999);
  assert.equal(seed.value, String(app.seed));
});

test('the seed comes from the address and gives the same run as the harness core', () => {
  const { app, runFrames } = start('planning', '?seed=5');
  assert.equal(app.seed, 5);
  runFrames(50);
  const reference = new World(5, HABITATS[1].world, HABITATS[1].variants[1].abilities);
  for (let i = 0; i < 200; i++) reference.step();
  assert.deepEqual(app.experiment.worlds[1].stats, reference.stats);
});

test('the event log lists world events once and escapes nothing unsafe', () => {
  const { root, runFrames } = start('seasons');
  root.querySelectorAll('[data-speed]')[3].fire('click');
  runFrames(24);
  const log = root.querySelector('[data-log]').innerHTML;
  assert.equal(log.match(/The blue season began\./g)?.length, 1);
  assert.ok((log.match(/<li>/g)?.length ?? 0) <= 9);
});

test('chart history stays bounded and keeps the latest deaths', () => {
  const world = new World(1);
  const history = new History(1);
  for (let i = 0; i < 40000; i++) {
    world.step();
    history.record([world]);
  }
  assert.ok(history.samples.length <= 480);
  assert.ok(history.interval > 20);
  const last = history.samples.at(-1);
  assert.ok(last);
  assert.ok(world.t - last.t < history.interval);
  assert.ok(last.deaths[0] <= world.stats.deaths);
  for (const sample of history.samples) assert.ok(sample.energy[0] > 0 && sample.energy[0] <= 100);
});
