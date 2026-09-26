// Production server (Railway). Serves the hub, and every box repo at /<slug>/,
// exactly as the local dev server does. Boxes are public GitHub repos tagged
// with the box topic. The server downloads each one's latest code and media
// at start-up, checks for changes every 10 minutes, and can be told to check
// right away by POST /__sync (Authorization: Bearer $SYNC_TOKEN).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { ROOT, SITE, config, appsFromDirs } from './lib/apps.mjs';
import { pages } from './build.mjs';
import { csp } from './lib/analytics.mjs';

const PORT = Number(process.env.PORT || 8080);
const BOXES = path.join(process.env.BOXES_DIR || path.join(ROOT, '.boxes'));
const SITE_DIR = path.join(ROOT, 'site');
const EVERY = Number(process.env.SYNC_MINUTES || 10) * 60e3;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
  '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const TEXT = /^(text\/|application\/(json|xml|javascript|manifest)|image\/svg)/;
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=31536000', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- box sync
let state = { apps: [], pages: {}, gz: new Map(), synced: null, error: null };
const stateFile = path.join(BOXES, 'state.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };

async function listRepos() {
  const headers = { 'User-Agent': 'glassbox-server', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/users/${config.org}/repos?per_page=100&type=owner&sort=pushed`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()).filter((r) => !r.private && !r.archived && (r.topics || []).includes(config.topic));
}

// Streams the repo's tarball into a fresh folder, then swaps it in.
async function download(repo) {
  const url = `https://codeload.github.com/${repo.full_name}/tar.gz/refs/heads/${repo.default_branch}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${repo.name}: download ${res.status}`);
  const tmp = path.join(BOXES, `.${repo.name}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  await new Promise((ok, fail) => {
    const tar = spawn('tar', ['-xzf', '-', '-C', tmp, '--strip-components=1']);
    tar.on('error', fail);
    tar.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${repo.name}: tar exited ${code}`))));
    Readable.fromWeb(res.body).pipe(tar.stdin);
  });
  const dest = path.join(BOXES, repo.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
}

let syncing = null;
async function sync(reason) {
  if (syncing) return syncing;
  syncing = (async () => {
    fs.mkdirSync(BOXES, { recursive: true });
    const seen = readState();
    try {
      const repos = await listRepos();
      for (const r of repos) {
        if (seen[r.name] === r.pushed_at && fs.existsSync(path.join(BOXES, r.name, 'glassbox.json'))) continue;
        log(`sync ${r.name} (${reason})`);
        await download(r);
        seen[r.name] = r.pushed_at;
      }
      for (const name of Object.keys(seen)) if (!repos.some((r) => r.name === name)) { fs.rmSync(path.join(BOXES, name), { recursive: true, force: true }); delete seen[name]; }
      fs.writeFileSync(stateFile, JSON.stringify(seen, null, 2));
      state.error = null;
    } catch (e) {
      // Keep serving whatever we already have.
      state.error = e.message;
      log('sync failed:', e.message);
    }
    rebuild();
  })().finally(() => { syncing = null; });
  return syncing;
}

function rebuild() {
  const dirs = fs.existsSync(BOXES) ? fs.readdirSync(BOXES).filter((d) => !d.startsWith('.') && fs.existsSync(path.join(BOXES, d, 'glassbox.json'))).map((d) => path.join(BOXES, d)) : [];
  const apps = [];
  for (const d of dirs) { try { apps.push(...appsFromDirs([d])); } catch (e) { log(`skip ${path.basename(d)}: ${e.message}`); } }
  apps.sort((a, b) => b.box - a.box);
  state = { ...state, apps, pages: pages(apps), gz: new Map(), synced: new Date().toISOString() };
  log(`serving ${apps.length} box(es): ${apps.map((a) => a.slug).join(', ') || 'none'}`);
}

// ---------------------------------------------------------------- serving
function headers(type, extra = {}) {
  return { 'Content-Type': type, ...SECURITY, ...extra };
}

