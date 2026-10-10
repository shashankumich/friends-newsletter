// A pretend GitHub API for trying the Studio offline and for tests. It implements just the endpoints
// the Studio uses (Git Data, Actions runs, Pages), keeps everything in memory, and never touches disk
// after loading the starting content. Deploys "run" on a timer: queued, then building, then success.
//
//   import { startMockGitHub } from './mock-github.mjs';
//   const mock = await startMockGitHub({ port: 8081, contentDir: 'content' });
//
// Any bearer token works except "bad" (401) and "readonly" (403 on writes).

import http from 'node:http';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sha1 = s => createHash('sha1').update(s).digest('hex');

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full, base));
    else if (!e.name.startsWith('.')) out.push(full);
  }
  return out;
}

export async function startMockGitHub({ port = 0, contentDir, owner = 'you', repo = 'friends-newsletter', branch = 'master', siteUrl = 'http://localhost:8080/', deploySeconds = [2, 5, 8] } = {}) {
  const blobs = new Map();   // sha -> Buffer
  const trees = new Map();   // sha -> Map(path -> blob sha)
  const commits = new Map(); // sha -> { sha, tree, parents, message, date }
  const refs = new Map();
  const runs = [];
  let failNextRefUpdate = false;

  const putBlob = buf => { const s = sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])); blobs.set(s, buf); return s; };
  const putTree = map => { const s = sha1(JSON.stringify([...map].sort())); trees.set(s, new Map(map)); return s; };
  const putCommit = (tree, parents, message) => {
    const c = { sha: sha1(JSON.stringify([tree, parents, message, Date.now(), Math.random()])), tree, parents, message, date: new Date().toISOString() };
    commits.set(c.sha, c);
    return c;
  };

  const start = new Map();
  if (contentDir) {
    for (const file of await walk(contentDir)) {
      start.set(`content/${path.relative(contentDir, file).split(path.sep).join('/')}`, putBlob(await readFile(file)));
    }
  }
  const root = putCommit(putTree(start), [], 'Initial content');
  refs.set(branch, root.sha);

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = req => new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { resolve({}); } });
  });

  const runState = run => {
    const age = (Date.now() - run.created) / 1000;
    const [q, b, d] = deploySeconds;
    if (age < q) return { status: 'queued', conclusion: null, jobs: [['build', 'queued'], ['deploy', 'queued']] };
    if (age < b) return { status: 'in_progress', conclusion: null, jobs: [['build', 'in_progress'], ['deploy', 'queued']] };
    if (age < d) return { status: 'in_progress', conclusion: null, jobs: [['build', 'completed'], ['deploy', 'in_progress']] };
    return { status: 'completed', conclusion: 'success', jobs: [['build', 'completed'], ['deploy', 'completed']] };
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-GitHub-Api-Version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://mock');
    const p = url.pathname;

    // Test hooks.
    if (p === '/__mock/files') {
      const tree = trees.get(commits.get(refs.get(branch)).tree);
      const want = url.searchParams.get('path');
      if (want) return tree.has(want) ? (res.writeHead(200), res.end(blobs.get(tree.get(want)))) : json(res, 404, {});
      return json(res, 200, { head: refs.get(branch), message: commits.get(refs.get(branch)).message, files: [...tree.keys()].sort() });
    }
    if (p === '/__mock/fail-next-ref-update') { failNextRefUpdate = true; return json(res, 200, { ok: true }); }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || token === 'bad') return json(res, 401, { message: 'Bad credentials' });
    const write = req.method !== 'GET';
    if (write && token === 'readonly') return json(res, 403, { message: 'Resource not accessible by personal access token' });

    if (p === '/user') return json(res, 200, { login: 'you', name: 'You (mock)' });
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(p);
    if (!m) return json(res, 404, { message: 'Not Found' });
    if (m[1] !== owner || m[2] !== repo) return json(res, 404, { message: 'Not Found' });
    const rest = m[3] || '';
    let g;

    if (!rest) return json(res, 200, { full_name: `${owner}/${repo}`, default_branch: branch, private: false, html_url: `https://github.com/${owner}/${repo}`, permissions: { admin: true, push: token !== 'readonly', pull: true } });
    if ((g = /^\/git\/ref\/heads\/(.+)$/.exec(rest)) && req.method === 'GET') {
      const sha = refs.get(decodeURIComponent(g[1]));
      return sha ? json(res, 200, { ref: `refs/heads/${g[1]}`, object: { sha, type: 'commit' } }) : json(res, 404, { message: 'Not Found' });
    }
    if ((g = /^\/git\/commits\/(\w+)$/.exec(rest)) && req.method === 'GET') {
      const c = commits.get(g[1]);
      return c ? json(res, 200, { sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map(sha => ({ sha })), message: c.message, committer: { date: c.date } }) : json(res, 404, { message: 'Not Found' });
    }
    if ((g = /^\/git\/trees\/(\w+)$/.exec(rest)) && req.method === 'GET') {
      const t = trees.get(g[1]);
      if (!t) return json(res, 404, { message: 'Not Found' });
      return json(res, 200, { sha: g[1], truncated: false, tree: [...t].map(([pth, sha]) => ({ path: pth, mode: '100644', type: 'blob', sha, size: blobs.get(sha).length })) });
    }
    if ((g = /^\/git\/blobs\/(\w+)$/.exec(rest)) && req.method === 'GET') {
      const b = blobs.get(g[1]);
      return b ? json(res, 200, { sha: g[1], size: b.length, encoding: 'base64', content: b.toString('base64').replace(/.{60}/g, '$&\n') }) : json(res, 404, { message: 'Not Found' });
    }
    if (rest === '/git/blobs' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 201, { sha: putBlob(Buffer.from(body.content || '', body.encoding === 'base64' ? 'base64' : 'utf8')) });
    }
    if (rest === '/git/trees' && req.method === 'POST') {
      const body = await readBody(req);
      const base = body.base_tree ? trees.get(body.base_tree) : new Map();
      if (!base) return json(res, 422, { message: 'Invalid base_tree' });
      const next = new Map(base);
      for (const e of body.tree || []) {
        if (e.sha === null) {
          if (!next.has(e.path)) return json(res, 422, { message: `Path ${e.path} does not exist in base tree` });
          next.delete(e.path);
        } else if (e.content !== undefined) next.set(e.path, putBlob(Buffer.from(e.content)));
        else if (blobs.has(e.sha)) next.set(e.path, e.sha);
        else return json(res, 422, { message: `Unknown blob ${e.sha}` });
      }
      return json(res, 201, { sha: putTree(next) });
    }
    if (rest === '/git/commits' && req.method === 'POST') {
      const body = await readBody(req);
      if (!trees.has(body.tree)) return json(res, 422, { message: 'Invalid tree' });
      const c = putCommit(body.tree, body.parents || [], body.message || '');
      return json(res, 201, { sha: c.sha, html_url: `https://github.com/${owner}/${repo}/commit/${c.sha}`, tree: { sha: c.tree } });
    }
    if ((g = /^\/git\/refs\/heads\/(.+)$/.exec(rest)) && req.method === 'PATCH') {
      const body = await readBody(req);
      const name = decodeURIComponent(g[1]);
      const c = commits.get(body.sha);
      if (!c) return json(res, 422, { message: 'Object does not exist' });
      if (failNextRefUpdate) {
        // Simulate another device saving first: move the branch, then refuse this update.
        failNextRefUpdate = false;
        const other = putCommit(commits.get(refs.get(name)).tree, [refs.get(name)], 'Saved from another device');
        refs.set(name, other.sha);
      }
      if (!body.force && !c.parents.includes(refs.get(name))) return json(res, 422, { message: 'Update is not a fast forward' });
      refs.set(name, c.sha);
      runs.unshift({ id: runs.length + 1, head_sha: c.sha, created: Date.now() });
      return json(res, 200, { ref: `refs/heads/${name}`, object: { sha: c.sha } });
    }
    if (rest === '/actions/runs' && req.method === 'GET') {
      const sha = url.searchParams.get('head_sha');
      const list = runs.filter(r => !sha || r.head_sha === sha).map(r => ({
        id: r.id, name: 'Deploy to GitHub Pages', path: '.github/workflows/deploy.yml', head_sha: r.head_sha,
        html_url: `https://github.com/${owner}/${repo}/actions/runs/${r.id}`, ...runState(r), jobs: undefined,
      }));
      return json(res, 200, { total_count: list.length, workflow_runs: list });
    }
    if ((g = /^\/actions\/runs\/(\d+)\/jobs$/.exec(rest)) && req.method === 'GET') {
      const r = runs.find(x => x.id === Number(g[1]));
      if (!r) return json(res, 404, { message: 'Not Found' });
      return json(res, 200, { jobs: runState(r).jobs.map(([name, status]) => ({ name, status })) });
    }
    if (rest === '/pages') return json(res, 200, { html_url: siteUrl, build_type: 'workflow', status: 'built' });
    return json(res, 404, { message: 'Not Found' });
  });

  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, owner, repo, branch,
    close: () => new Promise(resolve => server.close(resolve)),
    head: () => refs.get(branch),
  };
}
