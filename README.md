# Artificial life habitats

Small browser worlds in which a creature has to eat to stay alive while the rules keep
changing. Each habitat puts two creatures in identical copies of one seeded world. The two
differ in a single ability (memory for past seasons, route planning, learning their own
movement, forecasting winter, one-trial danger memory), so the gap between them can be put
down to that ability.

The simulation core is plain ES modules with no dependencies. The same code draws the
interactive pages and runs headless in Node to measure each comparison over many worlds. A
seed fully determines a run in both.

The habitats started life as single-file experiments in my `continual-learning-experiments`
repository. This is a rewrite of the parts that held up: one shared core, symbolic food
instead of pixel sprites, tests, and a harness whose numbers are the only ones quoted here.

## Quick start

Needs Node 22 or later (developed on Node 24). There are no runtime dependencies; the dev
dependencies are eslint, prettier and typescript for checking.

```sh
npm install
npm run serve        # http://localhost:8080  (PORT=3000 npm run serve to change it)
npm run check        # lint, format check, type check, tests
node harness/run.mjs --habitat seasons --seeds 8
```

The pages load ES modules, which browsers refuse to do from `file://`, so open them through
`npm run serve` or any other static server pointed at the repository root.

## The habitats

| Page                     | Baseline        | Changed creature | Question                                                             |
| ------------------------ | --------------- | ---------------- | -------------------------------------------------------------------- |
| `habitats/seasons.html`  | Simple          | Memory           | Does remembering past seasons beat relearning them every time?       |
| `habitats/planning.html` | Greedy          | Planner          | Does imagining a route beat walking straight at food?                |
| `habitats/movement.html` | Born knowing    | Learns movement  | What happens to a planner when its body stops working as it expects? |
| `habitats/winter.html`   | Unprepared      | Winter planner   | Can a creature learn that cold means famine, and sit it out?         |
| `habitats/danger.html`   | Gradual learner | Danger memory    | What should a creature do with a meal that nearly kills it?          |

Every page has play and pause, single step, four speeds, a seed field, reset, a live chart of
energy and cumulative deaths, each creature's current beliefs next to the truth, and an event
log. `?seed=42` in the address selects a world.

## Results

All figures below come from one command, run on Node 24.18 on macOS:

```sh
node harness/run.mjs --habitat all --seeds 8
```

That is 8 worlds per habitat (seeds 1 to 8), 12,000 steps each, which covers ten food
seasons, five winters and one rewiring. Totals are summed over the 8 worlds; averages are the
mean of the 8 per-world averages. The run takes about five seconds.

### Seasons and memory

|                                                 | Simple | Memory |
| ----------------------------------------------- | -----: | -----: |
| Deaths, total                                   |     15 |      0 |
| Average energy                                  |   69.8 |   85.6 |
| Good meals                                      |  64.7% |  70.2% |
| Surprise, first 15 meals of a new season        |   5.85 |   3.94 |
| Surprise, first 15 meals of a returning season  |   5.47 |   3.11 |
| Season memories at the end                      |    1.0 |    4.9 |
| Worlds where Memory died less often than Simple |        | 7 of 8 |

Surprise is the absolute prediction error on a meal. The memory creature is less surprised
after every change, and least when a season it has already lived through comes back. In the
one world where it did not die less often (seed 1), neither creature died at all.

### Planning a route

|                                                  | Greedy | Planner |
| ------------------------------------------------ | -----: | ------: |
| Deaths, total                                    |     88 |       2 |
| Average energy                                   |   44.9 |    80.5 |
| Good meals                                       |  67.5% |   85.2% |
| Bad meals eaten, total                           |    862 |     674 |
| Worlds where Planner died less often than Greedy |        |  8 of 8 |

Both creatures have the same memory. The planner still eats bad food, mostly while its
beliefs are wrong just after a season change.

### Learning to move

|                                                                  | Born knowing | Learns movement |
| ---------------------------------------------------------------- | -----------: | --------------: |
| Deaths before the rewiring, total                                |            1 |               3 |
| Deaths after the rewiring, total                                 |           86 |               2 |
| Average energy before the rewiring                               |         84.3 |            84.8 |
| Average energy after the rewiring                                |         33.0 |            82.3 |
| Moves that landed somewhere unexpected after the rewiring, total |        44931 |             280 |
| Worlds where Learns movement died less often than Born knowing   |              |          8 of 8 |

Before the rewiring at step 6,000 the two are about level, so learning movement from scratch
costs little here. After it, the creature that cannot revise its idea of its own body plans
routes that do not work.

### Planning for winter

|                                                             | Unprepared | Winter planner |
| ----------------------------------------------------------- | ---------: | -------------: |
| Deaths, total                                               |         32 |              4 |
| Deaths in winter, total                                     |         13 |              2 |
| Average energy                                              |       71.6 |           76.9 |
| Steps hibernating, per world                                |          0 |           3289 |
| Worlds where Winter planner died less often than Unprepared |            |         8 of 8 |

Winter takes 4,000 of the 12,000 steps. Only 13 of the unprepared creature's 32 deaths fall
inside winter itself. I have not measured when the others happen; a creature leaving winter
with little energy into a world still regrowing is the likely cause.

### One-trial danger memory

