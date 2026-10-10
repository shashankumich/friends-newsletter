// Postcards Studio: the no-code editor at /studio/. It signs in with a fine-grained GitHub token,
// edits content/ through a form with a live preview, shrinks photos in the browser, saves every
// change as one commit, follows the deploy until the issue is live, and helps send it out.
// Friends' email addresses and WhatsApp numbers stay in this browser and are never committed.

import { EDITOR, SWATCHES, blankIssue, validateIssue, getPath, setPath, pad2, todayISO, mediaPaths, isShown, momentKind, newGroup, audienceFriends } from './schema.js';
import { renderIssueBody, colorVars, esc, fmtCoords, forAudience } from './render.js';
import { GitHub, waitForDeploy } from './github.js';
import { compressImage, videoInfo, socialCard } from './media.js';
import { issueUrl, groupLink, whatsappText, emailParts, bccMailto, personalLinks } from './share.js';
import { waLink } from './links.js';

const root = document.getElementById('studio');
const V = root.dataset.v;
const FONTS = root.dataset.fonts;
const CONFIG = (() => {
  try { return JSON.parse(document.getElementById('studio-config').textContent); } catch { return {}; }
})();
const GITHUB_API = 'https://api.github.com';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const json = o => `${JSON.stringify(o, null, 2)}\n`;
const clone = o => JSON.parse(JSON.stringify(o));
const rand = () => Math.random().toString(36).slice(2, 8);
const mimeFor = p => MIME[String(p).split('.').pop().toLowerCase()] || 'application/octet-stream';
const fmtSize = b => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const headline = i => `${i.cover?.greeting || 'Greetings from'} ${i.cover?.place || ''}`.trim();
const issueFile = n => `content/issues/${pad2(n)}/issue.json`;
const mediaFile = (n, rel) => `content/issues/${pad2(n)}/${rel}`;
const time = t => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/* ---------- storage ---------- */

function area(kind) {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}
const store = {
  get(k, kind) { try { return JSON.parse(area(kind)?.getItem(k) ?? 'null'); } catch { return null; } },
  set(k, v, kind) { try { area(kind)?.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k, kind) { try { area(kind)?.removeItem(k); } catch { /* storage blocked */ } },
};
const KEY = {
  token: 'pc.studio.token',
  repo: 'pc.studio.repo',
  api: 'pc.studio.api',
  contacts: 'pc.studio.contacts',
  prefs: 'pc.studio.prefs',
  work: () => `pc.studio.work:${S.repo}@${S.branch}`,
};

// New photos and videos wait in IndexedDB until they're saved, so a reload doesn't lose them.
const idb = (() => {
  let opening;
  const open = () => (opening ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('postcards-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('media');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('media', mode);
      const req = fn(t.objectStore('media'));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    put: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
    get: k => run('readonly', s => s.get(k)).catch(() => null),
    del: k => run('readwrite', s => s.delete(k)).catch(() => {}),
    clear: () => run('readwrite', s => s.clear()).catch(() => {}),
  };
})();

/* ---------- state ---------- */

const S = {
  gh: null, api: GITHUB_API, mock: false, repo: '', branch: 'main', user: null,
  base: null, // { sha, tree, files: Map(path -> { sha, size }) } as last read from GitHub
  site: null, friends: [], groups: [], issues: new Map(),
  orig: { site: '', friends: '', groups: '', issues: new Map() },
  current: 0,
  removed: new Set(), // draft issue numbers deleted locally
  pending: new Map(), // repo path -> { blob, url } for new media
  deleted: new Set(), // repo paths of media replaced or removed
  cache: new Map(), loading: new Set(),
  previewAs: '', device: 'phone', view: 'edit',
  busy: false, showErrors: false, errors: [], geo: {},
  frameReady: false, deploy: null,
};
const cur = () => S.issues.get(S.current);

/* ---------- boot ---------- */

function guessRepo() {
  const host = location.hostname;
  if (!/\.github\.io$/.test(host)) return '';
  const owner = host.split('.')[0];
  const first = location.pathname.split('/').filter(Boolean)[0];
  return first && first !== 'studio' ? `${owner}/${first}` : `${owner}/${host}`;
}

async function boot() {
  const q = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && q.get('api')) store.set(KEY.api, q.get('api'), 'session');
  S.api = (local && store.get(KEY.api, 'session')) || GITHUB_API;
  S.mock = S.api !== GITHUB_API;
  const saved = store.get(KEY.repo) || {};
  S.repo = saved.repo || CONFIG.repo || guessRepo();
  S.branch = saved.branch || CONFIG.branch || 'main';
  Object.assign(S, store.get(KEY.prefs) || {});
  if (S.mock) { const [, name] = S.repo.split('/'); S.repo = `you/${name || 'friends-newsletter'}`; }
  const token = store.get(KEY.token, 'session') || store.get(KEY.token);
  if (!token || !S.repo) return signIn();
  try {
    await open(token);
  } catch (e) {
    signIn(e.message);
  }
}

function tokenUrl() {
  const [owner, name] = S.repo.split('/');
  const p = new URLSearchParams({
    name: 'Postcards Studio',
    description: `Lets the Postcards Studio save issues to ${S.repo || 'your newsletter repository'}.`,
    expires_in: '366', contents: 'write', actions: 'read',
  });
  if (owner) p.set('target_name', owner);
  return { url: `https://github.com/settings/personal-access-tokens/new?${p}`, name: name || 'your repository' };
}

function signIn(error = '') {
  const t = tokenUrl();
  root.innerHTML = `<div class="st-sign">
<div class="st-sign-card">
<p class="st-kicker">Postcards</p>
<h1 class="st-sign-h">Studio</h1>
<p class="st-lede">Write, preview and publish each issue here. Every save goes straight to <b>${esc(S.repo || 'your repository')}</b> on GitHub, which rebuilds the site.</p>
${error ? `<p class="st-alert" role="alert">${esc(error)}</p>` : ''}
<ol class="st-howto">
<li><b>Make a token.</b> <a class="st-btn st-btn-quiet st-btn-sm" href="${esc(t.url)}" target="_blank" rel="noopener">Open GitHub ↗</a><br>The form comes filled in. Under <i>Repository access</i>, choose <i>Only select repositories</i> and pick <b>${esc(t.name)}</b>.</li>
<li><b>Generate it,</b> copy it, and paste it below.</li>
</ol>
<form id="st-signin" class="st-signin">
<label class="st-label" for="st-token">Token</label>
<input class="st-input" id="st-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…" required>
<label class="st-checkline"><input type="checkbox" id="st-remember" checked> Remember me on this device</label>
<details class="st-adv"${S.repo ? '' : ' open'}><summary>Repository settings</summary>
<div class="st-grid"><div class="st-field is-half"><label class="st-label" for="st-repo">Repository</label><input class="st-input" id="st-repo" value="${esc(S.repo)}" placeholder="owner/name" required></div>
<div class="st-field is-half"><label class="st-label" for="st-branch">Branch</label><input class="st-input" id="st-branch" value="${esc(S.branch)}" required></div></div>
</details>
<button class="st-btn st-btn-primary st-btn-wide" type="submit">Sign in</button>
</form>
<p class="st-fine">The token stays in this browser and is only ever sent to GitHub. It needs <b>Contents: Read and write</b>, plus <b>Actions: Read</b> so the Studio can show deploy progress.</p>
${S.mock ? `<p class="st-mockline">Practice mode: talking to a pretend GitHub at ${esc(S.api)}. Any token works and nothing leaves this computer.</p>` : ''}
</div>
</div>`;
  $('#st-signin').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter || $('#st-signin button[type=submit]');
    const token = $('#st-token').value.trim();
    S.repo = $('#st-repo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    S.branch = $('#st-branch').value.trim() || 'main';
    if (!/^[\w.-]+\/[\w.-]+$/.test(S.repo)) return signIn('The repository should look like owner/name.');
    S.remember = $('#st-remember').checked;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      await open(token, { check: true });
    } catch (err) {
      signIn(err.message);
    }
  });
  $('#st-token').focus();
}

function loadingScreen(text) {
  root.innerHTML = `<div class="st-sign"><div class="st-loading"><span class="st-spin" aria-hidden="true"></span><p>${esc(text)}</p></div></div>`;
}

/* ---------- loading the repo ---------- */

// Fill in any sections an older issue.json doesn't have, so every form field has a home.
function normalize(issue) {
  const base = blankIssue({ number: issue.number, date: issue.date || todayISO() });
  for (const [k, v] of Object.entries(base)) {
    if (issue[k] === undefined) issue[k] = clone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && typeof issue[k] === 'object') {
      for (const [kk, vv] of Object.entries(v)) if (issue[k][kk] === undefined) issue[k][kk] = clone(vv);
    }
  }
  if (!issue.moment.kind || !issue.moment[issue.moment.kind]) issue.moment.kind = momentKind(issue.moment) || 'photo';
  return issue;
}

function snapshot() {
  return { site: json(S.site), friends: json(S.friends), groups: json(S.groups), issues: new Map([...S.issues].map(([n, i]) => [n, json(i)])) };
}

async function readBase() {
  const head = await S.gh.head();
  const files = await S.gh.files(head.tree);
  S.base = { sha: head.sha, tree: head.tree, files };
}

async function open(token, { check = false } = {}) {
  const [owner, name] = S.repo.split('/');
  S.gh = new GitHub({ token, owner, repo: name, branch: S.branch, api: S.api });
  if (check) {
    await S.gh.repository();
    store.set(KEY.token, token, 'session');
    if (S.remember !== false) store.set(KEY.token, token); else store.del(KEY.token);
    store.set(KEY.repo, { repo: S.repo, branch: S.branch });
  }
  loadingScreen('Opening the studio…');
  await readBase();
  const { files } = S.base;
  const read = async p => (files.has(p) ? JSON.parse(await S.gh.text(files.get(p).sha)) : null);
  S.site = (await read('content/site.json')) || { title: 'Postcards', author: '', description: '', reply: {} };
  S.site.reply ||= { whatsapp: '', email: '' };
  S.friends = (await read('content/friends.json')) || [];
  S.groups = (await read('content/groups.json')) || [];
  const paths = [...files.keys()].filter(p => /^content\/issues\/\d+\/issue\.json$/.test(p));
  const issues = (await Promise.all(paths.map(read))).filter(i => i && Number.isInteger(i.number));
  S.issues = new Map(issues.sort((a, b) => a.number - b.number).map(i => [i.number, normalize(i)]));
  S.orig = snapshot();
  S.user = await S.gh.user().catch(() => null);
  await restoreWork();
  if (!S.issues.size) createIssue();
  if (!S.issues.has(S.current)) S.current = Math.max(...S.issues.keys());
  renderApp();
}

