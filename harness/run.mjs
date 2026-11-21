#!/usr/bin/env node
// Headless harness: run a habitat on several seeds and print the comparison.
//
//   node harness/run.mjs --habitat seasons --seeds 8
//   node harness/run.mjs --habitat all --seeds 8 --steps 12000
//   node harness/run.mjs --habitat winter --seeds 4 --json

import { parseArgs } from 'node:util';
import { DEFAULT_STEPS } from '../src/core/experiment.js';
import { HABITATS, getHabitat } from '../src/core/habitats.js';
import { compare, formatTable } from '../src/core/report.js';

const USAGE = `Usage: node harness/run.mjs --habitat <name|all> [--seeds 8] [--steps ${DEFAULT_STEPS}] [--first-seed 1] [--json]

Habitats: ${HABITATS.map((h) => h.id).join(', ')}`;

/**
 * @param {string | undefined} text
 * @param {string} name
 * @returns {number}
 */
function positiveInt(text, name) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive whole number, got "${text}"`);
  }
  return value;
}

function main() {
  const { values } = parseArgs({
    options: {
      habitat: { type: 'string' },
      seeds: { type: 'string', default: '8' },
      steps: { type: 'string', default: String(DEFAULT_STEPS) },
      'first-seed': { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || !values.habitat) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  const count = positiveInt(values.seeds, 'seeds');
  const steps = positiveInt(values.steps, 'steps');
  const first = positiveInt(values['first-seed'], 'first-seed');
  const seeds = Array.from({ length: count }, (_, i) => first + i);
  const ids =
    values.habitat === 'all' ? HABITATS.map((h) => h.id) : [getHabitat(values.habitat).id];

  const comparisons = ids.map((id) => compare(id, seeds, steps));
  if (values.json) {
    console.log(JSON.stringify(comparisons, null, 2));
    return;
  }
  for (const comparison of comparisons) {
    const habitat = getHabitat(comparison.habitat);
    console.log(`\n${habitat.title} (${habitat.id})`);
    console.log(`${count} worlds (seeds ${first} to ${first + count - 1}), ${steps} steps each\n`);
    console.log(formatTable(comparison));
  }
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`\n${USAGE}`);
  process.exitCode = 1;
}