|                                                                 | Gradual learner | Danger memory |
| --------------------------------------------------------------- | --------------: | ------------: |
| Deaths, total                                                   |             206 |            70 |
| Deadly meals eaten, total                                       |              78 |            26 |
| Deaths from a deadly meal, total                                |              73 |            17 |
| Average energy                                                  |            33.8 |          49.6 |
| Good meals                                                      |           61.7% |         72.5% |
| Worlds where Danger memory died less often than Gradual learner |                 |        8 of 8 |

The danger memory cuts deadly meals to three or four per world, and there are three deadly
foods to meet. It does not make this world safe: 53 of its 70 deaths are not from a deadly meal. I have not
isolated the cause. The likely one is that the deadly food would otherwise be one of the few
good foods each season, so less is left to eat.

Other options: `--steps N`, `--first-seed N`, `--json` for the per-seed summaries, and
`--habitat <name>` for one habitat.

## How it works

```
src/core/      simulation, no DOM, no Node APIs
  rng.js         seeded generator (mulberry32)
  foods.js       colours, shapes, seasons, the deadly food
  mind.js        food beliefs: simple, memory, danger memory
  movement.js    innate and learned models of the four buttons
  planner.js     breadth-first route search over imagined presses
  weather.js     winters, temperature, the learned forecast
  creature.js    body, drives, and how abilities combine into one step
  world.js       grid, food, physics, eating, death, statistics
  habitats.js    the five habitats as data
  experiment.js  two variants in lockstep; per-world summary
  report.js      aggregation over seeds; the Markdown table
src/ui/        page controller, canvas drawing, chart, stylesheet
habitats/      one HTML page per habitat
harness/       command-line runner
scripts/       static server
test/          node:test suites
```

**The world.** A 24 by 24 grid holding 22 pieces of food. A food has one of three colours and
one of two shapes and is worth its colour's value plus its shape's value, plus a little noise.
Both values change every 1,200 steps. Food rots at random and regrows elsewhere, which stops
poison piling up while the good food gets eaten. A creature sees 7 cells each way, spends 0.12
energy per step out of a maximum of 100, and dies at zero. It then reappears elsewhere at 60
energy with its memories, so a run measures how often a mind fails, not how long a body lasts.

**Beliefs.** Every creature predicts a food's value as a colour weight plus a shape weight, so
it can guess a combination it has never eaten. The simple mind keeps one set of weights and a
fixed learning rate. The memory mind learns faster from surprising meals, holds a big surprise
aside rather than writing it in, and after two in a row decides whether an old set of weights
explains them (recall) or a new one is needed. Every 400 steps it sleeps for 25, replays recent
meals and merges sets of weights that agree.

**Drives.** Appeal is predicted value plus a curiosity bonus that shrinks with experience. A
hungry creature is also drawn to foods it has not eaten for a while. That second drive was
added after the first planner starved beside good food: it only ate what it believed was good,
so once its beliefs drifted wrong it never tested them. Every creature has it, baselines
included.

**Planning.** The planner runs a breadth-first search over button presses using the creature's
own movement model. Food it believes is bad is treated as a wall, because stepping on food eats
it. Each visible food scores its appeal minus 0.35 per step of route; the search stops once no
longer route could win. It replans every 4 steps and whenever a move lands somewhere it did not
expect.

**Movement.** Buttons are wired to directions; walls block; ice slides one extra cell. The
innate model holds the birth wiring and the true ground rules forever. The learned model keeps
fading counts of which way each button moved the creature and what each kind of ground did.

**Winter.** Temperature follows a yearly cosine. The forecaster buckets it into eight levels,
rising or falling, and learns the average food in sight per bucket and which bucket follows
200 steps later. Famine now with nothing worth eating in sight means hibernate at 0.035 energy
per step. Famine forecast means the distance cost drops from 0.35 to 0.1.

**Determinism.** Each world owns one generator. Ground, wiring and the first food are drawn
before anything depends on the creature, so both variants of a seed start in the same world.
After that the streams diverge as the creatures eat different food. The page uses
`Math.random` only to pick a new seed.

## Checks

```sh
npm run lint          # eslint
npm run format:check  # prettier
npm run typecheck     # tsc --checkJs, strict, over src, harness, scripts and tests
npm test              # node:test
```

The tests cover the generator, the belief rules (holding surprises, recall, sleep, danger
memory), movement and relearning after a rewiring, eating, energy, death and respawn, seasons,
winters, the planner, determinism of every habitat, that every variant runs with the world
staying valid, the harness output, the static server, and the page controller driven through a
small fake DOM.

## Limitations

- The constants were tuned by hand. In particular winter was lengthened from 500 to 800 steps
  after shorter winters showed almost no gap between the two creatures, so the winter result
  says the ability helps when winters are harsh, not that it always helps.
- Eight worlds and no confidence intervals. The direction of each result is consistent across
  seeds; the sizes are rough.
- One creature per world. There is no competition and no learning from others.
- Baselines are deliberately limited. The greedy creature cannot route around a wall at all,
  and the born-knowing planner cannot revise its wiring, so those two habitats show the cost
  of lacking an ability rather than a close race.
- The memory creature ends a run holding about five season memories for three seasons. Sleep
  merges some duplicates, not all.
- Food is symbolic (a colour index and a shape index). Nothing here learns from pixels.
- Death is a respawn with memories kept. Deaths count failures of a mind; they are not
  generations and nothing evolves.
- The pages are checked by tests that drive the controller with a fake DOM and count canvas
  calls. There are no screenshot tests, so layout and drawing are verified by eye only.
- Results were measured on one machine and one Node version. The core uses `Math.cos`, whose
  last bit can in principle differ between engines, which could change a run.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