/* ---------- unsaved work, kept locally ---------- */

let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!changes().length) return store.del(KEY.work());
    store.set(KEY.work(), {
      base: S.base.sha, at: Date.now(), current: S.current,
      site: S.site, friends: S.friends, groups: S.groups, issues: [...S.issues.values()],
      removed: [...S.removed], deleted: [...S.deleted], pending: [...S.pending.keys()],
    });
  }, 400);
}

async function restoreWork() {
  const w = store.get(KEY.work());
  if (!w) return;
  if (w.site) S.site = w.site;
  if (w.friends) S.friends = w.friends;
  if (w.groups) S.groups = w.groups;
  for (const i of w.issues || []) S.issues.set(i.number, normalize(i));
  for (const n of w.removed || []) { S.issues.delete(n); S.removed.add(n); }
  for (const p of w.deleted || []) S.deleted.add(p);
  for (const p of w.pending || []) {
    const blob = await idb.get(p);
    if (blob) S.pending.set(p, { blob, url: URL.createObjectURL(blob) });
  }
  S.current = w.current || 0;
  if (changes().length) {
    S.restored = `Restored your unsaved changes from ${time(w.at)}.${w.base !== S.base.sha ? ' The site has changed since; saving keeps your version of the files you edited.' : ''}`;
  } else store.del(KEY.work());
}

/* ---------- what's changed ---------- */

function changes() {
  if (!S.base) return [];
  const out = new Map();
  const add = (path, content, orig) => { if (content !== orig) out.set(path, { path, content }); };
  add('content/site.json', json(S.site), S.orig.site);
  add('content/friends.json', json(S.friends), S.orig.friends);
  add('content/groups.json', json(S.groups), S.orig.groups);
  const refs = new Set();
  for (const [n, issue] of S.issues) {
    add(issueFile(n), json(issue), S.orig.issues.get(n));
    mediaPaths(issue).forEach(r => refs.add(mediaFile(n, r)));
  }
  for (const n of S.removed) {
    for (const p of S.base.files.keys()) if (p.startsWith(`content/issues/${pad2(n)}/`)) out.set(p, { path: p, delete: true });
  }
  for (const [p, m] of S.pending) if (refs.has(p)) out.set(p, { path: p, content: m.blob });
  for (const p of S.deleted) if (!refs.has(p) && S.base.files.has(p)) out.set(p, { path: p, delete: true });
  return [...out.values()];
}
const isDirtyIssue = n => json(S.issues.get(n)) !== S.orig.issues.get(n) || [...S.pending.keys()].some(p => p.startsWith(`content/issues/${pad2(n)}/`));

function commitMessage(publishing) {
  const i = cur();
  if (publishing) return `Publish No. ${pad2(i.number)}: ${headline(i)}\n\nSaved from Postcards Studio.`;
  const parts = [];
  for (const [n, issue] of S.issues) if (isDirtyIssue(n)) parts.push(`${issue.status === 'published' ? 'Edit' : 'Draft'} No. ${pad2(n)}`);
  for (const n of S.removed) parts.push(`Delete draft No. ${pad2(n)}`);
  if (json(S.friends) !== S.orig.friends) parts.push('Update friends');
  if (json(S.groups) !== S.orig.groups) parts.push('Update groups');
  if (json(S.site) !== S.orig.site) parts.push('Update settings');
  return `${parts.join(', ') || 'Update content'}\n\nSaved from Postcards Studio.`;
}

// Does saving these files change what friends see?
function touchesLiveSite(files) {
  return files.some(f => {
    if (['content/site.json', 'content/friends.json', 'content/groups.json'].includes(f.path)) return true;
    const m = /^content\/issues\/(\d+)\//.exec(f.path);
    if (!m) return false;
    const n = Number(m[1]);
    const wasLive = (() => { try { return JSON.parse(S.orig.issues.get(n) || '{}').status === 'published'; } catch { return false; } })();
    return wasLive || S.issues.get(n)?.status === 'published';
  });
}

/* ---------- media ---------- */

function mediaSrc(path) {
  if (S.pending.has(path)) return S.pending.get(path).url;
  if (S.cache.has(path)) return S.cache.get(path);
  const f = S.base?.files.get(path);
  if (f && !S.loading.has(path)) {
    S.loading.add(path);
    S.gh.blob(f.sha).then(bytes => {
      S.cache.set(path, URL.createObjectURL(new Blob([bytes], { type: mimeFor(path) })));
      S.loading.delete(path);
      refreshThumbs();
      schedulePreview();
    }).catch(() => S.loading.delete(path));
  }
  return BLANK;
}

async function mediaBlob(n, rel) {
  if (!rel) return null;
  const p = mediaFile(n, rel);
  if (S.pending.has(p)) return S.pending.get(p).blob;
  if (S.cache.has(p)) return (await fetch(S.cache.get(p))).blob();
  const f = S.base.files.get(p);
  return f ? new Blob([await S.gh.blob(f.sha)], { type: mimeFor(p) }) : null;
}

function putMedia(n, rel, blob) {
  const p = mediaFile(n, rel);
  S.pending.set(p, { blob, url: URL.createObjectURL(blob) });
  idb.put(p, blob);
}

function dropMedia(p) {
  const m = S.pending.get(p);
  if (m) {
    URL.revokeObjectURL(m.url);
    S.pending.delete(p);
    idb.del(p);
  } else if (S.base.files.has(p)) S.deleted.add(p);
}

function replaceRef(issue, path, rel) {
  const old = getPath(issue, path);
  if (old && old !== rel && !/^https?:/.test(old)) dropMedia(mediaFile(issue.number, old));
  setPath(issue, path, rel);
}

function refreshThumbs() {
  $$('[data-thumb]').forEach(el => {
    const src = mediaSrc(el.dataset.thumb);
    if (el.getAttribute('src') !== src) el.setAttribute('src', src);
  });
}

/* ---------- the app ---------- */

function renderApp() {
  root.innerHTML = `<div class="st-app" data-view="${S.view}">
<header class="st-top">
<a class="st-brand" href="../" target="_blank" rel="noopener" title="Open the site"><b>Postcards</b><span>Studio</span></a>
<div class="st-pick"><label class="sr-only" for="st-pick">Issue</label><select class="st-select" id="st-pick"></select><button class="st-btn st-btn-quiet" type="button" data-act="new-issue">New issue</button></div>
<p class="st-status" id="st-status" role="status" aria-live="polite"></p>
<nav class="st-actions" aria-label="Studio">
<button class="st-btn st-btn-quiet" type="button" data-act="friends">Friends</button>
<button class="st-btn st-btn-quiet" type="button" data-act="settings">Settings</button>
<button class="st-btn st-btn-quiet" type="button" data-act="share">Share</button>
<button class="st-btn" type="button" data-act="save" id="st-save">Save</button>
<button class="st-btn st-btn-primary" type="button" data-act="publish" id="st-publish">Publish</button>
</nav>
</header>
<div class="st-tabs" role="tablist" aria-label="View"><button type="button" role="tab" data-view="edit">Edit</button><button type="button" role="tab" data-view="preview">Preview</button></div>
<div class="st-banner" id="st-banner" hidden></div>
<main class="st-main">
<section class="st-edit" id="st-edit" aria-label="Editor"><nav class="st-jump" id="st-jump" aria-label="Sections"></nav><form class="st-form" id="st-form" autocomplete="off" novalidate></form></section>
<section class="st-pv" aria-label="Preview">
<div class="st-pv-bar">
<div class="st-seg st-seg-sm" role="radiogroup" aria-label="Preview size"><button type="button" role="radio" data-device="phone">Phone</button><button type="button" role="radio" data-device="desktop">Desktop</button></div>
<label class="st-pv-as">Preview as <select class="st-select st-select-sm" id="st-as"></select></label>
<a class="st-pv-live" id="st-live" target="_blank" rel="noopener">Live page ↗</a>
</div>
<div class="st-stage" id="st-stage"><div class="st-device" id="st-device"><iframe id="st-frame" title="Live preview of this issue"></iframe></div></div>
</section>
</main>
<dialog class="st-dialog" id="st-dialog"></dialog>
<div class="st-toasts" id="st-toast" aria-live="polite"></div>
</div>`;
  wireApp();
  renderAll();
  if (S.restored) banner(S.restored, [['Discard them', 'discard-work']]);
}

function renderAll() {
  root.style.cssText = colorVars(cur().color);
  renderPicker();
  renderForm();
  renderPreviewAs();
  setView(S.view);
  setDevice(S.device);
  updateStatus();
  frameStart();
}

function renderPicker() {
  const sel = $('#st-pick');
  if (!sel) return;
  sel.innerHTML = [...S.issues.values()].sort((a, b) => b.number - a.number).map(i =>
    `<option value="${i.number}"${i.number === S.current ? ' selected' : ''}>No. ${pad2(i.number)} · ${esc(i.cover?.place || 'Untitled')} · ${i.status === 'published' ? 'Live' : 'Draft'}${isDirtyIssue(i.number) ? ' •' : ''}</option>`).join('');
  const live = $('#st-live');
  const i = cur();
  live.hidden = i.status !== 'published';
  const a = previewAudience();
  live.href = issueUrl(siteBase(), i.number, a.to, a.group?.slug);
  $('#st-publish').textContent = i.status === 'published' ? 'Update live' : 'Publish';
}

function renderPreviewAs() {
  const opt = (v, label) => `<option value="${esc(v)}"${v === S.previewAs ? ' selected' : ''}>${esc(label)}</option>`;
  const groups = S.groups.length ? `<optgroup label="Groups">${S.groups.map(g => opt(`g:${g.id}`, `${g.name} (group page)`)).join('')}</optgroup>` : '';
  const people = S.friends.map(f => opt(f.name, `${f.name}${f.city ? ` · ${f.city}` : ''}`)).join('');
  $('#st-as').innerHTML = `${opt('', S.groups.length ? 'Shared page (no group)' : 'A friend (no name)')}${groups}${S.groups.length ? `<optgroup label="Friends">${people}</optgroup>` : people}`;
}

