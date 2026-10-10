#!/usr/bin/env node
// Builds the site into dist/ with no dependencies:
//   /               the latest published issue
//   /issues/NN/     every published issue, with its media
//   /archive/       all issues, newest first
//   /studio/        the no-code editor
//   For each friend group: /issues/NN/<slug>/, /archive/<slug>/ and /g/<slug>/ (always the latest)
// Usage: node scripts/build.mjs [--out dist] [--content content] [--site-url https://…]

import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pad2, validateIssue, validateGroups, momentKind } from '../src/schema.js';
import { renderIssuePage, renderArchivePage, renderNoticePage, forAudience, FONTS_URL, absUrl } from '../src/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const readJSON = async file => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(`Couldn't read ${path.relative(ROOT, file)}: ${e.message}`);
  }
};

export async function loadContent(contentDir) {
  const site = await readJSON(path.join(contentDir, 'site.json'));
  const friendsFile = path.join(contentDir, 'friends.json');
  const friends = existsSync(friendsFile) ? await readJSON(friendsFile) : [];
  const groupsFile = path.join(contentDir, 'groups.json');
  const groups = existsSync(groupsFile) ? await readJSON(groupsFile) : [];
  const issuesDir = path.join(contentDir, 'issues');
  const names = existsSync(issuesDir) ? (await readdir(issuesDir)).filter(n => /^\d+$/.test(n)).sort() : [];
  const issues = [];
  for (const dir of names) {
    const file = path.join(issuesDir, dir, 'issue.json');
    if (existsSync(file)) issues.push({ dir, issue: await readJSON(file) });
  }
  return { site, friends, groups, issues };
}

// Media an issue points at, as paths relative to its folder.
export function mediaRefs(issue) {
  const refs = [issue.cover?.photo, issue.card, issue.stamp];
  const kind = momentKind(issue.moment || {});
  if (issue.moment?.on !== false && kind === 'video') refs.push(issue.moment.video, issue.moment.poster);
  if (issue.moment?.on !== false && kind === 'photo') refs.push(issue.moment.photo);
  if (issue.roll?.on !== false) (issue.roll?.photos || []).forEach(p => refs.push(p.src));
  return refs.filter(r => r && !/^(https?:|data:)/.test(r));
}

function check({ friends, groups, issues }, contentDir) {
  const problems = [...validateGroups(groups, friends)];
  const seen = new Map();
  for (const { dir, issue } of issues) {
    const where = `issues/${dir}/issue.json`;
    if (pad2(issue.number) !== dir) problems.push(`${where} says it's No. ${issue.number}, so its folder should be issues/${pad2(issue.number)}/.`);
    if (seen.has(issue.number)) problems.push(`${where} and issues/${seen.get(issue.number)}/ are both No. ${issue.number}.`);
    seen.set(issue.number, dir);
    if (issue.status !== 'published') continue;
    for (const e of validateIssue(issue, { friends }).errors) problems.push(`${where}: ${e.msg} (${e.path})`);
    for (const ref of mediaRefs(issue)) {
      if (!existsSync(path.join(contentDir, 'issues', dir, ref))) problems.push(`${where} uses ${ref}, but that file isn't in issues/${dir}/.`);
    }
  }
  friends.forEach((f, i) => {
    if (!f.name) problems.push(`friends.json entry ${i + 1} has no name.`);
    if (f.tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: f.tz }); } catch { problems.push(`friends.json: ${f.name}'s time zone "${f.tz}" isn't recognised.`); } }
  });
  return problems;
}

