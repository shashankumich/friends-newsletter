#!/usr/bin/env node
// Local preview: builds the site, serves dist/ and rebuilds when content/ or src/ change.
// Usage: node scripts/serve.mjs [--port 8080] [--no-watch] [--mock-github]
//   --mock-github also starts a pretend GitHub API (scripts/mock-github.mjs) so the Studio can be
//   tried end to end without a real token. Nothing reaches GitHub.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const opt = name => argv.includes(name);
const port = Number(argv[argv.indexOf('--port') + 1]) || Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ico': 'image/x-icon',
};

// Each build runs in a fresh process: Node caches ES modules, so an in-process rebuild would keep old src/ code.
let building = Promise.resolve();
const runBuild = () => new Promise(resolve => {
  spawn(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SITE_URL: '' } }).on('exit', resolve);
});
const rebuild = () => (building = building.then(runBuild));

function send(req, res, file, status = 200) {
  const size = statSync(file).size;
  const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && status === 200) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(status, { ...headers, 'Content-Length': size });
  return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  await building;
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!rel.endsWith('/')) {
      res.writeHead(301, { Location: `${rel}/` });
      return res.end();
    }
    file = path.join(file, 'index.html');
  }
  if (existsSync(file)) return send(req, res, file);
  const notFound = path.join(DIST, '404.html');
  if (existsSync(notFound)) return send(req, res, notFound, 404);
  res.writeHead(404);
  res.end('Not found');
});

await rebuild();
server.listen(port, () => {
  console.log(`\n  Postcards preview: http://localhost:${port}/`);
  console.log(`  Studio:            http://localhost:${port}/studio/`);
});

if (opt('--mock-github')) {
  const { startMockGitHub } = await import('./mock-github.mjs');
  const mock = await startMockGitHub({ port: port + 1, contentDir: path.join(ROOT, 'content') });
  console.log(`  Mock GitHub API:   ${mock.url}  (open the Studio with ?api=${mock.url} and any token)`);
}

if (!opt('--no-watch')) {
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); };
  for (const dir of ['content', 'src']) watch(path.join(ROOT, dir), { recursive: true }, later);
  console.log('  Watching content/ and src/ for changes.\n');
}