// What "Preview as" means: a group's page (g:<id>), or a friend's personal link on their group's page.
function previewAudience() {
  const v = S.previewAs || '';
  if (v.startsWith('g:')) return { group: S.groups.find(g => g.id === v.slice(2)) || null, to: '' };
  const f = S.friends.find(x => x.name === v);
  const gid = (f?.groups || []).find(id => S.groups.some(g => g.id === id));
  return { group: S.groups.find(g => g.id === gid) || null, to: v };
}

function siteBase() {
  if (S.site?.baseUrl) return S.site.baseUrl.replace(/\/+$/, '');
  return new URL('../', location.href).href.replace(/\/+$/, '');
}

let statusLock = '';
function updateStatus(text) {
  const el = $('#st-status');
  if (!el) return;
  const n = changes().length;
  if (text !== undefined) statusLock = text;
  el.textContent = statusLock || (n ? `${n} unsaved change${n === 1 ? '' : 's'}` : 'All changes saved');
  el.dataset.state = statusLock ? 'busy' : n ? 'dirty' : 'clean';
  $('#st-save').disabled = S.busy || !n;
  $('#st-publish').disabled = S.busy;
}

function banner(text, actions = []) {
  const b = $('#st-banner');
  b.innerHTML = `<p>${esc(text)}</p>${actions.map(([label, act]) => `<button class="st-btn st-btn-quiet st-btn-sm" type="button" data-act="${act}">${esc(label)}</button>`).join('')}<button class="st-x" type="button" data-act="banner-close" aria-label="Dismiss">✕</button>`;
  b.hidden = false;
}

