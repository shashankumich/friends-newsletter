import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGroup, slugify, audienceFriends, scopeIssue, validateGroups } from '../src/schema.js';
import { renderIssueBody, renderIssuePage, renderArchivePage, forAudience, pageData } from '../src/render.js';
import { personalLinks, groupLink, issueUrl } from '../src/share.js';
import { build } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, 'content', p)));
const site = read('site.json');
const groups = [
  { id: 'college', name: 'College', salutation: 'college crew', slug: 'college-k3f9q' },
  { id: 'work', name: 'Work', salutation: 'work friends', slug: 'work-7pd2m' },
];
// Aiko and Priya are College, Lena and Amara are Work (Amara is in both), the rest are in no group.
const friends = read('friends.json').map(f => ({ ...f, groups: { Aiko: ['college'], Priya: ['college'], Lena: ['work'], Amara: ['work', 'college'] }[f.name] || [] }));
const issue = () => {
  const i = read('issues/01/issue.json');
  i.groups = { college: { ps: 'Reunion in March? *Say yes.*' } };
  i.mailbag.notes = [
    { text: 'Peaches.', name: 'Aiko', city: 'Tokyo', group: 'college' },
    { text: 'Jollof.', name: 'Amara', city: 'Lagos', group: 'work' },
    { text: 'Cherry soup.', name: 'Someone', city: 'Berlin' },
  ];
  return i;
};
const base = { site, friends, groups, issues: [issue()], root: '../../../' };
const college = forAudience(base, groups[0]);
const shared = forAudience(base);

test('group ids are unique slugs and every page slug has a random tail', () => {
  assert.equal(slugify('Lisbon Crew!'), 'lisbon-crew');
  assert.equal(slugify('Café Ñandú'), 'cafe-nandu');
  const a = newGroup('College', []);
  const b = newGroup('College', [a]);
  assert.equal(a.id, 'college');
  assert.equal(b.id, 'college-2');
  assert.match(a.slug, /^college-[a-z0-9]{3,}$/);
  assert.notEqual(a.slug, b.slug);
  assert.equal(a.salutation, 'College crew');
});

test('each audience gets its own friends', () => {
  assert.deepEqual(audienceFriends(friends, groups, 'college').map(f => f.name), ['Aiko', 'Priya', 'Amara']);
  assert.deepEqual(audienceFriends(friends, groups, 'work').map(f => f.name), ['Lena', 'Amara']);
  assert.deepEqual(audienceFriends(friends, groups, '').map(f => f.name), ['Marcus', 'Tomás', 'Ji-woo', 'Sam']);
  assert.equal(audienceFriends(friends, [], '').length, friends.length);
});

test('each audience sees its own P.S. and only its own replies', () => {
  const c = scopeIssue(issue(), 'college');
  assert.equal(c.letter.ps, 'Reunion in March? *Say yes.*');
  assert.deepEqual(c.mailbag.notes.map(n => n.name), ['Aiko', 'Someone']);
  const s = scopeIssue(issue(), '');
  assert.equal(s.letter.ps, '');
  assert.deepEqual(s.mailbag.notes.map(n => n.name), ['Someone']);
});

test('group problems are caught before the build', () => {
  assert.deepEqual(validateGroups(groups, friends), []);
  assert.ok(validateGroups(groups, [{ name: 'X', groups: ['nope'] }])[0].includes('"nope"'));
  assert.ok(validateGroups([groups[0], groups[0]], []).some(p => p.includes('twice')));
  assert.ok(validateGroups([{ id: 'Bad Id', name: 'Bad', slug: 'x' }], []).length >= 2);
});

test('a group page greets the group and shows only its friends and replies', () => {
  const html = renderIssueBody(issue(), college);
  assert.match(html, /data-fallback="college crew">Dear college crew,</);
  assert.match(html, /<aside class="letter-ps"[\s\S]*?<b>P\.S\.<\/b> Reunion in March\? <em>Say yes\.<\/em>/);
  for (const name of ['Aiko', 'Priya', 'Amara']) assert.match(html, new RegExp(`data-pc-name="${name}"`));
  for (const name of ['Lena', 'Marcus', 'Sam']) assert.doesNotMatch(html, new RegExp(`data-pc-name="${name}"`));
  assert.match(html, /Peaches\./);
  assert.match(html, /Cherry soup\./);
  assert.doesNotMatch(html, /Jollof\./);
  assert.deepEqual(pageData(scopeIssue(issue(), 'college'), college).friends.map(f => f.name), ['Aiko', 'Priya', 'Amara']);
  // The intro still counts everyone.
  assert.match(html, /A three-minute letter to 8 friends/);
});

