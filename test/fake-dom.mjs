// A very small stand-in for the browser, enough to run the page controller in
// Node. Elements are created from the data-* hooks found in the markup the
// app writes, so a selector with no matching markup fails loudly.

/** A 2D context that accepts every call and counts them. */
function fakeContext() {
  const calls = { count: 0 };
  const context = new Proxy(
    {},
    {
      get: (_, name) => (name === 'calls' ? calls : () => void calls.count++),
      set: () => true,
    },
  );
  return { context, calls };
}

export class FakeElement {
  /** @param {Record<string, string>} [dataset] */
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.clientWidth = 480;
    this.clientHeight = 260;
    this.width = 0;
    this.height = 0;
    /** @type {Record<string, string>} */
    this.attributes = {};
    /** @type {Record<string, ((event: object) => void)[]>} */
    this.listeners = {};
    this.canvas = fakeContext();
  }

  /** @param {string} type @param {(event: object) => void} listener */
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  /** @param {string} type @param {object} [event] */
  fire(type, event = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  /** @param {string} name @param {string} value */
  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getContext() {
    return this.canvas.context;
  }
}

export class FakeRoot extends FakeElement {
  constructor() {
    super();
    /** @type {Map<string, FakeElement[]>} */
    this.found = new Map();
  }

  /**
   * @param {string} selector Only the form [data-name] is supported.
   * @returns {FakeElement[]}
   */
  querySelectorAll(selector) {
    const name = /^\[data-([a-z]+)\]$/.exec(selector)?.[1];
    if (!name) throw new Error(`Unsupported selector ${selector}`);
    const cached = this.found.get(name);
    if (cached) return cached;
    const pattern = new RegExp(`\\sdata-${name}(?:="([^"]*)")?[\\s>/]`, 'g');
    const elements = [...this.innerHTML.matchAll(pattern)].map(
      (match) => new FakeElement(match[1] === undefined ? {} : { [name]: match[1] }),
    );
    this.found.set(name, elements);
    return elements;
  }

  /** @param {string} selector */
  querySelector(selector) {
    const [first] = this.querySelectorAll(selector);
    if (!first) throw new Error(`Nothing in the markup matches ${selector}`);
    return first;
  }
}

/**
 * @param {string} [search] The query string of the page.
 */
export function fakeEnv(search = '') {
  const root = new FakeRoot();
  /** @type {FrameRequestCallback[]} */
  const frames = [];
  /** @type {string[]} */
  const urls = [];
  const env = {
    document: {
      /** @param {string} selector */
      querySelector: (selector) => (selector === '[data-app]' ? root : null),
      documentElement: new FakeElement(),
    },
    /** @param {FrameRequestCallback} callback */
    requestAnimationFrame: (callback) => frames.push(callback),
    view: undefined,
    location: { search },
    history: {
      /** @param {unknown} _state @param {string} _title @param {string} url */
      replaceState: (_state, _title, url) => void urls.push(url),
    },
    devicePixelRatio: 2,
  };
  /** Run the next n animation frames. */
  const runFrames = (/** @type {number} */ n) => {
    for (let i = 0; i < n; i++) {
      const callback = frames.shift();
      if (!callback) throw new Error('No animation frame was requested');
      callback(0);
    }
  };
  return { env, root, runFrames, urls };
}