function toast(msg, kind = '') {
  const box = $('#st-toast');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `st-toast${kind ? ` is-${kind}` : ''}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.classList.add('is-out'), kind === 'error' ? 7000 : 4200);
  setTimeout(() => el.remove(), kind === 'error' ? 7500 : 4700);
}

function setView(view) {
  S.view = view;
  $('.st-app').dataset.view = view;
  $$('.st-tabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  if (view === 'preview') requestAnimationFrame(layoutPreview);
}

function setDevice(d) {
  S.device = d;
  store.set(KEY.prefs, { device: d });
  $$('[data-device]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.device === d)));
  layoutPreview();
}

/* ---------- the form ---------- */

const FIELDS = new Map();
for (const g of EDITOR) {
  for (const f of g.fields) {
    FIELDS.set(f.path, { ...f, group: g.key });
    if (f.type === 'list') for (const sf of f.fields) FIELDS.set(`${f.path}.*.${sf.key}`, { ...sf, group: g.key, list: f.path });
  }
  if (g.toggle) FIELDS.set(g.toggle, { type: 'toggle', group: g.key });
}
const fieldDef = path => FIELDS.get(path) || FIELDS.get(String(path).replace(/\.\d+\./, '.*.'));
const groupOf = path => fieldDef(path)?.group || String(path).split('.')[0];
const PREVIEW_TARGET = { issue: '.mast', opening: '.op', cover: '.cover', letter: '#letter', lately: '#lately', moment: '#moment', roll: '#roll', currently: '#currently', nextStop: '#next-stop', mailbag: '#mailbag', awake: '#awake', yourTurn: '#write-back' };

function renderForm() {
  const issue = cur();
  S.errors = S.showErrors ? validateIssue(issue, { friends: S.friends }).errors : [];
  $('#st-form').innerHTML = EDITOR.map(g => groupHTML(g, issue)).join('') + dangerHTML(issue);
  $('#st-jump').innerHTML = EDITOR.map(g => {
    const off = g.toggle && getPath(issue, g.toggle) === false;
    return `<a href="#g-${g.key}" data-jump="${g.key}"${off ? ' class="is-off"' : ''}>${esc(g.label)}</a>`;
  }).join('');
}

function rerenderGroup(key) {
  const g = EDITOR.find(x => x.key === key);
  const el = document.getElementById(`g-${key}`);
  if (!g || !el) return renderForm();
  S.errors = S.showErrors ? validateIssue(cur(), { friends: S.friends }).errors : [];
  el.outerHTML = groupHTML(g, cur());
  const chip = $(`[data-jump="${key}"]`);
  if (chip) chip.classList.toggle('is-off', !!g.toggle && getPath(cur(), g.toggle) === false);
}

function groupHTML(g, issue) {
  const on = !g.toggle || getPath(issue, g.toggle) !== false;
  const shown = g.toggle ? isShown(issue, g.key, S.friends) : true;
  const badge = g.toggle ? (on ? (shown ? '' : '<span class="st-badge is-warn">Hidden until it has content</span>') : '<span class="st-badge">Off</span>') : '';
  let extra = '';
  if (g.key === 'issue') {
    extra = `<p class="st-meta-line"><span>No. ${pad2(issue.number)}</span><span class="st-badge ${issue.status === 'published' ? 'is-live' : ''}">${issue.status === 'published' ? 'Live' : 'Draft'}</span>${issue.sample ? '<span class="st-badge is-warn">Sample content</span>' : ''}</p>`;
  }
  if (g.key === 'awake') {
    extra = `<p class="st-note">${S.friends.length ? `${S.friends.length} friends on the map: ${esc(S.friends.map(f => f.name).join(', '))}.` : 'No friends on the list yet.'} <button type="button" class="st-link" data-act="friends">Edit friends</button></p>`;
  }
  return `<fieldset class="st-card${on ? '' : ' is-off'}" id="g-${g.key}" data-group="${g.key}">
<legend class="sr-only">${esc(g.label)}</legend>
<header class="st-card-h"><div><h2>${esc(g.label)} ${badge}</h2><p>${esc(g.hint || '')}</p></div>${g.toggle ? `<label class="st-switch"><input type="checkbox" data-path="${g.toggle}"${on ? ' checked' : ''}><span class="sr-only">Show ${esc(g.label)}</span><i aria-hidden="true"></i></label>` : ''}</header>
<div class="st-card-b st-grid">${extra}${on ? g.fields.map(f => fieldHTML(f, issue)).join('') : ''}</div>
</fieldset>`;
}

function dangerHTML(issue) {
  return `<div class="st-danger">${issue.status === 'published'
    ? `<p>No. ${pad2(issue.number)} is live. <button type="button" class="st-link" data-act="unpublish">Take it off the site</button> (it becomes a draft again when you save).</p>`
    : `<p>No. ${pad2(issue.number)} is a draft, so friends can't see it yet. <button type="button" class="st-link is-danger" data-act="delete-issue">Delete this draft</button></p>`}</div>`;
}

function controlValue(issue, path) {
  return path === 'moment.kind' ? (issue.moment?.kind || momentKind(issue.moment) || 'photo') : getPath(issue, path);
}

function fieldHTML(f, issue, path = f.path) {
  if (f.when && controlValue(issue, f.when[0]) !== f.when[1]) return '';
  const id = `f-${String(path).replace(/[^\w]/g, '-')}`;
  const v = getPath(issue, path);
  const err = S.errors.find(e => e.path === path);
  const hint = f.hint ? `<small class="st-hint">${esc(f.hint)}</small>` : '';
  const errH = err ? `<small class="st-error">${esc(err.msg)}</small>` : '';
  const req = f.required ? '<i class="st-req" aria-hidden="true">*</i>' : '';
  const label = `<label class="st-label" for="${id}">${esc(f.label)}${req}</label>`;
  const cls = `st-field st-${f.type}${f.half ? ' is-half' : ''}${err ? ' has-error' : ''}`;
  const attrs = `id="${id}" data-path="${esc(path)}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.maxlength ? ` maxlength="${f.maxlength}"` : ''}${f.upper ? ' data-upper' : ''}${err ? ' aria-invalid="true"' : ''}`;

  switch (f.type) {
    case 'text':
      return `<div class="${cls}">${label}<input class="st-input" type="text" ${attrs} value="${esc(v ?? '')}">${hint}${errH}</div>`;
    case 'textarea':
      return `<div class="${cls}">${label}<textarea class="st-input" rows="${f.rows || 3}" ${attrs}>${esc(v ?? '')}</textarea>${hint}${errH}</div>`;
    case 'date':
      return `<div class="${cls} is-half">${label}<input class="st-input" type="date" ${attrs} value="${esc(v ?? '')}">${hint}${errH}</div>`;
    case 'color': {
      const val = String(v || '').toUpperCase();
      const known = SWATCHES.some(s => s.hex === val);
      return `<div class="${cls}"><span class="st-label" id="${id}-l">${esc(f.label)}</span>
<div class="st-swatches" role="radiogroup" aria-labelledby="${id}-l">${SWATCHES.map(s => `<label class="st-swatch" style="--sw:${s.hex}" title="${esc(s.name)}"><input type="radio" name="${id}" value="${s.hex}" data-path="${esc(path)}"${s.hex === val ? ' checked' : ''}><span class="sr-only">${esc(s.name)}</span></label>`).join('')}
<label class="st-swatch is-custom${known ? '' : ' is-on'}" style="--sw:${esc(val)}" title="Pick any colour"><input type="color" value="${esc(val || '#2D3FE3')}" data-path="${esc(path)}"><span class="sr-only">Pick any colour</span></label></div>${hint}</div>`;
    }
    case 'segmented': {
      const val = controlValue(issue, path);
      return `<div class="${cls}"><span class="st-label" id="${id}-l">${esc(f.label)}</span><div class="st-seg" role="radiogroup" aria-labelledby="${id}-l">${f.options.map(([o, l]) => `<label><input type="radio" name="${id}" value="${o}" data-path="${esc(path)}"${o === val ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>${hint}</div>`;
    }
    case 'place': {
      const coords = f.geo?.lat ? fmtCoords(getPath(issue, f.geo.lat), getPath(issue, f.geo.lon)) : '';
      return `<div class="${cls}">${label}<div class="st-row"><input class="st-input" type="text" ${attrs} value="${esc(v ?? '')}"><button type="button" class="st-btn st-btn-quiet" data-act="geo" data-path="${esc(path)}">Find</button></div>
<div class="st-geo" data-geo-for="${esc(path)}" hidden></div>${coords ? `<small class="st-hint">Postmarked at ${esc(coords)}. Press Find to update it.</small>` : f.geo?.lat ? '<small class="st-hint">Press Find to put it on the map.</small>' : ''}${hint}${errH}</div>`;
    }
    case 'image':
    case 'video': {
      const repoPath = v ? mediaFile(issue.number, v) : '';
      const isVid = f.type === 'video';
      const size = repoPath ? (S.pending.get(repoPath)?.blob.size || S.base.files.get(repoPath)?.size || 0) : 0;
      const dims = f.size && getPath(issue, f.size.w) ? `${getPath(issue, f.size.w)} × ${getPath(issue, f.size.h)}` : '';
      const dur = isVid && issue.moment?.duration ? `${Math.round(issue.moment.duration)} seconds` : '';
      const meta = [dims, dur, size ? fmtSize(size) : ''].filter(Boolean).join(' · ');
      const thumb = !v ? '<span class="st-drop-ph" aria-hidden="true">+</span>'
        : isVid ? `<video class="st-thumb" data-thumb="${esc(repoPath)}" src="${esc(mediaSrc(repoPath))}" muted playsinline preload="metadata"></video>`
          : `<img class="st-thumb" data-thumb="${esc(repoPath)}" src="${esc(mediaSrc(repoPath))}" alt="">`;
      return `<div class="${cls}" data-media="${esc(path)}"><span class="st-label">${esc(f.label)}${req}</span>
<div class="st-drop${v ? ' has-file' : ''}" data-drop="${esc(path)}">${thumb}
<div class="st-drop-txt"><div class="st-row"><label class="st-btn st-btn-quiet st-btn-sm st-file">${v ? 'Replace' : isVid ? 'Choose a video' : 'Choose a photo'}<input type="file" accept="${isVid ? 'video/mp4,video/quicktime,video/webm,video/*' : 'image/*'}" data-file="${esc(path)}"></label>${v ? `<button type="button" class="st-link" data-act="media-remove" data-path="${esc(path)}">Remove</button>` : ''}</div>
<small>${v ? esc(meta) : isVid ? 'Or drop it here.' : `Or drop one here. It's shrunk to under ${f.kb || 250} KB before saving.`}</small></div></div>${hint}${errH}</div>`;
    }
    case 'groupps': {
      if (!S.groups.length) return `<div class="${cls}"><span class="st-label">${esc(f.label)}</span><small class="st-hint">Make friend groups under <button type="button" class="st-link" data-act="friends">Friends</button> to add a P.S. that only that group sees.</small></div>`;
      return `<div class="${cls}"><span class="st-label">${esc(f.label)}</span>${hint}<div class="st-ps">${S.groups.map(g => {
        const pid = `${id}-${g.id}`;
        return `<div class="st-field"><label class="st-label st-label-sub" for="${pid}">${esc(g.name)} <em>Dear ${esc(g.salutation || g.name)},</em></label><textarea class="st-input" rows="2" id="${pid}" data-path="groups.${esc(g.id)}.ps" placeholder="Optional">${esc(issue.groups?.[g.id]?.ps || '')}</textarea></div>`;
      }).join('')}</div></div>`;
    }
    case 'groupselect': {
      if (!S.groups.length) return '';
      return `<div class="${cls}">${label}<select class="st-select" ${attrs}><option value="">Every page</option>${S.groups.map(g => `<option value="${esc(g.id)}"${v === g.id ? ' selected' : ''}>${esc(g.name)} only</option>`).join('')}</select>${hint}</div>`;
    }
    case 'tags': {
      const list = Array.isArray(v) ? v : [];
      return `<div class="${cls}">${label}<div class="st-tags">${list.map((t, i) => `<span class="st-tag">${esc(t)}<button type="button" data-act="tag-del" data-path="${esc(path)}" data-index="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}<input class="st-tag-in" id="${id}" data-tag-in="${esc(path)}" placeholder="${list.length >= (f.max || 6) ? 'That\'s plenty' : 'Type one, press Enter'}"${list.length >= (f.max || 6) ? ' disabled' : ''}></div>${hint}</div>`;
    }
    case 'list': {
      const items = Array.isArray(v) ? v : [];
      const full = items.length >= (f.max || 10);
      const add = full ? '<small class="st-hint">That\'s as many as this section holds.</small>'
        : f.multiImage ? `<label class="st-btn st-btn-quiet st-file">${esc(f.add)}<input type="file" accept="image/*" multiple data-multi="${esc(path)}"></label>`
          : `<button type="button" class="st-btn st-btn-quiet" data-act="item-add" data-list="${esc(path)}">${esc(f.add)}</button>`;
      return `<div class="${cls}" data-list="${esc(path)}"><span class="st-label">${esc(f.label)}</span>
<ol class="st-items">${items.map((_, i) => `<li class="st-item"><div class="st-item-h"><span class="st-item-n">${pad2(i + 1)}</span><div class="st-item-acts">
<button type="button" class="st-icon" data-act="item-up" data-list="${esc(path)}" data-index="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
<button type="button" class="st-icon" data-act="item-down" data-list="${esc(path)}" data-index="${i}" aria-label="Move down"${i === items.length - 1 ? ' disabled' : ''}>↓</button>
<button type="button" class="st-icon" data-act="item-del" data-list="${esc(path)}" data-index="${i}" aria-label="Remove">✕</button></div></div>
<div class="st-grid">${f.fields.map(sf => fieldHTML(sf, issue, `${path}.${i}.${sf.key}`)).join('')}</div></li>`).join('')}</ol>${add}</div>`;
    }
    default:
      return '';
  }
}

function changed(path, { rerender } = {}) {
  if (rerender) rerenderGroup(rerender);
  if (path === 'color') root.style.cssText = colorVars(cur().color);
  if (S.showErrors) {
    S.errors = validateIssue(cur(), { friends: S.friends }).errors;
    const field = $(`[data-path="${CSS.escape(path)}"]`)?.closest('.st-field');
    if (field && !S.errors.some(e => e.path === path)) { field.classList.remove('has-error'); field.querySelector('.st-error')?.remove(); }
  }
  if (['season', 'cover.place', 'status'].includes(path)) renderPicker();
  updateStatus();
  persist();
  schedulePreview();
}

function onInput(e) {
  const t = e.target;
  const path = t.dataset.path;
  if (!path || t.type === 'file' || t.type === 'checkbox' || t.type === 'radio') return;
  let v = t.value;
  if (t.hasAttribute('data-upper') && v !== v.toUpperCase()) {
    const at = t.selectionStart;
    t.value = v = v.toUpperCase();
    t.setSelectionRange(at, at);
  }
  setPath(cur(), path, v);
  // A quoted reply from someone in exactly one group is shown only to that group.
  const note = /^mailbag\.notes\.(\d+)\.name$/.exec(path);
  if (note) {
    const n = cur().mailbag.notes[Number(note[1])];
    const gs = (S.friends.find(f => f.name.toLowerCase() === v.trim().toLowerCase())?.groups || []).filter(id => S.groups.some(g => g.id === id));
    if (!n.group && gs.length === 1) {
      n.group = gs[0];
      const sel = $(`[data-path="mailbag.notes.${note[1]}.group"]`);
      if (sel) sel.value = gs[0];
    }
  }
  if (t.type === 'color') {
    const custom = t.closest('.st-swatch');
    custom?.style.setProperty('--sw', v);
    $$(`input[type=radio][data-path="color"]`).forEach(r => { r.checked = false; });
    custom?.classList.add('is-on');
  }
  changed(path);
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-file]')) {
    const file = t.files?.[0];
    t.value = '';
    if (file) upload(t.dataset.file, file);
    return;
  }
  if (t.matches('[data-multi]')) {
    const files = [...(t.files || [])];
    t.value = '';
    if (files.length) uploadMany(t.dataset.multi, files);
    return;
  }
  const path = t.dataset.path;
  if (!path) return;
  if (t.type === 'checkbox') {
    setPath(cur(), path, t.checked);
    return changed(path, { rerender: groupOf(path) });
  }
  if (t.type === 'radio' && t.checked) {
    setPath(cur(), path, t.value);
    if (path === 'color') $$('.st-swatch.is-custom').forEach(c => c.classList.remove('is-on'));
    return changed(path, { rerender: path === 'moment.kind' ? 'moment' : undefined });
  }
}

/* ---------- uploads ---------- */

async function upload(path, file) {
  const def = fieldDef(path);
  const issue = cur();
  const n = issue.number;
  const drop = $(`[data-drop="${CSS.escape(path)}"]`);
  drop?.classList.add('is-busy');
  try {
    if (def.type === 'video') {
      if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) throw new Error("That file isn't a video.");
      if (file.size > 40e6) throw new Error(`That video is ${fmtSize(file.size)}. Keep it under 40 MB: trim it to 30 seconds, or upload it to YouTube as unlisted and paste the link instead.`);
      const info = await videoInfo(file);
      const ext = (/\.(mp4|m4v|mov|webm)$/i.exec(file.name)?.[1] || 'mp4').toLowerCase();
      const rel = `media/${def.name || 'video'}-${rand()}.${ext}`;
      putMedia(n, rel, file);
      replaceRef(issue, path, rel);
      setPath(issue, def.duration, info.duration);
      setPath(issue, 'moment.w', info.w);
      setPath(issue, 'moment.h', info.h);
      if (info.poster) {
        const prel = `media/poster-${rand()}.${info.poster.ext}`;
        putMedia(n, prel, info.poster.blob);
        replaceRef(issue, def.poster, prel);
      }
      toast(`Video added: ${fmtSize(file.size)}${info.duration ? `, ${Math.round(info.duration)} seconds` : ''}.${info.duration > 31 ? ' Friends tend to watch 30 seconds or less.' : ''}${info.poster ? '' : ' Add a poster photo below.'}`);
      if (/quicktime|\.mov$/i.test(`${file.type} ${file.name}`)) toast('Heads up: .mov videos may not play in every browser. An MP4 is safest.', 'warn');
    } else {
      const r = await compressImage(file, { maxEdge: def.maxEdge, kb: def.kb });
      const rel = `media/${def.name || 'photo'}-${rand()}.${r.ext}`;
      putMedia(n, rel, r.blob);
      replaceRef(issue, path, rel);
      if (def.size) { setPath(issue, def.size.w, r.w); setPath(issue, def.size.h, r.h); }
      toast(`Photo ready: ${fmtSize(r.before)} → ${fmtSize(r.blob.size)}, ${r.w} × ${r.h}.`);
    }
    changed(path, { rerender: groupOf(path) });
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    drop?.classList.remove('is-busy');
  }
}

