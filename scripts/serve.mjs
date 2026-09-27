// Production server (Railway). Serves the hub, and every box repo at /<slug>/,
// exactly as the local dev server does. Boxes are public GitHub repos tagged
// with the box topic. The server downloads each one's latest code and media
// at start-up, checks for changes every 10 minutes, and can be told to check
// right away by POST /__sync (Authorization: Bearer $SYNC_TOKEN).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { ROOT, SITE, config, appsFromDirs } from './lib/apps.mjs';
import { pages } from './build.mjs';
import { csp } from './lib/analytics.mjs';
import { adminRoutes } from './lib/admin.mjs';
import { autoPublish } from './lib/publisher.mjs';
import { niceName } from './lib/buffer.mjs';

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
let state = { apps: [], pages: {}, tags: new Map(), synced: null, error: null };
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
      const stale = repos.filter((r) => !(seen[r.name] === r.pushed_at && fs.existsSync(path.join(BOXES, r.name, 'glassbox.json'))));
      const results = await Promise.allSettled(stale.map(async (r) => { log(`sync ${r.name} (${reason})`); await download(r); seen[r.name] = r.pushed_at; }));
      const failed = results.find((x) => x.status === 'rejected');
      if (failed) throw failed.reason;
      for (const name of Object.keys(seen)) if (!repos.some((r) => r.name === name)) { fs.rmSync(path.join(BOXES, name), { recursive: true, force: true }); delete seen[name]; }
      fs.writeFileSync(stateFile, JSON.stringify(seen, null, 2));
      state.error = null;
    } catch (e) {
      // Keep serving whatever we already have.
      state.error = e.message;
      log('sync failed:', e.message);
    }
    rebuild();
    state.ready = true;
    // New boxes go out on their own when auto-publish is on (one replica wins each box).
    autoPublish(state.apps, (m) => log(m)).catch((e) => log('auto-publish:', e.message));
  })().finally(() => { syncing = null; });
  return syncing;
}

function rebuild() {
  const dirs = fs.existsSync(BOXES) ? fs.readdirSync(BOXES).filter((d) => !d.startsWith('.') && fs.existsSync(path.join(BOXES, d, 'glassbox.json'))).map((d) => path.join(BOXES, d)) : [];
  const apps = [];
  for (const d of dirs) { try { apps.push(...appsFromDirs([d])); } catch (e) { log(`skip ${path.basename(d)}: ${e.message}`); } }
  apps.sort((a, b) => b.box - a.box);
  state = { ...state, apps, pages: pages(apps), tags: new Map(), synced: new Date().toISOString() };
  log(`serving ${apps.length} box(es): ${apps.map((a) => a.slug).join(', ') || 'none'}`);
}

// ---------------------------------------------------------------- serving
function headers(type, extra = {}) {
  return { 'Content-Type': type, ...SECURITY, ...extra };
}

// Compressed bodies are cached by ETag (or by the generated string), so each file is
// compressed once per version. Brotli when the browser takes it, gzip otherwise.
const zcache = new Map();
function send(req, res, code, body, type, cache = 'no-cache', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = headers(type, { 'Cache-Control': cache, Vary: 'Accept-Encoding', ...extra });
  const ae = req.headers['accept-encoding'] || '';
  const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
  if (TEXT.test(type) && buf.length > 1024 && enc) {
    const key = enc + ':' + (extra.ETag || (typeof body === 'string' ? hashOf(buf) : ''));
    let z = key.length > enc.length + 1 ? zcache.get(key) : null;
    if (!z) {
      z = enc === 'br' ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 10, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }) : zlib.gzipSync(buf, { level: 9 });
      if (key.length > enc.length + 1) { if (zcache.size > 2000) zcache.clear(); zcache.set(key, z); }
    }
    res.writeHead(code, { ...h, 'Content-Encoding': enc, 'Content-Length': z.length });
    return res.end(req.method === 'HEAD' ? undefined : z);
  }
  res.writeHead(code, { ...h, 'Content-Length': buf.length });
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const hashOf = (buf) => `"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20)}"`;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const notModified = (req, etag) => (req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag);

