// The page controller shared by every habitat page: builds the controls and
// panels, runs the experiment on animation frames, and keeps the page in step
// with the simulation. All simulation logic lives in ../core.

import { DIRECTIONS, MAX_ENERGY } from '../core/constants.js';
import { Experiment, summarise } from '../core/experiment.js';
import {
  COLOURS,
  DEADLY_VALUE,
  SEASON_LENGTH,
  SHAPES,
  foodName,
  foodValue,
  isDeadly,
} from '../core/foods.js';
import { WINTER_START, YEAR } from '../core/weather.js';
import { History, drawChart } from './chart.js';
import { drawWorld } from './draw.js';
import { readTheme, variantColours } from './theme.js';

const SPEEDS = [1, 4, 16, 64];
const DEFAULT_SPEED = 4;
const DEFAULT_SEED = 1;
const MAX_SEED = 999999;
/** Text panels are refreshed every this many frames; canvases every frame. */
const PANEL_EVERY = 6;
const LOG_LINES = 9;
const ARROWS = ['→', '↓', '←', '↑'];
const BUTTON_NAMES = ['A', 'B', 'C', 'D'];

/**
 * The parts of the browser the app touches, so tests can pass stand-ins.
 * @typedef {object} Env
 * @property {Document} document
 * @property {(callback: FrameRequestCallback) => number} requestAnimationFrame
 * @property {Pick<Window, 'getComputedStyle'>} [view]
 * @property {{ search: string }} [location]
 * @property {Pick<History_, 'replaceState'>} [history]
 * @property {number} [devicePixelRatio]
 */

/** @typedef {globalThis.History} History_ */

/** @param {string} text */
const escapeHtml = (text) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

/** @param {number} value */
const signed = (value) => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1);
/** @param {number} value */
const whole = (value) => Math.round(value).toLocaleString('en');

/**
 * @param {unknown} text
 * @returns {number} A usable seed; anything unreadable falls back to the default.
 */