async function uploadMany(listPath, files) {
  const def = fieldDef(listPath);
  const sub = def.fields.find(f => f.key === def.multiImage);
  const issue = cur();
  if (!Array.isArray(getPath(issue, listPath))) setPath(issue, listPath, []);
  const list = getPath(issue, listPath);
  const room = (def.max || 8) - list.length;
  if (files.length > room) toast(`Only room for ${room} more, so the first ${room} were added.`, 'warn');
  updateStatus(`Shrinking ${Math.min(room, files.length)} photo${files.length === 1 ? '' : 's'}…`);
  let added = 0;
  for (const file of files.slice(0, room)) {
    try {
      const r = await compressImage(file, { maxEdge: sub.maxEdge, kb: sub.kb });
      const rel = `media/${sub.name || 'photo'}-${rand()}.${r.ext}`;
      putMedia(issue.number, rel, r.blob);
      list.push({ ...clone(def.item), [def.multiImage]: rel });
      added++;
    } catch (e) {
      toast(`${file.name}: ${e.message}`, 'error');
    }
  }
  updateStatus('');
  if (added) toast(`Added ${added} photo${added === 1 ? '' : 's'}. Give each one a caption.`);
  changed(listPath, { rerender: groupOf(listPath) });
}

/* ---------- places ---------- */

async function geocode(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  if (!r.ok) throw new Error("Couldn't look that place up right now.");
  const j = await r.json();
  return (j.results || []).map(x => ({
    name: x.name, country: x.country || '', region: x.admin1 || '', tz: x.timezone || '',
    lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100,
  }));
}

async function findPlace(btn, apply) {
  const path = btn.dataset.path;
  const scope = btn.closest('.st-field, .st-friend') || document;
  const input = scope.querySelector('input[type=text]');
  const box = scope.querySelector('.st-geo');
  const q = input.value.trim();
  if (!q) { input.focus(); return; }
  btn.disabled = true;
  try {
    const results = await geocode(q);
    S.geo[path] = { results, apply };
    box.innerHTML = results.length
      ? results.map((r, i) => `<button type="button" class="st-geo-i" data-act="geo-pick" data-path="${esc(path)}" data-index="${i}"><b>${esc(r.name)}</b> <span>${esc([r.region, r.country].filter(Boolean).join(', '))}</span></button>`).join('')
      : `<p class="st-hint">Nothing found for "${esc(q)}". Try the nearest city.</p>`;
    box.hidden = false;
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function applyIssuePlace(path, r) {
  const def = fieldDef(path);
  const issue = cur();
  setPath(issue, path, r.name);
  if (def.geo?.country) setPath(issue, def.geo.country, r.country);
  if (def.geo?.lat) { setPath(issue, def.geo.lat, r.lat); setPath(issue, def.geo.lon, r.lon); }
  changed(path, { rerender: groupOf(path) });
}

/* ---------- issues ---------- */

function createIssue() {
  const prev = [...S.issues.values()].sort((a, b) => b.number - a.number)[0];
  const number = prev ? prev.number + 1 : 1;
  const issue = normalize(blankIssue({ number, previous: prev }));
  if (S.removed.has(number)) {
    S.removed.delete(number);
    for (const p of S.base.files.keys()) if (p.startsWith(`content/issues/${pad2(number)}/`) && !p.endsWith('/issue.json')) S.deleted.add(p);
  }
  S.issues.set(number, issue);
  S.current = number;
  return issue;
}

function selectIssue(n) {
  S.current = n;
  S.showErrors = false;
  renderAll();
  persist();
}

/* ---------- saving ---------- */

async function commitAll({ publishing = false } = {}) {
  const files = changes();
  if (!files.length) return null;
  const live = touchesLiveSite(files);
  S.busy = true;
  updateStatus('Saving…');
  try {
    const res = await S.gh.commit({
      message: commitMessage(publishing),
      files,
      onProgress: p => updateStatus(p.step === 'upload' ? `Uploading ${p.done} of ${p.total}…` : p.step === 'retry' ? 'Catching up with another save…' : 'Saving…'),
    });
    await readBase();
    for (const [p, m] of S.pending) S.cache.set(p, m.url);
    S.pending.clear();
    S.deleted.clear();
    S.removed.clear();
    S.orig = snapshot();
    await idb.clear();
    store.del(KEY.work());
    return { ...res, live };
  } finally {
    S.busy = false;
    updateStatus('');
    renderPicker();
  }
}

async function save() {
  if (S.busy) return;
  if (!changes().length) return toast('Nothing new to save.');
  try {
    const res = await commitAll();
    if (!res) return;
    rerenderGroup('issue');
    if (res.live) {
      toast('Saved. Updating the live site…');
      followDeploy(res.sha);
    } else toast('Saved. Drafts stay private until you publish.');
  } catch (e) {
    toast(e.message, 'error');
    if (e.status === 401) signIn(e.message);
  }
}

// Background deploy tracking for ordinary saves; the publish dialog shows its own steps.
function followDeploy(sha, onStep) {
  S.deploy?.abort();
  const ctrl = new AbortController();
  S.deploy = ctrl;
  const words = { queued: 'Live site: queued…', building: 'Live site: building…', deploying: 'Live site: going live…', live: 'Live site updated', failed: 'Live site: deploy failed', unknown: '' };
  return waitForDeploy(S.gh, sha, {
    siteUrl: S.mock ? '' : siteBase(),
    signal: ctrl.signal,
    onStep: (step, info) => {
      if (onStep) onStep(step, info);
      else if (step === 'live' || step === 'failed') { updateStatus(''); toast(words[step], step === 'failed' ? 'error' : ''); }
      else updateStatus(words[step] || info?.text || '');
    },
  }).catch(() => 'stopped').finally(() => { if (!onStep) updateStatus(''); });
}

/* ---------- publish ---------- */

const STEPS = ['Make the link-preview card', 'Save to GitHub', 'Build the site', 'Go live'];

function openPublish() {
  const issue = cur();
  const { errors, warnings } = validateIssue(issue, { friends: S.friends });
  const live = issue.status === 'published';
  const url = issueUrl(siteBase(), issue.number);
  const list = (items, cls, title) => items.length ? `<div class="st-check ${cls}"><h3>${title}</h3><ul>${items.map(e => `<li><button type="button" class="st-link" data-act="goto" data-path="${esc(e.path)}">${esc(e.msg)}</button></li>`).join('')}</ul></div>` : '';
  dialog(`<header class="st-dh"><h2>${live ? 'Update' : 'Publish'} No. ${pad2(issue.number)}</h2><button type="button" class="st-x" data-act="close" aria-label="Close">✕</button></header>
<div class="st-db" id="st-pub">
${errors.length ? list(errors, 'is-error', 'Fix these first') : `<p class="st-ready"><span aria-hidden="true">✓</span> ${esc(headline(issue))} is ready to go.</p>`}
${list(warnings, 'is-warn', 'Worth a look')}
<p class="st-muted">${live ? 'Your changes go live at' : 'It goes live at'} <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>, usually within two minutes. A link-preview card is drawn from your cover for WhatsApp and email.</p>
<ol class="st-steps" id="st-steps" hidden>${STEPS.map(s => `<li><i aria-hidden="true"></i><span>${s}</span><small></small></li>`).join('')}</ol>
</div>
<footer class="st-df" id="st-pub-f"><button type="button" class="st-btn st-btn-quiet" data-act="close">Not yet</button><button type="button" class="st-btn st-btn-primary" data-act="do-publish"${errors.length ? ' disabled' : ''}>${live ? 'Update it' : 'Publish now'}</button></footer>`);
}

function step(i, state, note = '') {
  const li = $$('#st-steps li')[i];
  if (!li) return;
  li.dataset.state = state;
  li.querySelector('small').textContent = note;
}

async function publish() {
  const issue = cur();
  const before = clone(issue);
  const pendingBefore = new Set(S.pending.keys());
  const deletedBefore = new Set(S.deleted);
  $('#st-steps').hidden = false;
  $('#st-pub-f').innerHTML = '<p class="st-muted">Working on it. You can close this; it carries on.</p>';
  let committed = null;
  try {
    step(0, 'active');
    issue.status = 'published';
    if (!issue.date) issue.date = todayISO();
    delete issue.sample;
    try {
      const card = await socialCard({ issue, site: S.site, photo: await mediaBlob(issue.number, issue.cover.photo) });
      const rel = `media/card-${rand()}.jpg`;
      putMedia(issue.number, rel, card.blob);
      replaceRef(issue, 'card', rel);
      step(0, 'done');
    } catch {
      step(0, 'skip', 'Skipped; the cover photo is used instead.');
    }
    step(1, 'active');
    committed = await commitAll({ publishing: true });
    step(1, 'done', committed ? committed.sha.slice(0, 7) : 'No changes');
    renderAll();
    if (!committed) throw new Error('Nothing changed, so there was nothing to publish.');
    step(2, 'active');
    const result = await followDeploy(committed.sha, (s, info) => {
      if (s === 'queued') step(2, 'active', 'Waiting in line…');
      if (s === 'building') step(2, 'active', info?.text || 'Building…');
      if (s === 'deploying') { step(2, 'done'); step(3, 'active', info?.text || ''); }
      if (s === 'unknown') step(2, 'active', info?.text || '');
      if (s === 'failed') { step(2, 'fail', info?.text || 'Failed'); }
    });
    if (result === 'live' || result === 'unknown') {
      step(2, 'done');
      step(3, 'done', result === 'live' ? 'Live now' : 'Should be live shortly');
      const url = issueUrl(siteBase(), issue.number);
      $('#st-pub-f').innerHTML = `<a class="st-btn st-btn-quiet" href="${esc(url)}" target="_blank" rel="noopener">Open it ↗</a><button type="button" class="st-btn st-btn-primary" data-act="share">Send it to friends →</button>`;
    } else {
      $('#st-pub-f').innerHTML = `<p class="st-muted">Your changes are saved on GitHub, but the site didn't rebuild. Check the Actions tab on GitHub.</p><button type="button" class="st-btn" data-act="close">Close</button>`;
    }
  } catch (e) {
    if (!committed) {
      // Put things back the way they were so nothing looks published that isn't.
      for (const p of S.pending.keys()) if (!pendingBefore.has(p)) dropMedia(p);
      S.deleted = deletedBefore;
      S.issues.set(issue.number, before);
      renderAll();
    }
    const failed = $$('#st-steps li').findIndex(li => li.dataset.state === 'active');
    if (failed >= 0) step(failed, 'fail', e.message);
    $('#st-pub-f').innerHTML = `<p class="st-alert">${esc(e.message)}</p><button type="button" class="st-btn" data-act="close">Close</button>`;
    if (e.status === 401) signIn(e.message);
  }
}

/* ---------- share ---------- */

function contacts() { return store.get(KEY.contacts) || {}; }
const clip = {};

// Who an issue goes to: each friend group, plus friends in no group (the shared page).
function audiences() {
  const list = S.groups.map(g => ({ key: g.id, label: g.name, group: g, friends: audienceFriends(S.friends, S.groups, g.id) }));
  const rest = audienceFriends(S.friends, S.groups, '');
  if (!S.groups.length || rest.length) list.push({ key: '', label: S.groups.length ? 'Not in a group' : 'Everyone', group: null, friends: rest });
  return list;
}

function openShare(key = S.shareKey) {
  const all = audiences();
  const aud = all.find(a => a.key === key) || all[0];
  S.shareKey = aud.key;
  const g = aud.group;
  const issue = cur();
  const site = S.site;
  const base = siteBase();
  const url = issueUrl(base, issue.number, '', g?.slug);
  const mediaBase = issueUrl(base, issue.number); // photos live with the shared page
  const book = contacts();
  const emails = aud.friends.map(f => book[f.name]?.email).filter(Boolean);
  const img = issue.card || issue.cover?.photo;
  const parts = emailParts({ site, issue, url, imageUrl: img ? `${mediaBase}${img}` : '', name: g?.salutation || '' });
  const bcc = bccMailto({ emails, site, issue, url, self: site.reply?.email });
  const rows = personalLinks({ friends: aud.friends, contacts: book, siteUrl: base, site, issue, slug: g?.slug });
  Object.assign(clip, {
    wa: whatsappText({ site, issue, url, name: g?.salutation || '' }), subject: parts.subject, html: parts.html, text: parts.text,
    emails: emails.join(', '), glink: g ? groupLink(base, g.slug) : '',
  });
  const live = issue.status === 'published';
  const cardPath = issue.card ? mediaFile(issue.number, issue.card) : '';
  dialog(`<header class="st-dh"><h2>Send No. ${pad2(issue.number)}</h2><button type="button" class="st-x" data-act="close" aria-label="Close">✕</button></header>
<div class="st-db st-share">
${all.length > 1 ? `<div class="st-aud"><span class="st-label">Send to</span><div class="st-seg st-seg-wrap" role="radiogroup" aria-label="Send to">${all.map(a => `<button type="button" role="radio" aria-checked="${a.key === aud.key}" data-act="share-aud" data-key="${esc(a.key)}">${esc(a.label)} <small>${a.friends.length}</small></button>`).join('')}</div></div>` : ''}
${live ? `<p class="st-ready"><span aria-hidden="true">✓</span> Live at <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>` : '<p class="st-alert">This issue is still a draft. The links below start working once you publish it.</p>'}
${g ? `<section class="st-share-s"><h3><span>★</span> ${esc(g.name)} link</h3>
<p class="st-muted">Pin it in the ${esc(g.name)} group chat. It always opens the newest postcard, greeting them as "${esc(g.salutation || g.name)}", with only this group on the map.</p>
<div class="st-row"><input class="st-input" value="${esc(clip.glink)}" readonly aria-label="${esc(g.name)} link"><button type="button" class="st-btn st-btn-quiet" data-act="copy" data-key="glink">Copy</button></div>
</section>` : ''}

<section class="st-share-s"><h3><span>1</span> WhatsApp</h3>
<p class="st-muted">Paste it into a chat, a group or a broadcast list. The link preview shows the card below.</p>
<textarea class="st-input" rows="6" id="st-wa" data-clip="wa">${esc(clip.wa)}</textarea>
<div class="st-row"><button type="button" class="st-btn st-btn-quiet" data-act="copy" data-key="wa">Copy message</button><a class="st-btn st-btn-quiet" id="st-wa-open" href="${esc(waLink('', clip.wa))}" target="_blank" rel="noopener">Open WhatsApp ↗</a></div>
</section>

<section class="st-share-s"><h3><span>2</span> Email</h3>
<div class="st-field"><label class="st-label" for="st-subj">Subject</label><div class="st-row"><input class="st-input" id="st-subj" value="${esc(parts.subject)}" readonly><button type="button" class="st-btn st-btn-quiet" data-act="copy" data-key="subject">Copy</button></div></div>
<iframe class="st-mailpv" id="st-mailpv" title="Email preview"></iframe>
<div class="st-row"><button type="button" class="st-btn st-btn-quiet" data-act="copy-email">Copy email</button>${emails.length ? `<a class="st-btn st-btn-quiet" href="${esc(bcc.href)}">Open in mail app · BCC ${emails.length} ↗</a><button type="button" class="st-btn st-btn-quiet" data-act="copy" data-key="emails">Copy addresses</button>` : ''}</div>
<p class="st-muted">${emails.length
    ? `${bcc.tooLong ? "That's a long link, and some mail apps cut it off. If the BCC line comes up short, use Copy email and Copy addresses instead. " : ''}Everyone goes in BCC, so friends don't see each other's addresses.`
    : 'Add friends\' email addresses under <button type="button" class="st-link" data-act="friends">Friends</button> to send with BCC in one go. They stay on this device.'}</p>
</section>

<section class="st-share-s"><h3><span>3</span> Personal links</h3>
<p class="st-muted">Each link greets that friend by name and puts them on the map.</p>
<ul class="st-people">${rows.map((r, i) => `<li><span class="st-who"><b>${esc(r.name)}</b><small>${esc(r.city)}</small></span><span class="st-row">
<button type="button" class="st-btn st-btn-quiet st-btn-sm" data-act="copy-link" data-index="${i}">Copy link</button>
<a class="st-btn st-btn-quiet st-btn-sm" href="${esc(r.wa)}" target="_blank" rel="noopener">${r.whatsapp ? 'WhatsApp' : 'WhatsApp…'}</a>
${r.mail ? `<a class="st-btn st-btn-quiet st-btn-sm" href="${esc(r.mail)}">Email</a>` : ''}</span></li>`).join('') || '<li class="st-muted">No friends on the list yet.</li>'}</ul>
</section>

<section class="st-share-s"><h3><span>4</span> Social card</h3>
<p class="st-muted">The picture WhatsApp, iMessage and email show for the link. It's redrawn every time you publish.</p>
${cardPath ? `<img class="st-card-img" data-thumb="${esc(cardPath)}" src="${esc(mediaSrc(cardPath))}" alt="Social card for No. ${pad2(issue.number)}">` : '<p class="st-hint">No card yet. One is made when you publish.</p>'}
<div class="st-row"><button type="button" class="st-btn st-btn-quiet" data-act="new-card">${cardPath ? 'Redraw it now' : 'Make one now'}</button></div>
</section>
</div>`, 'is-wide');
  S.shareRows = rows;
  // The preview shows the image from this browser; the copied email points at the live site.
  const liveImg = img ? `${mediaBase}${img}` : '';
  const localImg = img ? mediaSrc(mediaFile(issue.number, img)) : '';
  const pvHtml = liveImg ? parts.html.split(`src="${esc(liveImg)}"`).join(`src="${esc(localImg)}" data-live="${esc(liveImg)}"`) : parts.html;
  const pv = $('#st-mailpv');
  pv.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${esc(FONTS)}"><style>body{margin:0}</style></head><body>${pvHtml}</body></html>`;
  $('#st-wa').addEventListener('input', e => {
    clip.wa = e.target.value;
    $('#st-wa-open').href = waLink('', clip.wa);
  });
}

async function copyText(text, done = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast(done);
}

async function copyEmail() {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([clip.html], { type: 'text/html' }),
      'text/plain': new Blob([clip.text], { type: 'text/plain' }),
    })]);
  } catch {
    const doc = $('#st-mailpv').contentDocument;
    const imgs = [...doc.querySelectorAll('img[data-live]')];
    const local = imgs.map(im => im.src);
    imgs.forEach(im => { im.src = im.dataset.live; });
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    const sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    doc.execCommand('copy');
    sel.removeAllRanges();
    imgs.forEach((im, i) => { im.src = local[i]; });
  }
  toast('Email copied. Paste it into a new message.');
}

