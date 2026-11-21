// Colours the canvases share with the stylesheet. They are read from the CSS
// custom properties so there is one place to change them.

const FALLBACK = {
  canvas: '#0c0f0e',
  line: '#1f2523',
  lineStrong: '#2e3633',
  text: '#dce1de',
  muted: '#7b8480',
  faint: '#4d5552',
  accent: '#4ade80',
  baseline: '#b9c1bd',
  amber: '#e3a23a',
  blue: '#5aa2f2',
  violet: '#b388f5',
  wall: '#2a312e',
  ice: '#16252f',
  frost: '#9cc4e8',
};

/** @typedef {typeof FALLBACK} Theme */

/**
 * @param {Pick<Window, 'getComputedStyle'> | undefined} view
 * @param {Element | undefined} element
 * @returns {Theme}
 */
export function readTheme(view, element) {
  const theme = { ...FALLBACK };
  if (!view || !element) return theme;
  const style = view.getComputedStyle(element);
  for (const key of /** @type {(keyof Theme)[]} */ (Object.keys(theme))) {
    const property = `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    const value = String(style.getPropertyValue(property) ?? '').trim();
    if (value) theme[key] = value;
  }
  return theme;
}

/**
 * @param {Theme} theme
 * @returns {string[]} Food colours in the order of COLOURS in the core.
 */
export function foodColours(theme) {
  return [theme.amber, theme.blue, theme.violet];
}

/**
 * @param {Theme} theme
 * @returns {string[]} One colour per variant: neutral baseline, green for the changed one.
 */
export function variantColours(theme) {
  return [theme.baseline, theme.accent];
}