test('group pages link to the group\'s own copies', () => {
  const html = renderIssuePage(issue(), { ...college, siteUrl: 'https://x.test/n' });
  assert.match(html, /<a class="brand" href="\.\.\/\.\.\/\.\.\/g\/college-k3f9q\/">/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/archive\/college-k3f9q\/">Archive/);
  assert.match(html, /<link rel="canonical" href="https:\/\/x\.test\/n\/issues\/01\/college-k3f9q\/">/);
  const arch = renderArchivePage({ ...college, root: '../../' });
  assert.match(arch, /href="\.\.\/\.\.\/issues\/01\/college-k3f9q\/"/);
});

test('the shared page never mentions a group', () => {
  const html = renderIssuePage(issue(), { ...shared, root: '../../' });
  for (const g of groups) assert.doesNotMatch(html, new RegExp(`${g.slug}|${g.salutation}`));
  assert.doesNotMatch(html, /letter-ps/);
  assert.doesNotMatch(html, /data-pc-name="Aiko"/);
  assert.match(html, /Dear friend,/);
});

test('share links point at the group page', () => {
  const rows = personalLinks({ friends: audienceFriends(friends, groups, 'work'), siteUrl: 'https://x.test/n', site, issue: issue(), slug: 'work-7pd2m' });
  assert.equal(rows[0].url, 'https://x.test/n/issues/01/work-7pd2m/?to=Lena');
  assert.equal(groupLink('https://x.test/n/', 'work-7pd2m'), 'https://x.test/n/g/work-7pd2m/');
  assert.equal(issueUrl('https://x.test/n', 1, '', 'work-7pd2m'), 'https://x.test/n/issues/01/work-7pd2m/');
});

/* ---------- the build ---------- */

let tmp, out;
before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'postcards-groups-'));
  const content = path.join(tmp, 'content');
  out = path.join(tmp, 'dist');
  await cp(path.join(ROOT, 'content'), content, { recursive: true });
  await writeFile(path.join(content, 'groups.json'), JSON.stringify(groups));
  await writeFile(path.join(content, 'friends.json'), JSON.stringify(friends));
  await writeFile(path.join(content, 'issues/01/issue.json'), JSON.stringify(issue()));
  await build({ contentDir: content, outDir: out, siteUrl: 'https://example.github.io/friends-newsletter', log: () => {} });
});
after(() => rm(tmp, { recursive: true, force: true }));

async function files(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...await files(p)); else list.push(p);
  }
  return list;
}

test('the build writes each group\'s issue, archive and permanent link', () => {
  for (const g of groups) {
    for (const f of [`issues/01/${g.slug}/index.html`, `archive/${g.slug}/index.html`, `g/${g.slug}/index.html`]) assert.ok(existsSync(path.join(out, f)), f);
  }
});

test('no shared page, archive or build.json reveals a group address', async () => {
  const groupDirs = groups.map(g => g.slug);
  for (const f of await files(out)) {
    if (!/\.(html|json|txt)$/.test(f) || groupDirs.some(s => f.includes(`${path.sep}${s}${path.sep}`))) continue;
    const text = await readFile(f, 'utf8');
    for (const s of groupDirs) assert.doesNotMatch(text, new RegExp(s), path.relative(out, f));
  }
});

test('the work page never names college-only friends', async () => {
  const html = await readFile(path.join(out, 'issues/01/work-7pd2m/index.html'), 'utf8');
  for (const name of ['Aiko', 'Priya']) assert.doesNotMatch(html, new RegExp(`"${name}"|>${name}<`));
  assert.match(html, /Dear work friends,/);
  assert.doesNotMatch(html, /Reunion in March/);
});

test('every link on a group page resolves', async () => {
  for (const rel of ['issues/01/college-k3f9q/index.html', 'g/college-k3f9q/index.html', 'archive/college-k3f9q/index.html']) {
    const f = path.join(out, rel);
    const html = await readFile(f, 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      const clean = decodeURI(url.split('?')[0]);
      let target = path.resolve(path.dirname(f), clean);
      if (clean.endsWith('/')) target = path.join(target, 'index.html');
      assert.ok(existsSync(target), `${rel} → ${url}`);
    }
  }
});

test('a friend in an unknown group stops the build', async () => {
  const bad = path.join(tmp, 'bad');
  await cp(path.join(tmp, 'content'), bad, { recursive: true });
  await writeFile(path.join(bad, 'friends.json'), JSON.stringify([{ name: 'Zed', groups: ['ghost'] }]));
  await assert.rejects(build({ contentDir: bad, outDir: path.join(tmp, 'dist-bad'), log: () => {} }), /"ghost"/);
});