async function newCard() {
  const issue = cur();
  try {
    const card = await socialCard({ issue, site: S.site, photo: await mediaBlob(issue.number, issue.cover?.photo) });
    const rel = `media/card-${rand()}.jpg`;
    putMedia(issue.number, rel, card.blob);
    replaceRef(issue, 'card', rel);
    changed('card');
    openShare();
    toast(issue.status === 'published' ? 'New card ready. Save to put it on the live site.' : 'New card ready.');
  } catch (e) {
    toast(`Couldn't draw the card: ${e.message}`, 'error');
  }
}

/* ---------- friends ---------- */

let tzList;
function timeZones() {
  try { tzList ||= Intl.supportedValuesOf('timeZone'); } catch { tzList = []; }
  return tzList;
}

function openFriends() {
  const book = contacts();
  dialog(`<header class="st-dh"><h2>Friends</h2><button type="button" class="st-x" data-act="close" aria-label="Close">✕</button></header>
<div class="st-db">
<h3 class="st-h3">Groups</h3>
<p class="st-muted">Each group gets its own page for every issue: only its own friends on the map, only its own replies in the Mailbag, and its own greeting and P.S. Friends in no group see the shared page.</p>
<ol class="st-groups">${S.groups.map((g, i) => groupRowHTML(g, i)).join('')}</ol>
<div class="st-row st-group-add"><label class="sr-only" for="st-new-group">New group name</label><input class="st-input" id="st-new-group" placeholder="New group, like College or Work"><button type="button" class="st-btn st-btn-quiet" data-act="group-add">Add group</button></div>
<h3 class="st-h3">People</h3>
<p class="st-muted"><b>Name, city and time zone show on the site</b> in "Who's awake" for their group, so anyone with that link can see them; they're also saved to the repository. First names are plenty. <b>Email and WhatsApp stay on this device</b> and are never saved to GitHub; use them to send personal links.</p>
<ol class="st-friends" id="st-friends">${S.friends.map((f, i) => friendHTML(f, i, book[f.name] || {})).join('')}</ol>
<datalist id="st-tzs">${timeZones().map(z => `<option value="${esc(z)}">`).join('')}</datalist>
<div class="st-row"><button type="button" class="st-btn st-btn-quiet" data-act="friend-add">Add a friend</button><span class="st-spacer"></span>
<button type="button" class="st-btn st-btn-quiet st-btn-sm" data-act="contacts-export">Back up private details</button>
<label class="st-btn st-btn-quiet st-btn-sm st-file">Restore<input type="file" accept="application/json,.json" data-contacts-import></label></div>
</div>
<footer class="st-df"><button type="button" class="st-btn st-btn-primary" data-act="close">Done</button></footer>`, 'is-wide');
}

