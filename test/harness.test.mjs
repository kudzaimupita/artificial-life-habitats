import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HABITATS } from '../src/core/habitats.js';
import { METRICS, compare, formatTable } from '../src/core/report.js';

const HARNESS = fileURLToPath(new URL('../harness/run.mjs', import.meta.url));
const STEPS = 1500;

test('every metric a habitat reports is defined', () => {
  for (const habitat of HABITATS) {
    assert.ok(habitat.metrics.length > 0);
    for (const id of habitat.metrics) assert.ok(METRICS[id], `${habitat.id}: unknown metric ${id}`);
  }
});

test('a comparison has one run per seed and one row per metric', () => {
  const comparison = compare('seasons', [1, 2, 3], STEPS);
  assert.equal(comparison.habitat, 'seasons');
  assert.deepEqual(comparison.seeds, [1, 2, 3]);
  assert.equal(comparison.steps, STEPS);
  assert.deepEqual(comparison.variants, ['Simple', 'Memory']);
  assert.equal(comparison.runs.length, 3);
  for (const run of comparison.runs) assert.equal(run.summaries.length, 2);
  assert.equal(comparison.rows.length, HABITATS[0].metrics.length);
  for (const row of comparison.rows) {
    assert.equal(row.values.length, 2);
    assert.equal(row.text.length, 2);
  }
  assert.ok(comparison.fewerDeaths >= 0 && comparison.fewerDeaths <= 3);
});

test('totals are sums over seeds and averages are means over seeds', () => {
  const comparison = compare('seasons', [1, 2], STEPS);
  const deaths = comparison.rows.find((row) => row.id === 'deaths');
  const energy = comparison.rows.find((row) => row.id === 'energy');
  assert.ok(deaths && energy);
  const [a, b] = comparison.runs.map((run) => run.summaries[0]);
  assert.equal(deaths.values[0], a.deaths + b.deaths);
  assert.ok(Math.abs(energy.values[0] - (a.energy + b.energy) / 2) < 1e-9);
});

test('a comparison is deterministic', () => {
  assert.deepEqual(compare('planning', [4, 5], STEPS), compare('planning', [4, 5], STEPS));
});

test('the table is aligned Markdown with a header, a rule and a row per metric', () => {
  const comparison = compare('winter', [1, 2], STEPS);
  const lines = formatTable(comparison).split('\n');
  assert.equal(lines.length, comparison.rows.length + 3);
  assert.match(lines[0], /^\| +\| +Unprepared \| +Winter planner \|$/);
  assert.match(lines[1], /^\| -+ \| -+: \| -+: \|$/);
  assert.match(lines.at(-1) ?? '', /Worlds where Winter planner died less often.*\d of 2 \|$/);
  for (const line of lines) {
    assert.equal(line.length, lines[0].length);
    assert.equal(line.split('|').length, 5);
  }
});

test('the command line prints a table for one habitat', () => {
  const output = execFileSync(
    process.execPath,
    [HARNESS, '--habitat', 'seasons', '--seeds', '2', '--steps', String(STEPS)],
    { encoding: 'utf8' },
  );
  assert.match(output, /Seasons and memory \(seasons\)/);
  assert.match(output, /2 worlds \(seeds 1 to 2\), 1500 steps each/);
  assert.match(output, /\| Deaths, total +\| +\d+ \| +\d+ \|/);
});

test('the command line emits JSON for every habitat with --habitat all --json', () => {
  const output = execFileSync(
    process.execPath,
    [HARNESS, '--habitat', 'all', '--seeds', '1', '--steps', '600', '--json'],
    { encoding: 'utf8' },
  );
  const comparisons = JSON.parse(output);
  assert.deepEqual(
    comparisons.map((/** @type {{ habitat: string }} */ c) => c.habitat),
    HABITATS.map((h) => h.id),
  );
  for (const comparison of comparisons) {
    assert.deepEqual(Object.keys(comparison).sort(), [
      'fewerDeaths',
      'habitat',
      'rows',
      'runs',
      'seeds',
      'steps',
      'variants',
    ]);
  }
});

test('the command line rejects bad input with a non-zero exit and usage', () => {
  for (const args of [[], ['--habitat', 'nowhere'], ['--habitat', 'seasons', '--seeds', '0']]) {
    const result = spawnSync(process.execPath, [HARNESS, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stdout + result.stderr, /Usage: node harness\/run\.mjs/);
  }
});
