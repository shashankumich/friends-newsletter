// A small GitHub REST client for the Studio. Reads the repo through the Git Data API and saves any
// number of changed files as one commit. Works in the browser and in Node (tests use a mock server).

export class GitHubError extends Error {
  constructor(message, status, detail = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.detail = detail;
  }
}

function explain(status, detail, path) {
  const msg = detail?.message || '';
  if (status === 401) return "GitHub didn't accept that token. It may have expired or been revoked. Make a new one and sign in again.";
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub says we hit its rate limit. Wait a few minutes and try again.';
  if (status === 403 && /\/actions\//.test(path)) return "This token can't read GitHub Actions, so deploy progress isn't available.";
  if (status === 403) return "This token isn't allowed to do that. It needs Contents: Read and write on this repository.";
  if (status === 404 && /\/git\/refs?\//.test(path)) return "Couldn't find that branch. Check the branch name in the sign-in settings.";
  if (status === 404) return "GitHub couldn't find the repository. Check its name, and that the token was given access to it.";
  if (status === 409) return 'The repository is empty or busy. Try again in a moment.';
  if (status === 422) return msg || 'GitHub rejected the change.';
  return msg || `GitHub returned an error (${status}).`;
}

/* ---------- bytes ---------- */

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function bytesOf(content) {
  if (content instanceof Uint8Array) return content;
  if (typeof content === 'string') return encoder.encode(content);
  if (content && typeof content.arrayBuffer === 'function') return new Uint8Array(await content.arrayBuffer());
  throw new TypeError('File content must be a string, Uint8Array or Blob.');
}

/* ---------- client ---------- */

export class GitHub {
  constructor({ token, owner, repo, branch = 'main', api = 'https://api.github.com', fetch: f } = {}) {
    Object.assign(this, { token, owner, repo, branch, api: api.replace(/\/+$/, '') });
    this.fetch = f || ((...a) => globalThis.fetch(...a));
  }

  async req(method, path, body) {
    let res;
    try {
      res = await this.fetch(`${this.api}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError("Couldn't reach GitHub. Check your connection and try again.", 0);
    }
    if (!res.ok) {
      let detail = {};
      try { detail = await res.json(); } catch { /* not JSON */ }
      throw new GitHubError(explain(res.status, detail, path), res.status, detail);
    }
    return res.status === 204 ? null : res.json();
  }

  r(path) {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`;
  }

  user() { return this.req('GET', '/user'); }
  repository() { return this.req('GET', this.r('')); }

  // The branch tip: { sha, tree }.
  async head() {
    const ref = await this.req('GET', this.r(`/git/ref/heads/${encodeURIComponent(this.branch)}`));
    const commit = await this.req('GET', this.r(`/git/commits/${ref.object.sha}`));
    return { sha: commit.sha, tree: commit.tree.sha, date: commit.committer?.date };
  }

  // Every file in the tree, as a Map of path -> { sha, size }.
  async files(treeSha) {
    const t = await this.req('GET', this.r(`/git/trees/${treeSha}?recursive=1`));
    return new Map(t.tree.filter(e => e.type === 'blob').map(e => [e.path, { sha: e.sha, size: e.size }]));
  }

  async blob(sha) {
    const b = await this.req('GET', this.r(`/git/blobs/${sha}`));
    return b.encoding === 'base64' ? fromBase64(b.content) : encoder.encode(b.content);
  }
  async text(sha) { return decoder.decode(await this.blob(sha)); }

  // files: [{ path, content }] to write and [{ path, delete: true }] to remove. All land in one commit.
  // If the branch moved since we read it (another device saved), the tree is rebuilt on the new tip:
  // our files win, everything else from the other save is kept.
  async commit({ message, files, onProgress = () => {} }) {
    const blobs = new Map();
    let done = 0;
    for (const f of files) {
      if (f.delete) continue;
      const bytes = await bytesOf(f.content);
      const res = await this.req('POST', this.r('/git/blobs'), { content: toBase64(bytes), encoding: 'base64' });
      blobs.set(f.path, res.sha);
      onProgress({ step: 'upload', done: ++done, total: files.filter(x => !x.delete).length, path: f.path });
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.head();
      const existing = files.some(f => f.delete) ? await this.files(head.tree) : null;
      const tree = files
        .filter(f => !f.delete || existing.has(f.path))
        .map(f => ({ path: f.path, mode: '100644', type: 'blob', sha: f.delete ? null : blobs.get(f.path) }));
      onProgress({ step: 'commit' });
      const t = await this.req('POST', this.r('/git/trees'), { base_tree: head.tree, tree });
      const c = await this.req('POST', this.r('/git/commits'), { message, tree: t.sha, parents: [head.sha] });
      try {
        await this.req('PATCH', this.r(`/git/refs/heads/${encodeURIComponent(this.branch)}`), { sha: c.sha, force: false });
        return { sha: c.sha, url: c.html_url, parent: head.sha };
      } catch (e) {
        if (e.status !== 422 || attempt === 2) throw e;
        onProgress({ step: 'retry' }); // someone else moved the branch; rebuild on top of it
      }
    }
    throw new GitHubError('Saving kept colliding with another change. Try again.', 409);
  }

  async runs(sha) {
    const r = await this.req('GET', this.r(`/actions/runs?head_sha=${sha}&per_page=10`));
    return r.workflow_runs || [];
  }
  async jobs(runId) {
    const r = await this.req('GET', this.r(`/actions/runs/${runId}/jobs`));
    return r.jobs || [];
  }
}

/* ---------- deploy status ---------- */

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
});

// Follows a commit from GitHub Actions to the live site. Calls onStep(step, info) with
// step = 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'unknown'.
// Without Actions access it falls back to watching the live site's build.json for the commit.
export async function waitForDeploy(gh, sha, { siteUrl = '', onStep = () => {}, signal, interval = 4000, timeout = 12 * 60e3, fetch: f } = {}) {
  const get = f || ((...a) => globalThis.fetch(...a));
  const started = Date.now();
  let actions = true;
  const liveSha = async () => {
    if (!siteUrl) return '';
    try {
      const res = await get(`${siteUrl.replace(/\/+$/, '')}/build.json?t=${Date.now()}`, { cache: 'no-store' });
      return res.ok ? (await res.json()).sha : '';
    } catch {
      return '';
    }
  };
  while (Date.now() - started < timeout) {
    if (actions) {
      try {
        const runs = await gh.runs(sha);
        const run = runs.find(r => /deploy|pages/i.test(`${r.name} ${r.path || ''}`)) || runs[0];
        if (!run) onStep('queued', { text: 'Waiting for GitHub Actions to pick it up…' });
        else if (run.status !== 'completed') {
          let step = run.status === 'in_progress' ? 'building' : 'queued';
          if (step === 'building') {
            try {
              const jobs = await gh.jobs(run.id);
              if (jobs.some(j => /deploy/i.test(j.name) && j.status === 'in_progress')) step = 'deploying';
            } catch { /* jobs are a nicety */ }
          }
          onStep(step, { url: run.html_url });
        } else if (run.conclusion === 'success') {
          // Actions is done; give the CDN a moment to serve the new build.
          for (let i = 0; i < 10 && siteUrl; i++) {
            if ((await liveSha()) === sha) break;
            onStep('deploying', { url: run.html_url, text: 'Almost there…' });
            await sleep(3000, signal);
          }
          onStep('live', { url: run.html_url });
          return 'live';
        } else {
          onStep('failed', { url: run.html_url, text: run.conclusion === 'cancelled' ? 'The deploy was cancelled, probably because a newer save replaced it.' : 'The build failed. Open the log on GitHub to see why.' });
          return 'failed';
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (e.status === 403 || e.status === 404) actions = false;
        else onStep('unknown', { text: e.message });
      }
    }
    if (!actions) {
      if ((await liveSha()) === sha) { onStep('live', {}); return 'live'; }
      onStep(siteUrl ? 'building' : 'unknown', { text: siteUrl ? 'Building… (add Actions: Read to the token for more detail)' : "Saved. The site updates in a minute or two." });
      if (!siteUrl) return 'unknown';
    }
    await sleep(interval, signal);
  }
  onStep('unknown', { text: 'This is taking longer than usual. Check the Actions tab on GitHub.' });
  return 'unknown';
}