export function parseSeed(text) {
  const value = Number.parseInt(String(text ?? ''), 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SEED;
  return Math.min(value, MAX_SEED);
}

/**
 * Extra figures worth showing for a habitat, beyond the four every world has.
 * @param {import('../core/world.js').World} world
 * @returns {[string, string][]}
 */
function extraStats(world) {
  const { options, stats, creature } = world;
  if (options.rewireEvery > 0) {
    const known = world.wiring.filter((dir, button) => creature.model.direction(button) === dir);
    return [
      ['buttons right', `${known.length} / ${world.wiring.length}`],
      ['wrong landings', whole(stats.moveSurprises)],
    ];
  }
  if (options.winters) {
    return [
      ['winter deaths', whole(stats.winterDeaths)],
      ['hibernated', whole(stats.hibernatedSteps)],
    ];
  }
  if (options.deadly) {
    return [
      ['deadly meals', whole(stats.deadlyMeals)],
      ['foods feared', whole(creature.mind.dangers.size)],
    ];
  }
  return [
    ['bad meals', whole(stats.badMeals)],
    ['memories', whole(creature.mind.contexts.length)],
  ];
}

/**
 * What the creature believes each food is worth, next to the truth.
 * @param {import('../core/world.js').World} world
 */
function beliefRows(world) {
  const { mind } = world.creature;
  let rows = '';
  for (let colour = 0; colour < COLOURS.length; colour++) {
    for (let shape = 0; shape < SHAPES.length; shape++) {
      const deadly = world.options.deadly && isDeadly(world.season, colour, shape);
      const truth = deadly ? DEADLY_VALUE : foodValue(world.season, colour, shape);
      const belief = mind.predict(colour, shape);
      const wrong = belief > 0 !== truth > 0 && Math.abs(belief - truth) >= 2;
      const feared = mind.isDangerous(colour, shape);
      rows +=
        `<tr><td><i class="food ${SHAPES[shape]}" style="--tone:var(--${COLOURS[colour]})"></i>` +
        `${foodName(colour, shape)}</td>` +
        `<td class="${wrong ? 'wrong' : ''}">${feared ? 'feared' : signed(belief)}</td>` +
        `<td>${signed(truth)}</td></tr>`;
    }
  }
  return rows;
}

/**
 * A line under the beliefs: what the creature thinks its buttons do.
 * @param {import('../core/world.js').World} world
 */
function buttonNote(world) {
  if (!world.options.scrambled) return '';
  const { model } = world.creature;
  const parts = world.wiring.map((direction, button) => {
    const believed = model.direction(button);
    const arrow = believed < 0 ? '?' : ARROWS[believed % DIRECTIONS.length];
    const text = `${BUTTON_NAMES[button]} ${arrow}`;
    return believed === direction ? text : `<b>${text}</b>`;
  });
  const truth = world.wiring.map((direction) => ARROWS[direction]).join(' ');
  return `believes ${parts.join(' &nbsp;')} &nbsp;·&nbsp; really ${truth}`;
}

/**
 * Build the page for one habitat and start it running.
 * @param {string} habitatId
 * @param {Partial<Env>} [overrides]
 */
export function mount(habitatId, overrides = {}) {
  /** @type {Env} */
  const env = {
    document: globalThis.document,
    requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
    view: globalThis.window,
    location: globalThis.location,
    history: globalThis.history,
    ...overrides,
  };
  const root = env.document.querySelector('[data-app]');
  if (!root) throw new Error('The page has no [data-app] element to mount into.');

  let seed = parseSeed(new URLSearchParams(env.location?.search ?? '').get('seed'));
  let experiment = new Experiment(habitatId, seed);
  let history = new History(experiment.worlds.length);
  let running = true;
  let speed = DEFAULT_SPEED;
  let frame = 0;

  const { habitat } = experiment;
  const theme = readTheme(env.view, env.document.documentElement);
  const tones = variantColours(theme);

  root.innerHTML = `
    <section class="controls" aria-label="Simulation controls">
      <div class="group">
        <button class="primary" data-play>Pause</button>
        <button data-step title="Advance one step">Step</button>
      </div>
      <div class="group speed">
        <span class="label">Speed</span>
        ${SPEEDS.map((s) => `<button data-speed="${s}" aria-pressed="${s === speed}">${s}×</button>`).join('')}
      </div>
      <div class="group">
        <label class="label" for="seed">Seed</label>
        <input id="seed" data-seed inputmode="numeric" autocomplete="off" value="${seed}" />
        <button data-reset>Reset</button>
        <button data-random>New seed</button>
      </div>
    </section>
    <div class="status" data-status aria-live="off"></div>
    <section class="worlds">
      ${habitat.variants
        .map(
          (variant, i) => `
      <article class="world" style="--tone:${tones[i]}">
        <header>
          <i class="swatch"></i><h2>${escapeHtml(variant.label)}</h2>
          <span class="activity" data-activity></span>
        </header>
        <p class="blurb">${escapeHtml(variant.blurb)}</p>
        <canvas data-world aria-label="${escapeHtml(variant.label)} creature in its world"></canvas>
        <dl class="stats" data-stats></dl>
        <table>
          <thead><tr><th>Food</th><th>Believes</th><th>True now</th></tr></thead>
          <tbody data-beliefs></tbody>
        </table>
        <p class="note" data-note></p>
      </article>`,
        )
        .join('')}
    </section>
    <ul class="legend" aria-label="Map key">
      <li><i class="key ring"></i>creature, ring shows energy</li>
      <li><i class="key box"></i>how far it sees</li>
      <li><i class="key dash"></i>where it is heading</li>
      ${habitat.world.walls ? '<li><i class="key" style="background:var(--wall)"></i>wall</li>' : ''}
      ${habitat.world.ice ? '<li><i class="key" style="background:var(--ice)"></i>ice, slides one extra cell</li>' : ''}
      ${habitat.world.deadly ? '<li>food with a cross is deadly this season</li>' : ''}
      <li>underlined beliefs have the wrong sign</li>
    </ul>
    <div class="below">
      <section class="panel chart">
        <header>
          <h2>Energy and deaths</h2>
          <ul class="legend">
            ${habitat.variants
              .map(
                (variant, i) =>
                  `<li><i class="key line" style="--tone:${tones[i]}"></i>${escapeHtml(variant.label)}</li>`,
              )
              .join('')}
          </ul>
        </header>
        <canvas data-chart aria-label="Energy and cumulative deaths over time"></canvas>
      </section>
      <section class="panel log">
        <header><h2>Events</h2></header>
        <ol data-log></ol>
      </section>
    </div>`;

  /**
   * @template {Element} T
   * @param {string} selector
   * @returns {T}
   */
  const one = (selector) => /** @type {T} */ (root.querySelector(selector));
  /**
   * @template {Element} T
   * @param {string} selector
   * @returns {T[]}
   */
  const all = (selector) => /** @type {T[]} */ ([...root.querySelectorAll(selector)]);

  const playButton = /** @type {HTMLButtonElement} */ (one('[data-play]'));
  const seedInput = /** @type {HTMLInputElement} */ (one('[data-seed]'));
  const status = one('[data-status]');
  const chartCanvas = /** @type {HTMLCanvasElement} */ (one('[data-chart]'));
  const logList = one('[data-log]');
  const speedButtons = /** @type {HTMLButtonElement[]} */ (all('[data-speed]'));
  const worldCanvases = /** @type {HTMLCanvasElement[]} */ (all('[data-world]'));
  const activityLabels = all('[data-activity]');
  const statLists = all('[data-stats]');
  const beliefBodies = all('[data-beliefs]');
  const notes = all('[data-note]');

  /** @param {number} steps */
  function advance(steps) {
    for (let i = 0; i < steps; i++) {
      experiment.run(1);
      history.record(experiment.worlds);
    }
  }

  function renderStatus() {
    const t = experiment.t;
    const world = experiment.worlds[0];
    const parts = [
      `step <b>${whole(t)}</b>`,
      `<b>${world.season.name}</b>, ${whole(SEASON_LENGTH - (t % SEASON_LENGTH))} steps left`,
    ];
    if (habitat.world.winters) {
      const day = t % YEAR;
      parts.push(
        day >= WINTER_START
          ? `<b>winter</b>, ${whole(YEAR - day)} steps left`
          : `winter in ${whole(WINTER_START - day)}`,
      );
    }
    const every = habitat.world.rewireEvery ?? 0;
    if (every > 0) parts.push(`rewiring in ${whole(every - (t % every))}`);
    status.innerHTML = parts.map((part) => `<span>${part}</span>`).join('');
  }

  function renderPanels() {
    experiment.worlds.forEach((world, i) => {
      const summary = summarise(world);
      const share = Number.isNaN(summary.goodMeals) ? 'n/a' : `${whole(summary.goodMeals * 100)}%`;
      /** @type {[string, string][]} */
      const cells = [
        ['energy', `${whole(world.creature.energy)} / ${MAX_ENERGY}`],
        ['average', Number.isNaN(summary.energy) ? 'n/a' : whole(summary.energy)],
        ['deaths', whole(summary.deaths)],
        ['good meals', share],
        ...extraStats(world),
      ];
      statLists[i].innerHTML = cells
        .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
        .join('');
      beliefBodies[i].innerHTML = beliefRows(world);
      activityLabels[i].textContent = world.creature.activity;
      notes[i].innerHTML = buttonNote(world);
    });
    renderStatus();
    renderLog();
  }

  function renderLog() {
    /** @type {{ t: number, tone: string, text: string }[]} */
    const lines = [];
    experiment.worlds.forEach((world, i) => {
      for (const event of world.events) {
        const shared = event.kind === 'season' || event.kind === 'rewire';
        // Things that happen to the world itself are listed once.
        if (shared && i > 0) continue;
        if (event.kind === 'sleep') continue;
        lines.push({ t: event.t, tone: shared ? theme.faint : tones[i], text: event.text });
      }
    });
    lines.sort((a, b) => b.t - a.t);
    logList.innerHTML = lines.length
      ? lines
          .slice(0, LOG_LINES)
          .map(
            (line) =>
              `<li><time>${whole(line.t)}</time><i class="swatch" style="--tone:${line.tone}"></i>` +
              `<span>${escapeHtml(line.text)}</span></li>`,
          )
          .join('')
      : '<li><span class="empty">Nothing has happened yet.</span></li>';
  }

  function renderCanvases() {
    const ratio = env.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
    experiment.worlds.forEach((world, i) => {
      drawWorld(worldCanvases[i], world, theme, tones[i], ratio);
    });
    drawChart(
      chartCanvas,
      history,
      theme,
      tones,
      { winters: Boolean(habitat.world.winters), rewireEvery: habitat.world.rewireEvery ?? 0 },
      ratio,
    );
  }

  function render() {
    renderCanvases();
    renderPanels();
  }

  /** @param {number} next */
  function reset(next) {
    seed = next;
    seedInput.value = String(seed);
    experiment = new Experiment(habitatId, seed);
    history = new History(experiment.worlds.length);
    env.history?.replaceState(null, '', `?seed=${seed}`);
    render();
  }

  /** @param {boolean} next */
  function setRunning(next) {
    running = next;
    playButton.textContent = running ? 'Pause' : 'Play';
  }

  playButton.addEventListener('click', () => setRunning(!running));
  one('[data-step]').addEventListener('click', () => {
    setRunning(false);
    advance(1);
    render();
  });
  one('[data-reset]').addEventListener('click', () => reset(parseSeed(seedInput.value)));
  one('[data-random]').addEventListener('click', () =>
    reset(1 + Math.floor(Math.random() * MAX_SEED)),
  );
  seedInput.addEventListener('keydown', (event) => {
    if (/** @type {KeyboardEvent} */ (event).key === 'Enter') reset(parseSeed(seedInput.value));
  });
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed) || DEFAULT_SPEED;
      for (const other of speedButtons) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
  }

  function tick() {
    if (running) advance(speed);
    // While paused nothing moves, so a slow redraw is enough to follow resizes.
    if (running || frame % PANEL_EVERY === 0) renderCanvases();
    if (frame % PANEL_EVERY === 0) renderPanels();
    frame++;
    env.requestAnimationFrame(tick);
  }

  render();
  env.requestAnimationFrame(tick);

  return {
    get experiment() {
      return experiment;
    },
    get seed() {
      return seed;
    },
    get running() {
      return running;
    },
  };
}
