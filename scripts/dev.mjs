// Local dev server that mirrors production: the hub at /, each box repo from
// apps.local.json at /<slug>/, exactly like GitHub Pages serves the org.
// It also gives the studio a few local-only endpoints (save media, ship).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, config, localApps } from './lib/apps.mjs';
import { pages } from './build.mjs';
import { ship, loadEnv, checkLive, assetBase, channels } from './lib/buffer.mjs';
import { active } from './lib/analytics.mjs';

loadEnv();
const run = promisify(execFile);
const PORT = Number(process.env.PORT || 5210);
const SITE_DIR = path.join(ROOT, 'site');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
};
const MEDIA_FILE = /^[a-z0-9][a-z0-9-]*\.(jpg|png|mp4|json)$/;

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// Serves a file (with byte ranges, so <video> can seek).
function serveFile(req, res, file) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (st.isDirectory()) return serveFile(req, res, path.join(file, 'index.html'));
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  }
  return true;
}

// Resolves a URL path inside a root without letting ../ escape it.
function inside(root, rel) {
  const p = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  return p.startsWith(root) ? p : null;
}

const readBody = (req, limit = 400 * 1024 * 1024) => new Promise((ok, fail) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', fail);
});

// Sets one KEY=value line in the git-ignored .env (removes it when value is empty).
function writeEnv(key, value) {
  const f = path.join(ROOT, '.env');
  const lines = (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '').split('\n').filter((l) => l && !l.startsWith(key + '='));
  if (value) lines.push(`${key}=${value}`);
  fs.writeFileSync(f, lines.join('\n') + '\n', { mode: 0o600 });
}

async function git(dir, ...args) {
  const { stdout } = await run('git', ['-C', dir, ...args]);
  return stdout.trim();
}
async function gitInfo(dir) {
  try {
    const [branch, status, remote] = await Promise.all([
      git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), git(dir, 'status', '--porcelain', 'glassbox'), git(dir, 'remote', 'get-url', 'origin').catch(() => ''),
    ]);
    return { branch, dirtyMedia: !!status, remote };
  } catch { return null; }
}