function send(req, res, code, body, type, cache = 'no-cache', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = headers(type, { 'Cache-Control': cache, Vary: 'Accept-Encoding', ...extra });
  if (TEXT.test(type) && buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const key = body;
    let z = typeof key === 'string' ? state.gz.get(key) : null;
    if (!z) { z = zlib.gzipSync(buf); if (typeof key === 'string' && state.gz.size < 500) state.gz.set(key, z); }
    res.writeHead(code, { ...h, 'Content-Encoding': 'gzip', 'Content-Length': z.length });
    return res.end(req.method === 'HEAD' ? undefined : z);
  }
  res.writeHead(code, { ...h, 'Content-Length': buf.length });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function cacheFor(file) {
  if (/\.(mp4|jpg|jpeg|png|webp|woff2|glb)$/.test(file)) return 'public, max-age=86400';
  if (/\.(js|mjs|css|svg)$/.test(file)) return 'public, max-age=600';
  return 'public, max-age=300';
}

function serveFile(req, res, file) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (st.isDirectory()) {
    if (!req.url.split('?')[0].endsWith('/')) { res.writeHead(301, { Location: req.url.split('?')[0] + '/' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''), ...SECURITY }); res.end(); return true; }
    return serveFile(req, res, path.join(file, 'index.html'));
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, ...SECURITY }); res.end(); return true; }
  const base = { 'Cache-Control': cacheFor(file), ETag: etag, 'Accept-Ranges': 'bytes' };
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range && st.size) {
    const start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]), end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    res.writeHead(206, headers(type, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
    if (req.method === 'HEAD') return res.end(), true;
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  if (TEXT.test(type) && st.size < 2e6) return send(req, res, 200, fs.readFileSync(file), type, base['Cache-Control'], { ETag: etag }), true;
  res.writeHead(200, headers(type, { ...base, 'Content-Length': st.size }));
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

function inside(root, rel) {
  const p = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'bad request', TYPES['.txt']); }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (p === '/__sync' && req.method === 'POST' && process.env.SYNC_TOKEN && req.headers.authorization === `Bearer ${process.env.SYNC_TOKEN}`) {
        sync('webhook');
        return send(req, res, 202, '{"ok":true}', TYPES['.json']);
      }
      return send(req, res, 405, 'method not allowed', TYPES['.txt']);
    }
    if (p === '/healthz') return send(req, res, 200, JSON.stringify({ ok: true, boxes: state.apps.map((a) => a.slug), synced: state.synced, error: state.error }), TYPES['.json'], 'no-store');
    if (p.startsWith('/__studio/')) return send(req, res, 404, 'The studio saves and ships only on a local dev server.', TYPES['.txt']);

    const key = p === '/' ? 'index.html' : p.replace(/^\//, '').replace(/\/$/, '/index.html');
    const gen = state.pages[key];
    if (gen) {
      const type = TYPES[path.extname(key)] || TYPES['.html'];
      const extra = type.startsWith('text/html') ? { 'Content-Security-Policy': csp({ frames: ['https://www.youtube-nocookie.com'] }) } : {};
      return send(req, res, 200, gen, type, key.endsWith('.html') ? 'public, max-age=120' : 'public, max-age=300', extra);
    }
    if (state.pages[key.replace(/index\.html$/, '').replace(/\/$/, '') + '/index.html'] && !p.endsWith('/')) {
      res.writeHead(301, { Location: p + '/', ...SECURITY }); return res.end();
    }

    const seg = p.split('/')[1];
    const box = state.apps.find((a) => a.slug === seg);
    if (box) {
      if (p === `/${seg}`) { res.writeHead(301, { Location: `/${seg}/`, ...SECURITY }); return res.end(); }
      // Keep repo plumbing private-ish: no dotfiles, no git metadata.
      if (!p.split('/').some((s) => s.startsWith('.'))) {
        const f = inside(box.dir, p.slice(seg.length + 1));
        if (f && serveFile(req, res, f)) return;
      }
    } else if (!p.split('/').some((s) => s.startsWith('.'))) {
      const f = inside(SITE_DIR, p);
      if (f && serveFile(req, res, f)) return;
    }
    send(req, res, 404, state.pages['404.html'] || 'Not found', TYPES['.html'], 'no-cache');
  } catch (e) {
    log(e);
    if (!res.headersSent) send(req, res, 500, 'Something went wrong.', TYPES['.txt']);
  }
});

rebuild();
server.listen(PORT, '0.0.0.0', () => log(`${config.brand} on :${PORT} as ${SITE}`));
sync('start');
setInterval(() => sync('timer'), EVERY).unref();
