import { test, before, after } from 'node:test';
// The tests use the frozen Lisbon sample in test/fixtures/content, never the real content/.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://example.github.io/friends-newsletter';
let tmp, content, out;

async function files(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...await files(p)); else list.push(p);
  }
  return list;
}

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'postcards-'));
  content = path.join(tmp, 'content');
  out = path.join(tmp, 'dist');
  await cp(path.join(ROOT, 'test/fixtures/content'), content, { recursive: true });
  // A draft No. 02 that must not be published.
  const draft = JSON.parse(await readFile(path.join(content, 'issues/01/issue.json'), 'utf8'));
  Object.assign(draft, { number: 2, status: 'draft' });
  draft.cover.place = 'Secret draft place';
  await cp(path.join(content, 'issues/01'), path.join(content, 'issues/02'), { recursive: true });
  await writeFile(path.join(content, 'issues/02/issue.json'), JSON.stringify(draft));
  await build({ contentDir: content, outDir: out, siteUrl: SITE, sha: 'abc123', log: () => {} });
});
after(() => rm(tmp, { recursive: true, force: true }));

test('writes the home page, issue pages, archive, studio and plumbing', () => {
  for (const f of ['index.html', 'issues/01/index.html', 'issues/01/media/cover.webp', 'issues/index.html', 'archive/index.html', 'studio/index.html', '404.html', 'robots.txt', 'build.json', '.nojekyll', 'assets/issue.css', 'assets/issue.js', 'assets/render.js', 'assets/studio.js']) {
    assert.ok(existsSync(path.join(out, f)), f);
  }
});

test('drafts stay out of the site', async () => {
  assert.equal(existsSync(path.join(out, 'issues/02')), false);
  for (const f of await files(out)) {
    if (/\.(html|json)$/.test(f)) assert.doesNotMatch(await readFile(f, 'utf8'), /Secret draft place/, path.relative(out, f));
  }
});

test('every page asks search engines to stay away', async () => {
  assert.equal(await readFile(path.join(out, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  for (const f of (await files(out)).filter(f => f.endsWith('.html'))) {
    assert.match(await readFile(f, 'utf8'), /<meta name="robots" content="noindex/, path.relative(out, f));
  }
});

test('the home page is the latest issue, with absolute Open Graph tags', async () => {
  const home = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /Greetings from Lisbon/);
  assert.match(home, new RegExp(`<meta property="og:url" content="${SITE}/issues/01/">`));
  assert.match(home, new RegExp(`<meta property="og:image" content="${SITE}/issues/01/media/cover\\.webp">`));
});

test('every local link and asset on every page exists', async () => {
  for (const f of (await files(out)).filter(f => f.endsWith('.html') && !f.endsWith('404.html'))) {
    const html = await readFile(f, 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^(https?:|mailto:|data:|\/\/)/.test(url)) continue;
      const clean = decodeURI(url.split('?')[0]).replace(/&amp;/g, '&');
      let target = path.resolve(path.dirname(f), clean);
      if (clean.endsWith('/') || clean === '') target = path.join(target, 'index.html');
      assert.ok(existsSync(target), `${path.relative(out, f)} → ${url}`);
    }
  }
});

test('module imports carry the asset version', async () => {
  const studio = await readFile(path.join(out, 'assets/studio.js'), 'utf8');
  const v = JSON.parse(await readFile(path.join(out, 'build.json'), 'utf8'));
  assert.equal(v.sha, 'abc123');
  assert.match(studio, /from '\.\/render\.js\?v=[0-9a-f]{10}'/);
  const page = await readFile(path.join(out, 'studio/index.html'), 'utf8');
  assert.match(page, /"repo":"shashankumich\/friends-newsletter"/);
  assert.doesNotMatch(page, /%V%|%FONTS%|%CONFIG%/);
});

test('the 404 page works from any depth', async () => {
  const html = await readFile(path.join(out, '404.html'), 'utf8');
  assert.match(html, /href="\/friends-newsletter\/assets\/issue\.css/);
});

test('a published issue with a missing photo stops the build', async () => {
  const broken = path.join(tmp, 'broken');
  await cp(content, broken, { recursive: true });
  await rm(path.join(broken, 'issues/01/media/roll-3.webp'));
  await assert.rejects(build({ contentDir: broken, outDir: path.join(tmp, 'dist-broken'), log: () => {} }), /roll-3\.webp/);
});

test('an issue in the wrong folder stops the build', async () => {
  const wrong = path.join(tmp, 'wrong');
  await cp(content, wrong, { recursive: true });
  const i = JSON.parse(await readFile(path.join(wrong, 'issues/01/issue.json'), 'utf8'));
  i.number = 7;
  await writeFile(path.join(wrong, 'issues/01/issue.json'), JSON.stringify(i));
  await assert.rejects(build({ contentDir: wrong, outDir: path.join(tmp, 'dist-wrong'), log: () => {} }), /folder should be issues\/07/);
});

test('with nothing published, the home page says the first one is coming', async () => {
  const none = path.join(tmp, 'none');
  await cp(content, none, { recursive: true });
  const i = JSON.parse(await readFile(path.join(none, 'issues/01/issue.json'), 'utf8'));
  i.status = 'draft';
  await writeFile(path.join(none, 'issues/01/issue.json'), JSON.stringify(i));
  const dist = path.join(tmp, 'dist-none');
  const res = await build({ contentDir: none, outDir: dist, log: () => {} });
  assert.deepEqual(res.published, []);
  assert.match(await readFile(path.join(dist, 'index.html'), 'utf8'), /The first postcard is on its way/);
});
