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
import { ship, loadEnv, checkLive, assetBase } from './lib/buffer.mjs';

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

const body = (req, limit = 400 * 1024 * 1024) => new Promise((ok, fail) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', fail);
});

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
    const buf = await body(req);
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
        await ship(slug, { mode, log });
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
