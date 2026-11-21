import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HABITATS } from '../src/core/habitats.js';
import { resolvePath, serve } from '../scripts/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (/** @type {string} */ path) => readFileSync(resolve(ROOT, path), 'utf8');

test('the index links every habitat by its title and question', () => {
  const index = read('index.html');
  for (const habitat of HABITATS) {
    assert.ok(index.includes(`href="habitats/${habitat.id}.html"`), habitat.id);
    assert.ok(index.includes(habitat.title), habitat.title);
    assert.ok(index.includes(habitat.question), habitat.question);
    for (const variant of habitat.variants) assert.ok(index.includes(variant.label));
  }
});

for (const habitat of HABITATS) {
  test(`${habitat.id}: the page mounts its own habitat and explains it`, () => {
    const path = `habitats/${habitat.id}.html`;
    const html = read(path);
    assert.match(html, new RegExp(`mount\\('${habitat.id}'\\)`));
    assert.ok(html.includes(`<h1>${habitat.title}</h1>`));
    assert.ok(html.includes('data-app'));
    assert.match(html, /<meta name="viewport"/);
    const lede = /<p class="lede">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
    assert.ok(lede.split(/\s+/).length > 80, 'has a real explanation');
    for (const variant of habitat.variants) {
      assert.ok(lede.toLowerCase().includes(variant.label.toLowerCase()), variant.label);
    }
    // Every local file the page points at exists.
    for (const [, target] of html.matchAll(/(?:href|src|from)\s*=?\s*["']([^"'#]+)["']/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      assert.ok(existsSync(resolve(ROOT, dirname(path), target)), `${path} -> ${target}`);
    }
  });
}

test('the server refuses paths outside the pages and their sources', () => {
  assert.ok(resolvePath('/')?.endsWith('index.html'));
  assert.ok(resolvePath('/src/core/world.js'));
  assert.equal(resolvePath('/package.json'), null);
  assert.equal(resolvePath('/../../etc/passwd'), null);
  assert.equal(resolvePath('/src/../../secret'), null);
  assert.equal(resolvePath('/%2e%2e/%2e%2e/etc/passwd'), null);
  assert.equal(resolvePath('/%E0%A4%A'), null);
  assert.equal(resolvePath('/.git/config'), null);
});

/** @type {import('node:http').Server} */
let server;
let origin = '';

before(async () => {
  server = await serve(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((done) => server.close(done)));

test('the server serves the index, the pages and the modules with the right types', async () => {
  const index = await fetch(`${origin}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await index.text(), /Artificial life habitats/);

  for (const habitat of HABITATS) {
    const page = await fetch(`${origin}/habitats/${habitat.id}.html?seed=3`);
    assert.equal(page.status, 200);
    await page.arrayBuffer();
  }
  const script = await fetch(`${origin}/src/ui/app.js`);
  assert.match(script.headers.get('content-type') ?? '', /text\/javascript/);
  await script.arrayBuffer();
  const css = await fetch(`${origin}/src/ui/styles.css`);
  assert.match(css.headers.get('content-type') ?? '', /text\/css/);
  await css.arrayBuffer();
});

test('the server answers 404 for what is missing or private and 405 for writes', async () => {
  for (const path of ['/nope.html', '/package.json', '/src/core/missing.js']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    await response.arrayBuffer();
  }
  const post = await fetch(`${origin}/`, { method: 'POST' });
  assert.equal(post.status, 405);
  await post.arrayBuffer();
});

test('every module the pages load can be reached through its imports', () => {
  /** @type {Set<string>} */
  const seen = new Set();
  const visit = (/** @type {string} */ file) => {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(existsSync(file), file);
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      visit(resolve(dirname(file), target));
    }
  };
  visit(resolve(ROOT, 'src/ui/app.js'));
  assert.ok(seen.size > 10);
  for (const file of seen) {
    assert.ok(!/node:|require\(/.test(readFileSync(file, 'utf8')), `${file} must run in a browser`);
  }
});
