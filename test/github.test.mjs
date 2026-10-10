import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGitHub } from '../scripts/mock-github.mjs';
import { GitHub, waitForDeploy, toBase64, fromBase64 } from '../src/github.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let mock;
const gh = (token = 'test-token') => new GitHub({ token, owner: mock.owner, repo: mock.repo, branch: mock.branch, api: mock.url });
const files = async () => (await fetch(`${mock.url}/__mock/files`)).json();
const file = async p => Buffer.from(await (await fetch(`${mock.url}/__mock/files?path=${encodeURIComponent(p)}`)).arrayBuffer());

before(async () => { mock = await startMockGitHub({ contentDir: path.join(ROOT, 'test/fixtures/content'), deploySeconds: [0.2, 0.4, 0.6] }); });
after(() => mock.close());

test('base64 round-trips binary data', () => {
  const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test('reads the branch, the file list and file contents', async () => {
  const head = await gh().head();
  assert.match(head.sha, /^[0-9a-f]{40}$/);
  const list = await gh().files(head.tree);
  assert.ok(list.has('content/site.json'));
  assert.ok(list.has('content/issues/01/media/cover.webp'));
  const site = JSON.parse(await gh().text(list.get('content/site.json').sha));
  assert.equal(site.author, 'Shashank');
});

test('saves text, binary files and deletions in one commit', async () => {
  const before = (await files()).head;
  const photo = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 1, 2, 3, 255]);
  const res = await gh().commit({
    message: 'Draft No. 02',
    files: [
      { path: 'content/issues/02/issue.json', content: '{"number":2}\n' },
      { path: 'content/issues/02/media/cover-x.webp', content: new Blob([photo]) },
      { path: 'content/issues/01/media/roll-5.webp', delete: true },
      { path: 'content/issues/01/media/never-existed.webp', delete: true },
    ],
  });
  const after = await files();
  assert.equal(after.head, res.sha);
  assert.equal(res.parent, before);
  assert.equal(after.message, 'Draft No. 02');
  assert.ok(after.files.includes('content/issues/02/issue.json'));
  assert.ok(!after.files.includes('content/issues/01/media/roll-5.webp'));
  assert.deepEqual([...await file('content/issues/02/media/cover-x.webp')], [...photo]);
  assert.equal((await file('content/issues/02/issue.json')).toString(), '{"number":2}\n');
});

test('if another device saved first, the commit lands on top of it', async () => {
  await fetch(`${mock.url}/__mock/fail-next-ref-update`);
  const steps = [];
  const res = await gh().commit({ message: 'Edit No. 01', files: [{ path: 'content/site.json', content: '{"title":"Postcards","author":"S"}\n' }], onProgress: p => steps.push(p.step) });
  assert.ok(steps.includes('retry'));
  const after = await files();
  assert.equal(after.head, res.sha);
  assert.equal(JSON.parse(await file('content/site.json')).author, 'S');
});

test('bad and read-only tokens get plain-English errors', async () => {
  await assert.rejects(gh('bad').head(), e => e.status === 401 && /didn't accept that token/.test(e.message));
  await assert.rejects(gh('readonly').commit({ message: 'x', files: [{ path: 'a.txt', content: 'a' }] }), e => e.status === 403 && /Contents: Read and write/.test(e.message));
  const wrong = new GitHub({ token: 't', owner: 'someone', repo: 'else', api: mock.url });
  await assert.rejects(wrong.head(), e => e.status === 404);
});

test('follows a deploy from queued to live', async () => {
  const { sha } = await gh().commit({ message: 'Publish No. 02', files: [{ path: 'content/issues/02/issue.json', content: '{"number":2,"status":"published"}\n' }] });
  const seen = [];
  const result = await waitForDeploy(gh(), sha, { onStep: s => seen.push(s), interval: 100 });
  assert.equal(result, 'live');
  assert.ok(seen.includes('queued') || seen.includes('building'));
  assert.equal(seen.at(-1), 'live');
});

test('without Actions access, it watches the live build.json instead', async () => {
  const sha = 'f'.repeat(40);
  const noActions = { runs: async () => { const e = new Error('no'); e.status = 403; throw e; } };
  let calls = 0;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ sha: ++calls > 1 ? sha : 'old' }) });
  const result = await waitForDeploy(noActions, sha, { siteUrl: 'https://example.test', interval: 10, fetch: fakeFetch });
  assert.equal(result, 'live');
});