// A box page gets <link rel="modulepreload"> for its whole module graph, so the browser fetches
// app.js, the chapters, the kit and three.js in parallel instead of one import at a time.
// Its stylesheets and entry script get ?v=<content hash> and are cached for a year.
const boxPages = new Map();
function boxPage(dir, file, st) {
  const k = `${file}:${st.mtimeMs}:${st.size}`;
  if (boxPages.has(k)) return boxPages.get(k);
  let html = fs.readFileSync(file, 'utf8');
  const base = path.dirname(file);
  const ver = (rel) => { try { return hashOf(fs.readFileSync(path.join(base, rel))).slice(1, 11); } catch { return null; } };
  html = html.replace(/(<link[^>]+rel="stylesheet"[^>]+href=")(?!https?:|\/)([^"?]+)"/g, (m, a, rel) => { const v = ver(rel); return v ? `${a}${rel}?v=${v}"` : m; });
  let map = {};
  try { map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] || '{}').imports || {}; } catch { /* no import map */ }
  const resolve = (spec, from) => {
    if (map[spec]) return path.posix.normalize(map[spec].replace(/^\.\//, ''));
    const pre = Object.keys(map).find((k) => k.endsWith('/') && spec.startsWith(k));
    if (pre) return path.posix.normalize(map[pre].replace(/^\.\//, '') + spec.slice(pre.length));
    if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return null;
  };
  const entries = [...html.matchAll(/<script type="module" src="(?!https?:|\/)([^"?]+)"/g)].map((m) => path.posix.normalize(m[1]));
  const seen = new Set(), queue = [...entries];
  while (queue.length && seen.size < 200) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    let src; try { src = fs.readFileSync(path.join(base, rel), 'utf8'); } catch { continue; }
    seen.add(rel);
    for (const m of src.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) {
      const r = resolve(m[1] || m[2], rel);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  const pre = [...seen].filter((r) => !entries.includes(r)).map((r) => `<link rel="modulepreload" href="${r}">`).join('\n');
  if (pre) html = html.replace(/<\/head>/, `${pre}\n</head>`);
  const out = { body: html, etag: hashOf(Buffer.from(html)) };
  if (boxPages.size > 200) boxPages.clear();
  boxPages.set(k, out);
  return out;
}

function cacheFor(file) {
  if (/\.(mp4|jpg|jpeg|png|webp|woff2|glb)$/.test(file)) return 'public, max-age=86400';
  if (/\/vendor\//.test(file)) return 'public, max-age=86400';
  // Pages, styles and scripts always revalidate (a cheap 304), so a box update can never
  // pair new HTML with a stale stylesheet.
  return 'no-cache';
}

// ETag from content, not mtime: every sync rewrites the files, but unchanged files keep their tag.
const tags = new Map();
function etagFor(file, st) {
  const k = `${file}:${st.size}:${st.mtimeMs}`;
  let t = tags.get(k);
  if (!t) {
    t = st.size < 2e7 ? `"${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 20)}"` : `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (tags.size > 5000) tags.clear();
    tags.set(k, t);
  }
  return t;
}

function serveFile(req, res, file, boxDir) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (st.isDirectory()) {
    if (!req.url.split('?')[0].endsWith('/')) { res.writeHead(301, { Location: req.url.split('?')[0] + '/' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''), ...SECURITY }); res.end(); return true; }
    return serveFile(req, res, path.join(file, 'index.html'), boxDir);
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (boxDir && path.basename(file) === 'index.html' && path.dirname(file) === boxDir) {
    const page = boxPage(boxDir, file, st);
    if (notModified(req, page.etag)) { res.writeHead(304, { ETag: page.etag, 'Cache-Control': 'no-cache', ...SECURITY }); res.end(); return true; }
    return send(req, res, 200, page.body, type, 'no-cache', { ETag: page.etag }), true;
  }
  const etag = etagFor(file, st);
  const cache = /[?&]v=/.test(req.url) ? IMMUTABLE : cacheFor(file);
  if (notModified(req, etag)) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache, ...SECURITY }); res.end(); return true; }
  const base = { 'Cache-Control': cache, ETag: etag, 'Accept-Ranges': 'bytes' };
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
    if (await adminRoutes(req, res, url, { send, TYPES, state, SECURITY })) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (p === '/__sync' && req.method === 'POST' && process.env.SYNC_TOKEN && req.headers.authorization === `Bearer ${process.env.SYNC_TOKEN}`) {
        sync('webhook');
        return send(req, res, 202, '{"ok":true}', TYPES['.json']);
      }
      return send(req, res, 405, 'method not allowed', TYPES['.txt']);
    }
    if (p === '/healthz') return send(req, res, state.ready ? 200 : 503, JSON.stringify({ ok: true, boxes: state.apps.map((a) => a.slug), synced: state.synced, error: state.error }), TYPES['.json'], 'no-store');

    const key = p === '/' ? 'index.html' : p.replace(/^\//, '').replace(/\/$/, '/index.html');
    const gen = state.pages[key];
    if (gen) {
      const type = TYPES[path.extname(key)] || TYPES['.html'];
      const extra = type.startsWith('text/html') ? { 'Content-Security-Policy': csp({ frames: ['https://www.youtube-nocookie.com'] }) } : {};
      const etag = state.tags.get(key) || state.tags.set(key, hashOf(Buffer.from(gen))).get(key);
      if (notModified(req, etag)) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache', ...SECURITY }); return res.end(); }
      return send(req, res, 200, gen, type, /[?&]v=/.test(req.url) ? IMMUTABLE : 'no-cache', { ...extra, ETag: etag });
    }
    if (state.pages[key.replace(/index\.html$/, '').replace(/\/$/, '') + '/index.html'] && !p.endsWith('/')) {
      res.writeHead(301, { Location: p + '/', ...SECURITY }); return res.end();
    }

    const seg = p.split('/')[1];
    const box = state.apps.find((a) => a.slug === seg);
    if (box) {
      if (p === `/${seg}`) { res.writeHead(301, { Location: `/${seg}/`, ...SECURITY }); return res.end(); }
      // /<slug>/media/<descriptive-name> → the matching file in glassbox/ (what social posts link to).
      const mm = p.match(/^\/[\w-]+\/media\/([\w.-]+)$/);
      if (mm) {
        let plan = null; try { plan = JSON.parse(fs.readFileSync(path.join(box.dir, 'glassbox', 'post.json'), 'utf8')); } catch {}
        const file = plan && Object.values(plan.assets || {}).flat().find((f) => typeof f === 'string' && niceName({ ...plan, slug: box.slug }, f) === mm[1]);
        if (file && serveFile(req, res, path.join(box.dir, 'glassbox', file), box.dir)) return;
      }
      // Keep repo plumbing private-ish: no dotfiles, no git metadata.
      if (!p.split('/').some((s) => s.startsWith('.'))) {
        const f = inside(box.dir, p.slice(seg.length + 1));
        if (f && serveFile(req, res, f, box.dir)) return;
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
