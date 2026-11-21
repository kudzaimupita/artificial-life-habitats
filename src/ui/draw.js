// Drawing one world on a canvas.

import { ICE, MAX_ENERGY, SIGHT, SIZE, WALL } from '../core/constants.js';
import { isDeadly } from '../core/foods.js';
import { foodColours } from './theme.js';

/**
 * Match the canvas bitmap to its on-screen size.
 * @param {HTMLCanvasElement} canvas
 * @param {number} pixelRatio
 * @returns {{ context: CanvasRenderingContext2D, width: number, height: number } | null}
 */
export function prepare(canvas, pixelRatio) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const context = canvas.getContext('2d');
  if (!context || !width || !height) return null;
  const ratio = pixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('../core/world.js').World} world
 * @param {import('./theme.js').Theme} theme
 * @param {string} tone The creature's colour.
 * @param {number} pixelRatio
 */
export function drawWorld(canvas, world, theme, tone, pixelRatio) {
  const surface = prepare(canvas, pixelRatio);
  if (!surface) return;
  const { context: g, width } = surface;
  const cell = width / SIZE;
  const { creature } = world;
  const centre = (/** @type {number} */ v) => (v + 0.5) * cell;

  // Ground.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const kind = world.groundAt(x, y);
      if (kind === WALL) {
        g.fillStyle = theme.wall;
        g.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
      } else if (kind === ICE) {
        g.fillStyle = theme.ice;
        g.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
      }
    }
  }

  // Winter lies over everything as a cold tint.
  if (world.winter) {
    g.globalAlpha = 0.07;
    g.fillStyle = theme.frost;
    g.fillRect(0, 0, width, width);
    g.globalAlpha = 1;
  }

  // How far the creature sees.
  g.strokeStyle = theme.faint;
  g.lineWidth = 1;
  g.strokeRect(
    Math.round((creature.x - SIGHT) * cell) + 0.5,
    Math.round((creature.y - SIGHT) * cell) + 0.5,
    Math.round((2 * SIGHT + 1) * cell),
    Math.round((2 * SIGHT + 1) * cell),
  );

  // Food. The deadly one carries a dark cross.
  const colours = foodColours(theme);
  const radius = cell * 0.3;
  for (const food of world.food.values()) {
    const cx = centre(food.x);
    const cy = centre(food.y);
    g.fillStyle = colours[food.colour];
    if (food.shape === 0) {
      g.beginPath();
      g.arc(cx, cy, radius, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    if (world.options.deadly && isDeadly(world.season, food.colour, food.shape)) {
      const arm = radius * 0.55;
      g.strokeStyle = theme.canvas;
      g.lineWidth = Math.max(1.5, cell * 0.1);
      g.beginPath();
      g.moveTo(cx - arm, cy - arm);
      g.lineTo(cx + arm, cy + arm);
      g.moveTo(cx + arm, cy - arm);
      g.lineTo(cx - arm, cy + arm);
      g.stroke();
    }
  }

  // The route it has in mind, or the food it is heading for.
  const cx = centre(creature.x);
  const cy = centre(creature.y);
  g.strokeStyle = tone;
  g.lineWidth = 1;
  g.globalAlpha = 0.75;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(cx, cy);
  if (creature.plan) {
    for (const index of creature.plan.cells) {
      g.lineTo(centre(index % SIZE), centre(Math.floor(index / SIZE)));
    }
  } else if (creature.target && world.hasFood(creature.target)) {
    g.lineTo(centre(creature.target.x), centre(creature.target.y));
  }
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;

  // The creature, dimmed while it sleeps, with a ring showing its energy.
  const resting = creature.activity === 'sleeping' || creature.activity === 'hibernating';
  g.fillStyle = theme.canvas;
  g.beginPath();
  g.arc(cx, cy, cell * 0.72, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = resting ? 0.35 : 1;
  g.fillStyle = tone;
  g.beginPath();
  g.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.lineStrong;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, cell * 0.6, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = tone;
  g.beginPath();
  const share = Math.max(0, creature.energy) / MAX_ENERGY;
  g.arc(cx, cy, cell * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
  g.stroke();
}
