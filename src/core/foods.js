// Food and the seasons that decide what each food is worth.
//
// A food has a colour and a shape. Its energy value is the sum of a colour
// part and a shape part, and both parts change with the season. A creature
// that learns the two parts separately can guess combinations it never ate.

export const COLOURS = ['amber', 'blue', 'violet'];
export const SHAPES = ['circle', 'square'];

/** Steps between season changes. */
export const SEASON_LENGTH = 1200;

/** Energy cost of the one deadly food per season, in habitats that have one. */
export const DEADLY_VALUE = -80;

/**
 * @typedef {object} Season
 * @property {string} name
 * @property {number[]} colour Value of each colour.
 * @property {number[]} shape Value of each shape.
 * @property {[number, number]} deadly Colour and shape of the deadly food. It is
 *   chosen to look good by the colour-plus-shape rule, so it is a true exception.
 */

/** @type {Season[]} */
export const SEASONS = [
  { name: 'amber season', colour: [6, -6, 0], shape: [2, -2], deadly: [0, 1] },
  { name: 'blue season', colour: [-6, 6, 0], shape: [2, -2], deadly: [1, 1] },
  { name: 'violet season', colour: [-3, -3, 6], shape: [-2, 2], deadly: [2, 0] },
];

/**
 * @param {number} t Step number.
 * @returns {number} Index into SEASONS.
 */
export function seasonIndexAt(t) {
  return Math.floor(t / SEASON_LENGTH) % SEASONS.length;
}

/**
 * @param {Season} season
 * @param {number} colour
 * @param {number} shape
 * @returns {number} The energy a food gives this season, before noise.
 */
export function foodValue(season, colour, shape) {
  return season.colour[colour] + season.shape[shape];
}

/**
 * @param {Season} season
 * @param {number} colour
 * @param {number} shape
 * @returns {boolean}
 */
export function isDeadly(season, colour, shape) {
  return season.deadly[0] === colour && season.deadly[1] === shape;
}

/**
 * @param {number} colour
 * @param {number} shape
 * @returns {string}
 */
export function foodName(colour, shape) {
  return `${COLOURS[colour]} ${SHAPES[shape]}`;
}
