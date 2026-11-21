// Turning per-seed summaries into the comparison table the harness prints.

import { DEFAULT_STEPS, runExperiment } from './experiment.js';
import { getHabitat } from './habitats.js';

/**
 * @typedef {import('./experiment.js').Summary} Summary
 */

/**
 * @typedef {object} Metric
 * @property {string} label
 * @property {keyof Summary} key
 * @property {'sum' | 'mean'} across How seeds are combined.
 * @property {(value: number) => string} format
 */

/** @param {number} digits */
const fixed = (digits) => (/** @type {number} */ value) =>
  Number.isNaN(value) ? 'n/a' : value.toFixed(digits);
const percent = (/** @type {number} */ value) =>
  Number.isNaN(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`;

/** @type {Record<string, Metric>} */
export const METRICS = {
  deaths: { label: 'Deaths, total', key: 'deaths', across: 'sum', format: fixed(0) },
  energy: { label: 'Average energy', key: 'energy', across: 'mean', format: fixed(1) },
  goodMeals: { label: 'Good meals', key: 'goodMeals', across: 'mean', format: percent },
  badMeals: { label: 'Bad meals eaten, total', key: 'badMeals', across: 'sum', format: fixed(0) },
  surpriseNew: {
    label: 'Surprise, first 15 meals of a new season',
    key: 'surpriseNew',
    across: 'mean',
    format: fixed(2),
  },
  surpriseReturning: {
    label: 'Surprise, first 15 meals of a returning season',
    key: 'surpriseReturning',
    across: 'mean',
    format: fixed(2),
  },
  memories: {
    label: 'Season memories at the end',
    key: 'memories',
    across: 'mean',
    format: fixed(1),
  },
  deathsBeforeRewire: {
    label: 'Deaths before the rewiring, total',
    key: 'deathsBeforeRewire',
    across: 'sum',
    format: fixed(0),
  },
  deathsAfterRewire: {
    label: 'Deaths after the rewiring, total',
    key: 'deathsAfterRewire',
    across: 'sum',
    format: fixed(0),
  },
  energyBeforeRewire: {
    label: 'Average energy before the rewiring',
    key: 'energyBeforeRewire',
    across: 'mean',
    format: fixed(1),
  },
  energyAfterRewire: {
    label: 'Average energy after the rewiring',
    key: 'energyAfterRewire',
    across: 'mean',
    format: fixed(1),
  },
  moveSurprisesAfterRewire: {
    label: 'Moves that landed somewhere unexpected after the rewiring, total',
    key: 'moveSurprisesAfterRewire',
    across: 'sum',
    format: fixed(0),
  },
  winterDeaths: {
    label: 'Deaths in winter, total',
    key: 'winterDeaths',
    across: 'sum',
    format: fixed(0),
  },
  hibernated: {
    label: 'Steps hibernating, per world',
    key: 'hibernated',
    across: 'mean',
    format: fixed(0),
  },
  deadlyMeals: {
    label: 'Deadly meals eaten, total',
    key: 'deadlyMeals',
    across: 'sum',
    format: fixed(0),
  },
  deadlyDeaths: {
    label: 'Deaths from a deadly meal, total',
    key: 'deadlyDeaths',
    across: 'sum',
    format: fixed(0),
  },
};

/**
 * @typedef {object} Comparison
 * @property {string} habitat
 * @property {number[]} seeds
 * @property {number} steps
 * @property {string[]} variants Variant labels, baseline first.
 * @property {{ seed: number, summaries: Summary[] }[]} runs
 * @property {{ id: string, label: string, values: number[], text: string[] }[]} rows
 * @property {number} fewerDeaths Seeds in which the second variant died less often than the baseline.
 */

/**
 * Combine one metric across seeds. Seeds with nothing to report are skipped.
 * @param {Metric} metric
 * @param {Summary[]} summaries
 */
function combine(metric, summaries) {
  const values = summaries.map((s) => s[metric.key]).filter((v) => !Number.isNaN(v));
  if (values.length === 0) return NaN;
  const total = values.reduce((a, b) => a + b, 0);
  return metric.across === 'sum' ? total : total / values.length;
}

/**
 * Run a habitat on several seeds and build its comparison table.
 * @param {string} habitatId
 * @param {number[]} seeds
 * @param {number} [steps]
 * @returns {Comparison}
 */
export function compare(habitatId, seeds, steps = DEFAULT_STEPS) {
  const habitat = getHabitat(habitatId);
  const runs = seeds.map((seed) => ({ seed, summaries: runExperiment(habitatId, seed, steps) }));
  const rows = habitat.metrics.map((id) => {
    const metric = METRICS[id];
    const values = habitat.variants.map((_, v) =>
      combine(
        metric,
        runs.map((run) => run.summaries[v]),
      ),
    );
    return { id, label: metric.label, values, text: values.map(metric.format) };
  });
  const fewerDeaths = runs.filter(
    (run) => run.summaries[1].deaths < run.summaries[0].deaths,
  ).length;
  return {
    habitat: habitat.id,
    seeds,
    steps,
    variants: habitat.variants.map((variant) => variant.label),
    runs,
    rows,
    fewerDeaths,
  };
}

/**
 * Render a comparison as a Markdown table.
 * @param {Comparison} comparison
 * @returns {string}
 */
export function formatTable(comparison) {
  const [baseline, other] = comparison.variants;
  const body = comparison.rows.map((row) => [row.label, ...row.text]);
  body.push([
    `Worlds where ${other} died less often than ${baseline}`,
    '',
    `${comparison.fewerDeaths} of ${comparison.seeds.length}`,
  ]);
  const table = [['', ...comparison.variants], ...body];
  const widths = table[0].map((_, column) =>
    Math.max(3, ...table.map((row) => row[column].length)),
  );
  /** @param {string[]} cells */
  const line = (cells) =>
    `| ${cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join(' | ')} |`;
  const rule = `| ${widths.map((w, i) => (i === 0 ? '-'.repeat(w) : `${'-'.repeat(w - 1)}:`)).join(' | ')} |`;
  return [line(table[0]), rule, ...body.map(line)].join('\n');
}
