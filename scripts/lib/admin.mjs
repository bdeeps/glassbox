// Access-code sign-in for the hosted Studio (the admin) and its API.
// The code lives only in the ADMIN_CODE environment variable. A correct code gets a signed,
// HttpOnly, SameSite=Strict session cookie for 12 hours. The signing key is derived from the
// code itself, so changing ADMIN_CODE signs everyone out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, config } from './apps.mjs';
import { channels, ship, alreadyPosted } from './buffer.mjs';
import * as store from './store.mjs';
import * as hoot from './hootsuite.mjs';
import { settings, saveSettings, readiness, publishBox } from './publisher.mjs';

const COOKIE = 'glassbox_admin';
const TTL = 12 * 3600;
const code = () => process.env.ADMIN_CODE || '';
export const adminEnabled = () => code().length >= 12;

const key = () => crypto.createHash('sha256').update('glassbox-admin-session:' + code()).digest();
const sign = (s) => crypto.createHmac('sha256', key()).update(s).digest('base64url');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function isAdmin(req) {
  if (!adminEnabled()) return false;
  const c = (req.headers.cookie || '').split(/;\s*/).find((x) => x.startsWith(COOKIE + '='));
  if (!c) return false;
  const [exp, mac] = c.slice(COOKIE.length + 1).split('.');
  return !!exp && !!mac && +exp > Date.now() / 1000 && same(mac, sign(exp));
}

// Five wrong codes per address per 15 minutes, then a lock-out.
const tries = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
function limited(req) {
  const ip = ipOf(req), now = Date.now();
  const t = tries.get(ip);
  if (t && t.until > now && t.n >= 5) return Math.ceil((t.until - now) / 60e3);
  return 0;
}
function fail(req) {
  const ip = ipOf(req), now = Date.now();
  const t = tries.get(ip);
  const n = t && t.until > now ? t.n + 1 : 1;
  tries.set(ip, { n, until: now + 15 * 60e3 });
  if (tries.size > 10000) tries.clear();
}

async function body(req, limit = 2e6) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString();
}

// Same-site POSTs only: SameSite=Strict already blocks cross-site cookies; this is belt and braces.
const sameOrigin = (req) => { const o = req.headers.origin; return !o || o === `https://${req.headers.host}` || o === `http://${req.headers.host}`; };
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