function groupRowHTML(g, i) {
  const count = S.friends.filter(f => (f.groups || []).includes(g.id)).length;
  return `<li class="st-group" data-group-i="${i}">
<div class="st-field is-half"><label class="st-label" for="gr-${i}-name">Name</label><input class="st-input" id="gr-${i}-name" data-gr="name" value="${esc(g.name)}"></div>
<div class="st-field is-half"><label class="st-label" for="gr-${i}-sal">Greeting</label><div class="st-row st-dear"><span>Dear</span><input class="st-input" id="gr-${i}-sal" data-gr="salutation" value="${esc(g.salutation || '')}" placeholder="college crew"></div></div>
<p class="st-hint st-group-meta">${count} friend${count === 1 ? '' : 's'} · pin <code>${esc(groupLink(siteBase(), g.slug))}</code> in the group chat; it always shows the newest issue. <button type="button" class="st-link is-danger" data-act="group-del" data-index="${i}">Remove group</button></p>
</li>`;
}

function friendHTML(f, i, c) {
  const id = k => `fr-${i}-${k}`;
  return `<li class="st-friend" data-friend="${i}">
<div class="st-field is-half"><label class="st-label" for="${id('name')}">Name</label><input class="st-input" id="${id('name')}" data-fr="name" value="${esc(f.name || '')}" placeholder="First name"></div>
<div class="st-field is-half"><label class="st-label" for="${id('city')}">City</label><div class="st-row"><input class="st-input" type="text" id="${id('city')}" data-fr="city" value="${esc(f.city || '')}"><button type="button" class="st-btn st-btn-quiet st-btn-sm" data-act="friend-geo" data-path="friend-${i}">Find</button></div><div class="st-geo" hidden></div></div>
<div class="st-field is-half"><label class="st-label" for="${id('tz')}">Time zone</label><input class="st-input" id="${id('tz')}" data-fr="tz" list="st-tzs" value="${esc(f.tz || '')}" placeholder="Europe/Berlin"><small class="st-hint">${f.lat != null && f.lon != null ? `Pinned at ${esc(fmtCoords(f.lat, f.lon))}${f.country ? `, ${esc(f.country)}` : ''}` : 'Press Find to pin them on the map.'}</small></div>
<div class="st-field is-half st-private"><label class="st-label" for="${id('email')}">Email <em>on this device only</em></label><input class="st-input" type="email" id="${id('email')}" data-pr="email" value="${esc(c.email || '')}" autocomplete="off"></div>
<div class="st-field is-half st-private"><label class="st-label" for="${id('wa')}">WhatsApp <em>on this device only</em></label><input class="st-input" type="tel" id="${id('wa')}" data-pr="whatsapp" value="${esc(c.whatsapp || '')}" placeholder="+49 151 2345678" autocomplete="off"></div>
${S.groups.length ? `<fieldset class="st-field st-fgroups"><legend class="st-label">Groups</legend><div class="st-chips">${S.groups.map(g => `<label class="st-chip"><input type="checkbox" data-fg="${esc(g.id)}"${(f.groups || []).includes(g.id) ? ' checked' : ''}><span>${esc(g.name)}</span></label>`).join('')}</div></fieldset>` : ''}
<div class="st-field is-half st-friend-x"><button type="button" class="st-link is-danger" data-act="friend-del" data-index="${i}">Remove ${esc(f.name || 'friend')}</button></div>
</li>`;
}

function onFriendInput(e) {
  const t = e.target;
  const li = t.closest('[data-friend]');
  if (!li) return;
  const i = Number(li.dataset.friend);
  const f = S.friends[i];
  const book = contacts();
  if (t.dataset.fg) {
    const set = new Set(f.groups || []);
    if (t.checked) set.add(t.dataset.fg); else set.delete(t.dataset.fg);
    f.groups = [...set];
  } else if (t.dataset.fr) {
    const old = f.name;
    f[t.dataset.fr] = t.value;
    if (t.dataset.fr === 'name' && book[old]) { book[t.value] = book[old]; delete book[old]; store.set(KEY.contacts, book); }
  } else if (t.dataset.pr) {
    book[f.name] = { ...(book[f.name] || {}), [t.dataset.pr]: t.value.trim() };
    store.set(KEY.contacts, book);
    return;
  }
  updateStatus();
  persist();
}

function exportContacts() {
  const blob = new Blob([JSON.stringify(contacts(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'postcards-contacts.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Saved to your downloads. Keep it somewhere private.');
}

async function importContacts(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    const clean = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { email: String(v?.email || ''), whatsapp: String(v?.whatsapp || '') }]));
    store.set(KEY.contacts, { ...contacts(), ...clean });
    openFriends();
    toast('Private details restored.');
  } catch {
    toast("That file doesn't look like a contacts backup.", 'error');
  }
}

/* ---------- settings ---------- */

function openSettings() {
  const s = S.site;
  const f = (path, label, hint = '', type = 'text', ph = '') => `<div class="st-field"><label class="st-label" for="set-${path}">${label}</label><input class="st-input" type="${type}" id="set-${path}" data-site="${path}" value="${esc(getPath(s, path) ?? '')}" placeholder="${esc(ph)}">${hint ? `<small class="st-hint">${hint}</small>` : ''}</div>`;
  dialog(`<header class="st-dh"><h2>Settings</h2><button type="button" class="st-x" data-act="close" aria-label="Close">✕</button></header>
<div class="st-db">
<h3 class="st-h3">The newsletter</h3>
<div class="st-grid">${f('title', 'Name', 'The word on the masthead.', 'text', 'Postcards')}${f('author', 'Your name', 'Signs every letter.')}${f('description', 'One-line description')}</div>
<h3 class="st-h3">Replies</h3>
<p class="st-muted">Friends reply by WhatsApp or email in one tap. These go into the page so the buttons work, so anyone with the link can see them.</p>
<div class="st-grid">${f('reply.whatsapp', 'WhatsApp number', 'International format. Spaces and + are fine.', 'tel', '+44 7700 900123')}${f('reply.email', 'Email address', '', 'email', 'you@example.com')}</div>
<h3 class="st-h3">Address</h3>
<div class="st-grid">${f('baseUrl', 'Site address', 'Leave empty to use the GitHub Pages address. Set it if you add your own domain.', 'url', siteBase())}</div>
<h3 class="st-h3">Account</h3>
<p class="st-muted">${S.user ? `Signed in as <b>${esc(S.user.login)}</b>. ` : ''}Saving to <b>${esc(S.repo)}</b> on branch <b>${esc(S.branch)}</b>.${S.mock ? ' (Practice mode.)' : ''}</p>
<div class="st-row"><button type="button" class="st-btn st-btn-quiet" data-act="sign-out">Sign out on this device</button></div>
</div>
<footer class="st-df"><button type="button" class="st-btn st-btn-primary" data-act="close">Done</button></footer>`);
}

/* ---------- dialog ---------- */

function dialog(html, cls = '') {
  const d = $('#st-dialog');
  d.className = `st-dialog ${cls}`;
  d.innerHTML = html;
  if (!d.open) d.showModal();
  return d;
}

function closeDialog() {
  const d = $('#st-dialog');
  if (d.open) d.close();
}

/* ---------- preview ---------- */

const frame = () => $('#st-frame');
let pvTimer;
function schedulePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(renderPreview, 140);
}

function previewCtx() {
  return forAudience({
    site: S.site, friends: S.friends, groups: S.groups, root: '../',
    issues: [...S.issues.values()].filter(i => i.status === 'published' || i.number === S.current),
    media: (issue, src) => mediaSrc(mediaFile(issue.number, src)),
  }, previewAudience().group);
}

function frameStart() {
  S.frameReady = false;
  const issue = cur();
  frame().srcdoc = `<!doctype html><html lang="en" data-preview style="${colorVars(issue.color)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${esc(FONTS)}"><link rel="stylesheet" href="../assets/issue.css?v=${V}"><script type="module" src="../assets/issue.js?v=${V}"></script></head><body>${renderIssueBody(issue, previewCtx())}</body></html>`;
}

function onFrameLoad() {
  const f = frame();
  const doc = f.contentDocument;
  S.frameReady = true;
  doc.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    if (a.getAttribute('href').startsWith('#')) return;
    e.preventDefault();
    toast(/^https:\/\/wa\.me/.test(a.href) ? 'On the real page this opens WhatsApp with the reply written out.'
      : /^mailto:/.test(a.href) ? 'On the real page this opens the mail app with the reply written out.' : 'Links are switched off in the preview.');
  });
  mountPreview();
}

function mountPreview(tries = 0) {
  const w = frame()?.contentWindow;
  if (w?.Postcards) w.Postcards.mount({ to: previewAudience().to, preview: true });
  else if (tries < 40) setTimeout(() => mountPreview(tries + 1), 50);
}

function renderPreview() {
  const f = frame();
  if (!f) return;
  if (!S.frameReady || !f.contentWindow?.Postcards) return frameStart();
  const issue = cur();
  const doc = f.contentDocument;
  const y = f.contentWindow.scrollY;
  doc.documentElement.setAttribute('style', colorVars(issue.color));
  doc.body.innerHTML = renderIssueBody(issue, previewCtx());
  mountPreview();
  f.contentWindow.scrollTo(0, y);
}

function scrollPreviewTo(group) {
  const f = frame();
  const el = S.frameReady && f.contentDocument.querySelector(PREVIEW_TARGET[group] || '');
  if (el) f.contentWindow.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + f.contentWindow.scrollY - 16), behavior: 'smooth' });
}