// Fingerprint the assets and add ?v= to relative module imports so a deploy never mixes old and new files.
async function writeAssets(outDir) {
  const files = (await readdir(SRC)).filter(f => /\.(js|css)$/.test(f)).sort();
  const sources = await Promise.all(files.map(f => readFile(path.join(SRC, f), 'utf8')));
  const v = createHash('sha256').update(sources.join('\0')).digest('hex').slice(0, 10);
  await mkdir(path.join(outDir, 'assets'), { recursive: true });
  await Promise.all(files.map((f, i) => {
    let out = sources[i];
    if (f.endsWith('.js')) out = out.replace(/((?:from|import)\s*\(?\s*)(['"])\.\/([\w.-]+\.js)\2/g, `$1$2./$3?v=${v}$2`);
    return writeFile(path.join(outDir, 'assets', f), out);
  }));
  return v;
}

export async function build({
  contentDir = path.join(ROOT, 'content'),
  outDir = path.join(ROOT, 'dist'),
  siteUrl = process.env.SITE_URL || '',
  sha = process.env.GITHUB_SHA || '',
  log = console.log,
} = {}) {
  const content = await loadContent(contentDir);
  const { site, friends, groups } = content;
  const problems = check(content, contentDir);
  if (problems.length) throw new Error(`Build stopped. Fix these and try again:\n  - ${problems.join('\n  - ')}`);

  siteUrl = String(siteUrl || site.baseUrl || '').replace(/\/+$/, '');
  const all = content.issues.map(x => x.issue);
  const published = all.filter(i => i.status === 'published').sort((a, b) => a.number - b.number);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const v = await writeAssets(outDir);
  const shared = { site, friends, groups, issues: published, siteUrl, v };
  const ctx = forAudience(shared);
  const write = async (rel, html) => {
    await mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
    await writeFile(path.join(outDir, rel), html);
  };
  const comingSoon = c => renderNoticePage(c, { title: 'Postcards', heading: 'The first postcard is on its way.', text: `${site.author || 'Someone'} is writing it now. Check back soon.` });

  for (const issue of published) {
    const dir = `issues/${pad2(issue.number)}`;
    await write(`${dir}/index.html`, renderIssuePage(issue, { ...ctx, root: '../../' }));
    for (const g of groups) await write(`${dir}/${g.slug}/index.html`, renderIssuePage(issue, { ...forAudience(shared, g), root: '../../../' }));
    const media = path.join(contentDir, 'issues', pad2(issue.number), 'media');
    if (existsSync(media)) await cp(media, path.join(outDir, dir, 'media'), { recursive: true });
  }

  const latest = published.at(-1);
  await write('index.html', latest ? renderIssuePage(latest, { ...ctx, root: '' }) : comingSoon({ ...ctx, root: '' }));
  await write('archive/index.html', renderArchivePage({ ...ctx, root: '../' }));
  for (const g of groups) {
    const gc = forAudience(shared, g);
    await write(`archive/${g.slug}/index.html`, renderArchivePage({ ...gc, root: '../../' }));
    // A link to pin in the group chat: always the newest issue.
    await write(`g/${g.slug}/index.html`, latest ? renderIssuePage(latest, { ...gc, root: '../../' }) : comingSoon({ ...gc, root: '../../' }));
  }

  await mkdir(path.join(outDir, 'issues'), { recursive: true });
  await writeFile(path.join(outDir, 'issues', 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=../archive/"><title>Archive</title><a href="../archive/">All postcards</a>\n');

  // 404s can be served at any depth, so this page uses absolute paths from the site's base path.
  const base = siteUrl ? `${new URL(siteUrl).pathname.replace(/\/+$/, '')}/` : '/';
  await writeFile(path.join(outDir, '404.html'), renderNoticePage({ ...ctx, root: base }, {
    title: 'Return to sender', heading: 'Lost in the post.', text: "There's nothing at this address. The latest postcard is a click away.",
    link: { href: base, label: 'Read the latest postcard' },
  }));

  const studio = path.join(SRC, 'studio.html');
  if (existsSync(studio)) {
    await mkdir(path.join(outDir, 'studio'), { recursive: true });
    const config = { repo: site.repo || process.env.GITHUB_REPOSITORY || '', branch: site.branch || 'main' };
    const html = (await readFile(studio, 'utf8')).replaceAll('%V%', v).replaceAll('%FONTS%', FONTS_URL)
      .replaceAll('%CONFIG%', JSON.stringify(config).replace(/</g, '\\u003c'));
    await writeFile(path.join(outDir, 'studio', 'index.html'), html);
  }

  await writeFile(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await writeFile(path.join(outDir, '.nojekyll'), '');
  await writeFile(path.join(outDir, 'build.json'), `${JSON.stringify({
    sha, builtAt: new Date().toISOString(), siteUrl, issues: published.map(i => ({ number: i.number, url: absUrl(siteUrl, `issues/${pad2(i.number)}/`) })),
  }, null, 2)}\n`);

  const drafts = all.filter(i => i.status !== 'published').map(i => i.number);
  log(`Built ${published.length} published issue${published.length === 1 ? '' : 's'}${groups.length ? ` for ${groups.length + 1} audiences` : ''}${drafts.length ? ` (skipped draft${drafts.length === 1 ? '' : 's'} ${drafts.map(pad2).join(', ')})` : ''} into ${path.relative(process.cwd(), outDir) || '.'}/${siteUrl ? ` for ${siteUrl}` : ''}`);
  return { published: published.map(i => i.number), drafts, outDir, v, siteUrl };
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].split('=');
    const val = inline ?? argv[++i];
    if (k === '--out') o.outDir = path.resolve(val);
    else if (k === '--content') o.contentDir = path.resolve(val);
    else if (k === '--site-url') o.siteUrl = val;
    else { console.error(`Unknown option ${k}`); process.exit(2); }
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build(args(process.argv.slice(2))).catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