export function loginPage({ error = '', next = '/studio/' } = {}) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(config.brand)} Admin</title><link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07080c;color:#eef0f6;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px}
form{width:min(380px,100%);padding:30px 26px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.035)}
h1{margin:0 0 4px;font:400 30px/1.1 Georgia,serif}p{margin:0 0 20px;color:#a8aebf;font-size:14px}
label{display:block;margin-bottom:6px;font-size:13px;color:#a8aebf}input{width:100%;height:48px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0d0f16;color:#eef0f6;font:500 17px ui-monospace,monospace;letter-spacing:.06em}
input:focus{outline:2px solid #8ef0ff;outline-offset:1px}button{width:100%;height:48px;margin-top:14px;border:0;border-radius:12px;background:#8ef0ff;color:#07080c;font:600 15px system-ui;cursor:pointer}
.err{margin:12px 0 0;color:#ff8f8f;font-size:14px}a{color:#a8aebf}.foot{margin:18px 0 0;font-size:13px;text-align:center}
</style></head><body>
<form method="post" action="/__admin/login" autocomplete="off">
<h1>${esc(config.brand)} Admin</h1><p>Enter the access code to sign in.</p>
<label for="code">Access code</label><input id="code" name="code" type="password" required autofocus spellcheck="false" autocapitalize="off">
<input type="hidden" name="next" value="${esc(next)}"><button type="submit">Sign in</button>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<p class="foot"><a href="/">← Back to ${esc(config.brand)}</a></p>
</form></body></html>`;
}

// Handles /__admin/* and the hosted /__studio/* API. Returns true when it answered.
export async function adminRoutes(req, res, url, { send, TYPES, state, SECURITY }) {
  const p = url.pathname;
  const html = (code, page, extra = {}) => { res.writeHead(code, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', ...SECURITY, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'same-origin', ...extra }); res.end(page); };
  const json = (code, obj) => send(req, res, code, JSON.stringify(obj), TYPES['.json'], 'no-store');

  if (p === '/__admin/login' && req.method === 'POST') {
    if (!adminEnabled()) return html(503, loginPage({ error: 'The admin is switched off: set ADMIN_CODE on the server.' })), true;
    if (!sameOrigin(req)) return html(403, loginPage({ error: 'Sign in from this site.' })), true;
    const wait = limited(req);
    if (wait) return html(429, loginPage({ error: `Too many wrong codes. Try again in ${wait} minute${wait > 1 ? 's' : ''}.` })), true;
    const form = new URLSearchParams(await body(req, 4096).catch(() => ''));
    const given = (form.get('code') || '').trim();
    const next = /^\/(studio|admin)\/[\w/?=&.-]*$/.test(form.get('next') || '') ? form.get('next') : '/admin/';
    const ok = same(crypto.createHash('sha256').update(given).digest('hex'), crypto.createHash('sha256').update(code()).digest('hex'));
    if (!ok) { fail(req); return html(401, loginPage({ error: 'That code is not right.', next })), true; }
    tries.delete(ipOf(req));
    const exp = String(Math.floor(Date.now() / 1000) + TTL);
    res.writeHead(303, { Location: next, 'Set-Cookie': cookie(`${exp}.${sign(exp)}`, TTL), 'Cache-Control': 'no-store', ...SECURITY });
    return res.end(), true;
  }
  if (p === '/__admin/logout' && req.method === 'POST') {
    res.writeHead(303, { Location: '/', 'Set-Cookie': cookie('', 0), 'Cache-Control': 'no-store', ...SECURITY });
    return res.end(), true;
  }

  // The Admin (publish) page: sign-in first.
  if (p === '/admin' || p === '/admin/' || p === '/admin/index.html') {
    if (isAdmin(req)) {
      // Stamp the stylesheet and script with a content hash so a browser never pairs this
      // page with an old admin.css/admin.js.
      const dir = path.join(ROOT, 'site', 'admin');
      const v = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 10);
      const page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
        .replace('/admin/admin.css"', `/admin/admin.css?v=${v('admin.css')}"`)
        .replace('/admin/admin.js"', `/admin/admin.js?v=${v('admin.js')}"`);
      const csp = (page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', ...SECURITY, ...(csp ? { 'Content-Security-Policy': csp } : {}) });
      return res.end(page), true;
    }
    return html(adminEnabled() ? 200 : 503, loginPage({ error: adminEnabled() ? '' : 'The admin is switched off: set ADMIN_CODE on the server.', next: '/admin/' })), true;
  }
  if (p.startsWith('/__admin/')) return adminApi(req, res, url, { json, html, state, SECURITY });

  // The Studio page itself: sign-in first.
  if (p === '/studio' || p === '/studio/' || p === '/studio/index.html') {
    // On the live site there is nothing to record: publishing lives at /admin/.
    if (process.env.NODE_ENV === 'production') { res.writeHead(302, { Location: '/admin/', 'Cache-Control': 'no-store' }); return res.end(), true; }
    if (isAdmin(req)) return false;   // fall through to the static Studio page
    return html(adminEnabled() ? 200 : 503, loginPage({ error: adminEnabled() ? '' : 'The admin is switched off: set ADMIN_CODE on the server.', next: '/studio/' + url.search })), true;
  }

  if (!p.startsWith('/__studio/')) return false;
  if (!isAdmin(req)) return json(401, { error: 'Sign in to the admin first.' }), true;
  if (req.method !== 'GET' && !sameOrigin(req)) return json(403, { error: 'cross-origin request refused' }), true;
  const [, action, slug] = p.split('/').filter(Boolean);
  const hasKey = !!process.env.BUFFER_API_KEY;

  if (action === 'status') {
    return json(200, { hosted: true, buffer: hasKey, apps: state.apps.map((a) => ({ slug: a.slug, media: a.media, posted: alreadyPosted(a.slug)?.at || null })) }), true;
  }
  if (action === 'settings' && req.method === 'GET') {
    const k = process.env.BUFFER_API_KEY || '';
    return json(200, { hosted: true, buffer: { hasKey: !!k, hint: k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '' }, post: config.post, analytics: config.analytics, active: null }), true;
  }
  if (action === 'buffer' && slug === 'channels') {
    try { return json(200, { channels: await channels() }), true; } catch (e) { return json(400, { error: e.message }), true; }
  }
  if (action === 'posted') return json(200, alreadyPosted(slug)), true;

  // Publish: the plan comes from the Studio (captions, time, targets), but every media file it
  // names must already be published in the box repo, since Buffer fetches media by public URL.
  if (action === 'ship' && req.method === 'POST') {
    const box = state.apps.find((a) => a.slug === slug);
    if (!box) return json(404, { error: 'unknown box' }), true;
    const dry = url.searchParams.get('dry') === '1';
    const force = url.searchParams.get('force') === '1';
    const mode = ['schedule', 'queue', 'now'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'schedule';
    let plan;
    try { plan = JSON.parse(await body(req)); } catch { return json(400, { error: 'send the post plan as JSON' }), true; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY });
    const log = (s) => res.write(s + '\n');
    try {
      if (plan.slug !== slug) throw new Error('plan is for a different box');
      const files = Object.values(plan.assets || {}).flat().filter((f) => typeof f === 'string');
      const bad = files.filter((f) => !/^[\w.-]+\.(mp4|jpg|png)$/.test(f));
      if (bad.length) throw new Error(`odd file names in the plan: ${bad.join(', ')}`);
      const missing = files.filter((f) => !fs.existsSync(path.join(box.dir, 'glassbox', f)));
      if (missing.length) throw new Error(`these files aren't published in the ${slug} repo yet: ${missing.join(', ')}.\nRecord them in the admin on your computer (npm run dev → localhost:5210/studio/), Save to repo, push, then publish from here.`);
      await ship(slug, { dry, mode, force, plan, log });
      log('done.');
    } catch (e) { log('✗ ' + e.message); }
    return res.end(), true;
  }
  if (action === 'save' || (action === 'settings' && req.method === 'POST')) {
    return json(405, { error: 'On the live site the admin publishes what is already in the box repos. Recording, saving media and changing settings happen in the admin on your computer (npm run dev).' }), true;
  }
  return json(404, { error: 'unknown studio endpoint' }), true;
}

// ---------------------------------------------------------------- the Admin (publish) API
const origin = (req) => process.env.SITE_URL?.replace(/\/$/, '') || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
let chanCache = null;
async function bufferChannels() {
  if (!process.env.BUFFER_API_KEY) return { ok: false, error: 'no API key', list: [] };
  if (chanCache && Date.now() - chanCache.at < 5 * 60e3) return chanCache.v;
  let v;
  try { v = { ok: true, list: (await channels()).map((c) => ({ service: c.service, name: c.displayName || c.name })) }; } catch (e) { v = { ok: false, error: e.message, list: [] }; }
  chanCache = { at: Date.now(), v };
  return v;
}
let profCache = null;
async function hootStatus() {
  if (!(await hoot.connected().catch(() => false))) return { connected: false };
  if (profCache && Date.now() - profCache.at < 5 * 60e3) return profCache.v;
  let v;
  try { v = { connected: true, profiles: (await hoot.profiles()).map((x) => ({ service: x.service, name: x.name, type: x.type, reauth: x.reauth })) }; } catch (e) { v = { connected: true, error: e.message, profiles: [] }; }
  profCache = { at: Date.now(), v };
  return v;
}

async function adminApi(req, res, url, { json, html, state }) {
  const p = url.pathname;
  // Hootsuite sends the browser back here. The admin cookie is SameSite=Strict, so it isn't
  // sent on this cross-site redirect; the one-time state (made by a signed-in admin) proves it.
  if (p === '/__admin/hootsuite/callback') {
    const back = (q) => { res.writeHead(303, { Location: '/admin/?' + q, 'Cache-Control': 'no-store' }); res.end(); };
    if (url.searchParams.get('error')) return back('hootsuite=' + encodeURIComponent(url.searchParams.get('error_description') || url.searchParams.get('error'))), true;
    try { await hoot.finishConnect(url.searchParams.get('code') || '', url.searchParams.get('state') || ''); profCache = null; await store.log('Hootsuite connected', { provider: 'hootsuite' }); back('hootsuite=connected'); }
    catch (e) { back('hootsuite=' + encodeURIComponent(e.message)); }
    return true;
  }
  if (!p.startsWith('/__admin/api/')) return false;
  if (!isAdmin(req)) return json(401, { error: 'Sign in to the admin first.' }), true;
  if (req.method !== 'GET' && !sameOrigin(req)) return json(403, { error: 'cross-origin request refused' }), true;
  const [action, arg] = p.slice('/__admin/api/'.length).split('/');
  const apps = state.apps;

  if (action === 'status') {
    const [s, posted, hs, buf, log, kind] = await Promise.all([settings(), store.list('posted:'), hootStatus(), bufferChannels(), store.recent(200), store.storeKind()]);
    const boxes = apps.map((a) => {
      const r = readiness(a), rec = posted['posted:' + a.slug];
      return { slug: a.slug, no: a.no, title: a.title, question: a.question, kind: a.kind, date: a.date, color: a.color, ready: r.ready, why: r.why || null,
        posted: rec ? { at: rec.at, by: rec.by, ok: rec.results.filter((x) => !x.error && !x.skipped).length, total: rec.results.length } : null,
        auto: s.auto && !s.baseline.includes(a.slug) };
    });
    return json(200, { settings: { auto: s.auto, when: s.when, since: s.since, buffer: s.buffer }, hootsuite: hs, buffer: buf, boxes, log, store: kind }), true;
  }
  if (action === 'settings' && req.method === 'POST') {
    let b; try { b = JSON.parse(await body(req, 4096)); } catch { return json(400, { error: 'bad JSON' }), true; }
    return json(200, await saveSettings(b, apps)), true;
  }
  if (action === 'publish' && req.method === 'POST') {
    const box = apps.find((a) => a.slug === arg);
    if (!box) return json(404, { error: 'unknown box' }), true;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const log = (s) => res.write(s + '\n');
    try {
      await publishBox(box, { dry: url.searchParams.get('dry') === '1', force: url.searchParams.get('force') === '1', all: url.searchParams.get('all') === '1', when: url.searchParams.get('when') || undefined, log });
    } catch (e) { log('✗ ' + e.message); }
    return res.end(), true;
  }
  if (action === 'hootsuite' && arg === 'connect' && req.method === 'POST') {
    try { return json(200, { url: await hoot.connectUrl(origin(req) + '/__admin/hootsuite/callback') }), true; }
    catch (e) { return json(502, { error: e.message }), true; }
  }
  if (action === 'hootsuite' && arg === 'disconnect' && req.method === 'POST') {
    await hoot.disconnect(); profCache = null; await store.log('Hootsuite disconnected', { provider: 'hootsuite' });
    return json(200, { ok: true }), true;
  }
  if (action === 'hootsuite' && arg === 'rest-check') {
    try { return json(200, await hoot.restCheck()), true; } catch (e) { return json(502, { error: e.message }), true; }
  }
  if (action === 'hootsuite' && arg === 'tools') {
    try { return json(200, { tools: (await hoot.tools()).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }), true; }
    catch (e) { return json(502, { error: e.message }), true; }
  }
  return json(404, { error: 'unknown admin endpoint' }), true;
}

export { ROOT };
