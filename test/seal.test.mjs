import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveKey, seal, unseal, exportKey, importKey, normalizePasscode, sealSalt } from '../src/seal.js';
import { whatsappText, emailParts } from '../src/share.js';
import { build } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'test/fixtures/content');
const salt = sealSalt('shashankumich/friends-newsletter');

test('a sealed text opens with the passcode, however it is typed', async () => {
  assert.equal(normalizePasscode(' Par Avion '), 'paravion');
  const box = await seal(await deriveKey('paravion', salt), 'Dear Priya,', salt);
  assert.doesNotMatch(JSON.stringify(box), /Priya/);
  assert.equal(await unseal(await deriveKey('PARAVION', salt), box), 'Dear Priya,');
  assert.equal(await unseal(await deriveKey('par avion', salt), box), 'Dear Priya,');
  await assert.rejects(unseal(await deriveKey('suitup', salt), box));
});

test('a remembered key opens the next page without the passcode', async () => {
  const key = await deriveKey('paravion', salt);
  const box = await seal(key, 'No. 02', salt);
  assert.equal(await unseal(await importKey(await exportKey(key)), box), 'No. 02');
});

test('messages carry the passcode when the site is sealed', () => {
  const site = JSON.parse(readFileSync(path.join(FIXTURES, 'site.json')));
  const issue = JSON.parse(readFileSync(path.join(FIXTURES, 'issues/01/issue.json')));
  const wa = whatsappText({ site, issue, url: 'https://x.test/issues/01/', passcode: 'paravion' });
  assert.match(wa, /https:\/\/x\.test\/issues\/01\/\n🔑 Passcode: \*paravion\*/);
  assert.doesNotMatch(whatsappText({ site, issue, url: 'u' }), /Passcode/);
  const mail = emailParts({ site, issue, url: 'u', passcode: 'paravion' });
  assert.match(mail.text, /Passcode: paravion/);
  assert.match(mail.html, /PASSCODE &nbsp;<b[^>]*>paravion<\/b>/);
});

/* ---------- a sealed build ---------- */

let tmp, out;
before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'postcards-seal-'));
  out = path.join(tmp, 'dist');
  await cp(FIXTURES, path.join(tmp, 'content'), { recursive: true });
  await build({ contentDir: path.join(tmp, 'content'), outDir: out, siteUrl: 'https://example.github.io/friends-newsletter', passcode: 'paravion', log: () => {} });
});
after(() => rm(tmp, { recursive: true, force: true }));

const html = f => readFile(path.join(out, f), 'utf8');
const payload = page => JSON.parse(/<script type="application\/json" id="pc-sealed">([\s\S]*?)<\/script>/.exec(page)[1].replace(/\\u003c/g, '<'));

test('issue, home and archive pages hold nothing readable without the passcode', async () => {
  for (const f of ['index.html', 'issues/01/index.html', 'archive/index.html']) {
    const page = await html(f);
    assert.match(page, /<body[^>]* data-sealed>/, f);
    assert.match(page, /A postcard for you/, f);
    assert.doesNotMatch(page, /Work swallowed most of the summer|data-pc-name=|Who's awake/, f);
    assert.match(page, /assets\/gate\.js\?v=/, f);
  }
});

test('link previews still show the cover', async () => {
  const page = await html('issues/01/index.html');
  assert.match(page, /<meta property="og:title" content="Greetings from Lisbon">/);
  assert.match(page, /<meta property="og:image" content="https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\/media\/cover\.webp">/);
});

test('the passcode opens the real page, and build.json lets the Studio check it', async () => {
  const key = await deriveKey('paravion', salt);
  const opened = await unseal(key, payload(await html('issues/01/index.html')));
  assert.match(opened, /Work swallowed most of the summer/);
  assert.match(opened, /id="pc-data"/);
  const info = JSON.parse(await html('build.json'));
  assert.equal(info.sealed.salt, salt);
  assert.equal(await unseal(key, info.sealed.check), 'postcards');
});

test('the Studio and the 404 page stay open', async () => {
  assert.doesNotMatch(await html('studio/index.html'), /data-sealed/);
  assert.doesNotMatch(await html('404.html'), /data-sealed/);
  assert.ok(existsSync(path.join(out, 'assets/gate.js')));
  assert.ok(existsSync(path.join(out, 'assets/seal.js')));
});

test('without a passcode nothing is sealed', async () => {
  const open = path.join(tmp, 'dist-open');
  await build({ contentDir: path.join(tmp, 'content'), outDir: open, passcode: '', log: () => {} });
  const page = await readFile(path.join(open, 'issues/01/index.html'), 'utf8');
  assert.doesNotMatch(page, /data-sealed|gate\.js/);
  assert.equal(JSON.parse(await readFile(path.join(open, 'build.json'), 'utf8')).sealed, null);
  assert.ok((await readdir(open)).includes('index.html'));
});