function layoutPreview() {
  const stage = $('#st-stage');
  const dev = $('#st-device');
  if (!stage || !dev) return;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (!W || !H) return;
  // On a phone-sized screen the preview simply fills the stage; elsewhere it sits in a device frame.
  const bare = S.device === 'phone' && W < 520;
  const phone = S.device === 'phone' && !bare;
  const target = bare ? W : phone ? 390 : 1280;
  const pad = phone ? 28 : 0;
  const scale = Math.min(1, (W - pad * 2) / target);
  const h = phone ? Math.min(H - pad * 2, 860) : H;
  stage.dataset.device = bare ? 'bare' : S.device;
  dev.style.width = `${target * scale}px`;
  dev.style.height = `${h}px`;
  Object.assign(frame().style, { width: `${target}px`, height: `${h / scale}px`, transform: `scale(${scale})` });
}

/* ---------- events ---------- */

const ACT = {
  'new-issue': () => {
    const i = createIssue();
    selectIssue(i.number);
    toast(`Started No. ${pad2(i.number)}. It's a draft until you publish.`);
  },
  friends: () => openFriends(),
  settings: () => openSettings(),
  share: () => openShare(),
  save: () => save(),
  publish: () => openPublish(),
  'do-publish': () => publish(),
  close: () => closeDialog(),
  'banner-close': () => { $('#st-banner').hidden = true; },
  'discard-work': async () => {
    store.del(KEY.work());
    await idb.clear();
    location.reload();
  },
  goto: b => {
    closeDialog();
    S.showErrors = true;
    renderForm();
    setView('edit');
    const path = b.dataset.path;
    const el = $(`[data-path="${CSS.escape(path)}"]`) || $(`[data-media="${CSS.escape(path)}"]`) || document.getElementById(`g-${groupOf(path)}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (el?.focus) setTimeout(() => el.focus({ preventScroll: true }), 300);
  },
  geo: b => findPlace(b, r => applyIssuePlace(b.dataset.path, r)),
  'geo-pick': b => {
    const g = S.geo[b.dataset.path];
    const r = g?.results[Number(b.dataset.index)];
    b.closest('.st-geo').hidden = true;
    if (r) g.apply(r);
  },
  'media-remove': b => {
    replaceRef(cur(), b.dataset.path, '');
    changed(b.dataset.path, { rerender: groupOf(b.dataset.path) });
  },
  'item-add': b => {
    const def = fieldDef(b.dataset.list);
    const issue = cur();
    const list = getPath(issue, b.dataset.list) || [];
    list.push(clone(def.item));
    setPath(issue, b.dataset.list, list);
    changed(b.dataset.list, { rerender: groupOf(b.dataset.list) });
    const items = $$(`[data-list="${CSS.escape(b.dataset.list)}"] .st-item`);
    items.at(-1)?.querySelector('input, textarea')?.focus();
  },
  'item-del': b => {
    const list = getPath(cur(), b.dataset.list);
    const [gone] = list.splice(Number(b.dataset.index), 1);
    for (const v of Object.values(gone || {})) if (typeof v === 'string' && v.startsWith('media/')) dropMedia(mediaFile(cur().number, v));
    changed(b.dataset.list, { rerender: groupOf(b.dataset.list) });
  },
  'item-up': b => moveItem(b, -1),
  'item-down': b => moveItem(b, 1),
  'tag-del': b => {
    getPath(cur(), b.dataset.path).splice(Number(b.dataset.index), 1);
    changed(b.dataset.path, { rerender: groupOf(b.dataset.path) });
  },
  'delete-issue': () => {
    const issue = cur();
    if (issue.status === 'published') return;
    if (!confirm(`Delete draft No. ${pad2(issue.number)}? This happens when you save.`)) return;
    for (const p of S.pending.keys()) if (p.startsWith(`content/issues/${pad2(issue.number)}/`)) dropMedia(p);
    S.issues.delete(issue.number);
    if (S.orig.issues.has(issue.number)) S.removed.add(issue.number);
    if (!S.issues.size) createIssue();
    selectIssue(Math.max(...S.issues.keys()));
    toast('Draft deleted. Save to make it stick.');
  },
  unpublish: () => {
    if (!confirm(`Take No. ${pad2(cur().number)} off the site? Friends' links stop working once you save.`)) return;
    cur().status = 'draft';
    changed('status', { rerender: 'issue' });
    renderForm();
  },
  copy: b => copyText(clip[b.dataset.key] || ''),
  'copy-email': () => copyEmail(),
  'copy-link': b => copyText(S.shareRows[Number(b.dataset.index)].url, `Copied ${S.shareRows[Number(b.dataset.index)].name}'s link.`),
  'new-card': () => newCard(),
  'share-aud': b => openShare(b.dataset.key),
  'friend-add': () => {
    S.friends.push({ name: '', city: '', country: '', tz: '', lat: null, lon: null });
    openFriends();
    $$('#st-friends [data-fr="name"]').at(-1)?.focus();
    updateStatus();
  },
  'friend-del': b => {
    const i = Number(b.dataset.index);
    const [gone] = S.friends.splice(i, 1);
    const book = contacts();
    if (gone && book[gone.name]) { delete book[gone.name]; store.set(KEY.contacts, book); }
    openFriends();
    updateStatus();
    persist();
  },
  'friend-geo': b => {
    const i = Number(b.closest('[data-friend]').dataset.friend);
    findPlace(b, r => {
      Object.assign(S.friends[i], { city: r.name, country: r.country, tz: r.tz || S.friends[i].tz, lat: r.lat, lon: r.lon });
      openFriends();
      updateStatus();
      persist();
    });
  },
  'contacts-export': () => exportContacts(),
  'group-add': () => {
    const input = $('#st-new-group');
    const name = input.value.trim();
    if (!name) return input.focus();
    S.groups.push(newGroup(name, S.groups));
    openFriends();
    updateStatus();
    persist();
    toast(`Added ${name}. Tick it on each friend who belongs to it.`);
  },
  'group-del': b => {
    const g = S.groups[Number(b.dataset.index)];
    if (!confirm(`Remove the ${g.name} group? Its friends move to the shared page, and its links stop working once you save.`)) return;
    S.groups.splice(Number(b.dataset.index), 1);
    for (const f of S.friends) if (f.groups) f.groups = f.groups.filter(id => id !== g.id);
    if (S.previewAs === `g:${g.id}`) S.previewAs = '';
    openFriends();
    updateStatus();
    persist();
  },
  'sign-out': () => {
    if (changes().length && !confirm('You have unsaved changes. They stay on this device, but sign out anyway?')) return;
    store.del(KEY.token);
    store.del(KEY.token, 'session');
    location.reload();
  },
};

function moveItem(b, d) {
  const list = getPath(cur(), b.dataset.list);
  const i = Number(b.dataset.index);
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  changed(b.dataset.list, { rerender: groupOf(b.dataset.list) });
}

function wireApp() {
  const app = $('.st-app');
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && ACT[b.dataset.act]) {
      e.preventDefault();
      ACT[b.dataset.act](b, e);
      return;
    }
    const tab = e.target.closest('.st-tabs [data-view]');
    if (tab) setView(tab.dataset.view);
    const dev = e.target.closest('[data-device]');
    if (dev) setDevice(dev.dataset.device);
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      document.getElementById(`g-${jump.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollPreviewTo(jump.dataset.jump);
    }
  });
  const form = $('#st-form');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange);
  form.addEventListener('submit', e => e.preventDefault());
  let lastGroup = '';
  form.addEventListener('focusin', e => {
    const g = e.target.closest('[data-group]')?.dataset.group;
    if (g && g !== lastGroup) { lastGroup = g; scrollPreviewTo(g); }
  });
  form.addEventListener('keydown', e => {
    const t = e.target;
    if (!t.matches('[data-tag-in]') || !['Enter', ','].includes(e.key)) return;
    e.preventDefault();
    const v = t.value.trim().replace(/,$/, '');
    if (!v) return;
    const path = t.dataset.tagIn;
    const list = getPath(cur(), path) || [];
    if (!list.some(x => x.toLowerCase() === v.toLowerCase())) list.push(v);
    setPath(cur(), path, list);
    changed(path, { rerender: groupOf(path) });
    $(`[data-tag-in="${CSS.escape(path)}"]`)?.focus();
  });
  form.addEventListener('dragover', e => {
    const d = e.target.closest('[data-drop]');
    if (!d) return;
    e.preventDefault();
    d.classList.add('is-over');
  });
  form.addEventListener('dragleave', e => e.target.closest('[data-drop]')?.classList.remove('is-over'));
  form.addEventListener('drop', e => {
    const d = e.target.closest('[data-drop]');
    if (!d) return;
    e.preventDefault();
    d.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(d.dataset.drop, file);
  });

  $('#st-pick').addEventListener('change', e => selectIssue(Number(e.target.value)));
  $('#st-as').addEventListener('change', e => {
    S.previewAs = e.target.value;
    renderPicker();
    renderPreview();
  });
  frame().addEventListener('load', onFrameLoad);

  const d = $('#st-dialog');
  d.addEventListener('input', e => {
    if (e.target.closest('[data-friend]')) return onFriendInput(e);
    const gi = e.target.closest('[data-group-i]');
    if (gi && e.target.dataset.gr) {
      S.groups[Number(gi.dataset.groupI)][e.target.dataset.gr] = e.target.value;
      updateStatus();
      persist();
      return;
    }
    const sp = e.target.dataset.site;
    if (sp) {
      setPath(S.site, sp, e.target.value);
      updateStatus();
      persist();
    }
  });
  d.addEventListener('change', e => {
    if (e.target.matches('[data-contacts-import]') && e.target.files[0]) importContacts(e.target.files[0]);
    if (e.target.dataset.fr === 'tz' && e.target.value && !timeZones().includes(e.target.value)) toast(`"${e.target.value}" isn't a time zone I know. Try one from the list, like Europe/Berlin.`, 'warn');
  });
  d.addEventListener('close', () => {
    renderPreviewAs();
    ['letter', 'mailbag', 'awake'].forEach(rerenderGroup); // groups may have changed
    renderPicker();
    schedulePreview();
  });
  d.addEventListener('click', e => { if (e.target === d) closeDialog(); });

  new ResizeObserver(layoutPreview).observe($('#st-stage'));
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  addEventListener('beforeunload', e => {
    if (changes().length) e.preventDefault();
  });
}

boot();
