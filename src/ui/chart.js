// The live chart: energy on top, cumulative deaths below, one line per
// variant. The whole run stays visible; older samples are thinned as it grows.

import { SEASON_LENGTH } from '../core/foods.js';
import { WINTER_START, YEAR } from '../core/weather.js';
import { MAX_ENERGY } from '../core/constants.js';
import { prepare } from './draw.js';

const FIRST_INTERVAL = 20;
const MAX_SAMPLES = 480;
/** The chart never zooms in closer than this many steps. */
const MIN_SPAN = 3 * SEASON_LENGTH;

/**
 * @typedef {object} Sample
 * @property {number} t Step at the end of the sample.
 * @property {number[]} energy Mean energy per variant over the sample.
 * @property {number[]} deaths Cumulative deaths per variant.
 */

export class History {
  /** @param {number} variants */
  constructor(variants) {
    this.variants = variants;
    this.interval = FIRST_INTERVAL;
    /** @type {Sample[]} */
    this.samples = [];
    this.sums = new Array(variants).fill(0);
    this.count = 0;
  }

  /**
   * Call once per simulation step.
   * @param {import('../core/world.js').World[]} worlds
   */
  record(worlds) {
    worlds.forEach((world, i) => (this.sums[i] += world.creature.energy));
    this.count++;
    if (this.count < this.interval) return;
    this.samples.push({
      t: worlds[0].t,
      energy: this.sums.map((sum) => sum / this.count),
      deaths: worlds.map((world) => world.stats.deaths),
    });
    this.sums.fill(0);
    this.count = 0;
    if (this.samples.length > MAX_SAMPLES) this.thin();
  }

  /** Halve the resolution: merge neighbouring samples and sample half as often. */
  thin() {
    /** @type {Sample[]} */
    const merged = [];
    for (let i = 0; i + 1 < this.samples.length; i += 2) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      merged.push({
        t: b.t,
        energy: a.energy.map((value, v) => (value + b.energy[v]) / 2),
        deaths: b.deaths,
      });
    }
    this.samples = merged;
    this.interval *= 2;
  }
}

/**
 * @typedef {object} ChartOptions
 * @property {boolean} winters Shade winters.
 * @property {number} rewireEvery Mark rewirings (0 = none).
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {History} history
 * @param {import('./theme.js').Theme} theme
 * @param {string[]} tones One colour per variant.
 * @param {ChartOptions} options
 * @param {number} pixelRatio
 */
export function drawChart(canvas, history, theme, tones, options, pixelRatio) {
  const surface = prepare(canvas, pixelRatio);
  if (!surface) return;
  const { context: g, width, height } = surface;
  const { samples } = history;
  const last = samples.at(-1);
  const span = Math.max(MIN_SPAN, last ? last.t : 0);
  const mostDeaths = Math.max(4, ...(last ? last.deaths : [0]));

  const left = 34;
  const right = width - 8;
  const gap = 26;
  const top = 6;
  const bottom = height - 20;
  const split = top + (bottom - top - gap) * 0.6;
  const energyBox = { top, bottom: split };
  const deathBox = { top: split + gap, bottom };

  const x = (/** @type {number} */ t) => left + ((right - left) * t) / span;
  const yEnergy = (/** @type {number} */ v) =>
    energyBox.bottom - ((energyBox.bottom - energyBox.top) * v) / MAX_ENERGY;
  const yDeaths = (/** @type {number} */ v) =>
    deathBox.bottom - ((deathBox.bottom - deathBox.top) * v) / mostDeaths;

  g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  g.textBaseline = 'middle';
  g.lineWidth = 1;

  // Winters as shaded bands.
  if (options.winters) {
    g.fillStyle = theme.ice;
    for (let year = 0; year * YEAR < span; year++) {
      const from = x(year * YEAR + WINTER_START);
      const to = Math.min(right, x((year + 1) * YEAR));
      if (from < right) g.fillRect(from, top, to - from, bottom - top);
    }
  }

  // Horizontal grid and value labels.
  g.fillStyle = theme.muted;
  g.strokeStyle = theme.line;
  g.textAlign = 'right';
  for (const value of [0, 50, 100]) {
    const y = Math.round(yEnergy(value)) + 0.5;
    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(right, y);
    g.stroke();
    g.fillText(String(value), left - 8, y);
  }
  for (const value of [0, mostDeaths]) {
    const y = Math.round(yDeaths(value)) + 0.5;
    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(right, y);
    g.stroke();
    g.fillText(String(value), left - 8, y);
  }

  // Season changes as ticks along the bottom, rewirings as full-height lines.
  g.strokeStyle = theme.lineStrong;
  if (span / SEASON_LENGTH <= 80) {
    for (let t = SEASON_LENGTH; t <= span; t += SEASON_LENGTH) {
      const px = Math.round(x(t)) + 0.5;
      g.beginPath();
      g.moveTo(px, bottom);
      g.lineTo(px, bottom + 5);
      g.stroke();
    }
  }
  if (options.rewireEvery > 0) {
    g.setLineDash([2, 3]);
    g.strokeStyle = theme.muted;
    for (let t = options.rewireEvery; t <= span; t += options.rewireEvery) {
      const px = Math.round(x(t)) + 0.5;
      g.beginPath();
      g.moveTo(px, top);
      g.lineTo(px, bottom);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // Captions.
  g.textAlign = 'left';
  g.fillStyle = theme.muted;
  g.fillText('ENERGY', left + 6, energyBox.top + 8);
  g.fillText('DEATHS', left + 6, deathBox.top + 8);
  g.textAlign = 'right';
  g.fillText(`${span.toLocaleString('en')} steps`, right, bottom + 12);

  // The lines themselves; the changed variant is drawn last, on top.
  g.lineWidth = 1.5;
  g.lineJoin = 'round';
  tones.forEach((tone, v) => {
    g.strokeStyle = tone;
    g.beginPath();
    samples.forEach((sample, i) => {
      const px = x(sample.t - history.interval / 2);
      if (i === 0) g.moveTo(px, yEnergy(sample.energy[v]));
      else g.lineTo(px, yEnergy(sample.energy[v]));
    });
    g.stroke();

    g.beginPath();
    g.moveTo(x(0), yDeaths(0));
    let level = 0;
    for (const sample of samples) {
      // Deaths are steps, not slopes.
      g.lineTo(x(sample.t), yDeaths(level));
      level = sample.deaths[v];
      g.lineTo(x(sample.t), yDeaths(level));
    }
    g.stroke();
  });
}