async function studioApi(req, res, url) {
  // Local-only endpoints: refuse anything a different site's page might send.
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && origin !== `http://${req.headers.host}`) return send(res, 403, 'cross-origin request refused');
  const apps = localApps();
  const parts = url.pathname.split('/').filter(Boolean); // __studio, action, slug, file
  const [, action, slug, file] = parts;

  if (action === 'status') {
    const out = await Promise.all(apps.map(async (a) => ({ slug: a.slug, dir: a.dir, media: a.media, git: await gitInfo(a.dir) })));
    return send(res, 200, JSON.stringify({ dev: true, buffer: !!process.env.BUFFER_API_KEY, apps: out }), TYPES['.json']);
  }

  // Settings: Buffer key (kept only in the git-ignored .env), posting defaults and
  // analytics IDs (kept in glassbox.config.json, which is public).
  if (action === 'settings' && req.method === 'GET') {
    const key = process.env.BUFFER_API_KEY || '';
    return send(res, 200, JSON.stringify({
      buffer: { hasKey: !!key, hint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '' },
      post: config.post, analytics: config.analytics, active: active(),
    }), TYPES['.json']);
  }
  if (action === 'settings' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
    if (typeof body.bufferKey === 'string') {
      const key = body.bufferKey.trim();
      if (key && !/^[\w.-]{10,200}$/.test(key)) return send(res, 400, 'That does not look like a Buffer API key.');
      writeEnv('BUFFER_API_KEY', key);
      if (key) process.env.BUFFER_API_KEY = key; else delete process.env.BUFFER_API_KEY;
    }
    if (body.post) {
      const { time, timezone, targets } = body.post;
      if (time && !/^\d{2}:\d{2}$/.test(time)) return send(res, 400, 'time must be HH:MM');
      if (time) config.post.time = time;
      if (timezone) config.post.timezone = String(timezone).slice(0, 60);
      if (Array.isArray(targets)) config.post.targets = targets.map((t) => ({ service: String(t.service), kind: String(t.kind), ...(t.offsetHours ? { offsetHours: Number(t.offsetHours) } : {}), ...(t.enabled === false ? { enabled: false } : {}) }));
    }
    if (body.analytics) {
      const ga4 = String(body.analytics.ga4 || '').trim();
      if (ga4 && !/^G-[A-Z0-9]{4,20}$/.test(ga4)) return send(res, 400, 'The Google Analytics ID looks like G-XXXXXXXXXX.');
      config.analytics = { ...config.analytics, ga4, clicktrust: { ...config.analytics.clicktrust, snippet: String(body.analytics.clicktrust?.snippet || '').trim().slice(0, 20000), policyUrl: body.analytics.clicktrust?.policyUrl || config.analytics.clicktrust.policyUrl } };
    }
    fs.writeFileSync(path.join(ROOT, 'glassbox.config.json'), JSON.stringify(config, null, 2) + '\n');
    // Boxes carry their own CSP, so keep it in step with the analytics hosts.
    const synced = [];
    if (body.analytics) for (const a of apps) { await run('node', [path.join(ROOT, 'scripts', 'readme.mjs'), a.slug]); synced.push(a.slug); }
    return send(res, 200, JSON.stringify({ ok: true, synced, active: active() }), TYPES['.json']);
  }
  if (action === 'buffer' && slug === 'channels') {
    try { return send(res, 200, JSON.stringify({ channels: await channels() }), TYPES['.json']); }
    catch (e) { return send(res, 400, JSON.stringify({ error: e.message }), TYPES['.json']); }
  }
  if (action === 'posted') {
    const f = path.join(ROOT, 'posted', `${slug}.json`);
    return send(res, 200, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'null', TYPES['.json']);
  }

  if (action === 'save' && req.method === 'POST') {
    if (!MEDIA_FILE.test(file || '')) return send(res, 400, 'bad file name');
    let dir;
    if (slug === '_hub') dir = path.join(SITE_DIR, 'assets');
    else {
      const a = apps.find((x) => x.slug === slug);
      if (!a) return send(res, 404, 'unknown box');
      dir = path.join(a.dir, 'glassbox');
    }
    fs.mkdirSync(dir, { recursive: true });
    const buf = await readBody(req);
    fs.writeFileSync(path.join(dir, file), buf);
    return send(res, 200, JSON.stringify({ ok: true, path: path.join(dir, file), bytes: buf.length }), TYPES['.json']);
  }

  // Streams a log while it commits + pushes the box's media, waits for Pages,
  // then creates the Buffer posts. ?dry=1 only previews.
  if (action === 'ship' && req.method === 'POST') {
    const a = apps.find((x) => x.slug === slug);
    if (!a) return send(res, 404, 'unknown box');
    const dry = url.searchParams.get('dry') === '1';
    const mode = url.searchParams.get('mode') || 'schedule';
    const force = url.searchParams.get('force') === '1';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const log = (s) => res.write(s + '\n');
    try {
      const plan = JSON.parse(fs.readFileSync(path.join(a.dir, 'glassbox', 'post.json'), 'utf8'));
      if (dry) {
        await ship(slug, { dry: true, mode, plan, log });
      } else {
        const g = await gitInfo(a.dir);
        if (!g?.remote) throw new Error(`${a.dir} has no git remote "origin" yet. Create the GitHub repo first (see docs/SETUP.md).`);
        if (g.dirtyMedia) {
          log(`committing glassbox/ in ${path.basename(a.dir)}…`);
          await git(a.dir, 'add', 'glassbox');
          await git(a.dir, 'commit', '-m', `Glassbox media for No. ${a.no}`);
        }
        log('pushing…');
        await git(a.dir, 'push', 'origin', g.branch);
        const urls = ['post.json', ...Object.values(plan.assets).flat()].map((f) => assetBase(slug) + f);
        log(`waiting for GitHub Pages to publish ${urls.length} files…`);
        const until = Date.now() + 10 * 60e3;
        for (;;) {
          try { await checkLive(urls, log); break; } catch (e) {
            if (Date.now() > until) throw new Error('Pages did not publish within 10 minutes. Run `npm run post -- ' + slug + '` later.');
            await new Promise((r) => setTimeout(r, 15e3));
            log('…still waiting');
          }
        }
        await ship(slug, { mode, force, log });
      }
      log('done.');
    } catch (e) { log('✗ ' + e.message); }
    return res.end();
  }
  return send(res, 404, 'unknown studio endpoint');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/__studio/')) return await studioApi(req, res, url);

    // Generated pages are rebuilt on each request so edits show up on refresh.
    const apps = localApps().sort((a, b) => b.box - a.box);
    const gen = pages(apps);
    const key = p === '/' ? 'index.html' : p.replace(/^\//, '').replace(/\/$/, '/index.html');
    if (gen[key]) return send(res, 200, gen[key], TYPES[path.extname(key)] || TYPES['.html']);

    // /<slug>/… → that box's local repo, like a GitHub Pages project site.
    const seg = p.split('/')[1];
    const box = apps.find((a) => a.slug === seg);
    if (box) {
      if (p === `/${seg}`) { res.writeHead(301, { Location: `/${seg}/` }); return res.end(); }
      const f = inside(box.dir, p.slice(seg.length + 1));
      if (f && serveFile(req, res, f)) return;
    } else {
      const f = inside(SITE_DIR, p);
      if (f && serveFile(req, res, f)) return;
    }
    send(res, 404, gen['404.html'], TYPES['.html']);
  } catch (e) {
    console.error(e);
    send(res, 500, String(e.message || e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const apps = localApps();
  console.log(`${config.brand} dev → http://localhost:${PORT}`);
  console.log(`studio      → http://localhost:${PORT}/studio/`);
  for (const a of apps) console.log(`  /${a.slug}/  ←  ${a.dir}`);
  if (!process.env.BUFFER_API_KEY) console.log('(no BUFFER_API_KEY in .env: posting disabled, dry runs still work)');
});
