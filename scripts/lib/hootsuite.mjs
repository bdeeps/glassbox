// Hootsuite, through its Perch MCP server (https://mcp.hootsuite.com/perch).
// Connecting is one click in the admin: the server registers itself with Hootsuite's OAuth
// (dynamic client registration, PKCE, no client secret), you sign in to your Hootsuite
// workspace once, and the refresh token is kept in the admin store.
// The same sign-in also opens Hootsuite's REST API (platform.hootsuite.com/v1), which really
// schedules and publishes to Instagram, Facebook, LinkedIn, X and TikTok. That API refuses YouTube,
// so YouTube posts go in through Perch as ready drafts in the Hootsuite Planner (one click to schedule).
import crypto from 'node:crypto';
import * as store from './store.mjs';

const MCP = 'https://mcp.hootsuite.com/perch';
const AUTH = 'https://platform.hootsuite.com/oauth2/auth';
const TOKEN = 'https://platform.hootsuite.com/oauth2/token';
const REGISTER = 'https://platform.hootsuite.com/oauth2/register';
export const SERVICES = ['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'youtube', 'threads'];

const b64u = (buf) => Buffer.from(buf).toString('base64url');

async function client(redirectUri) {
  const key = 'hootsuite:client:' + redirectUri;
  const have = await store.get(key);
  if (have?.client_id) return have;
  const res = await fetch(REGISTER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Glassbox Admin', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'offline' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.client_id) throw new Error(`Hootsuite registration failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  await store.set(key, body);
  return body;
}

// Step 1: where to send the browser.
export async function connectUrl(redirectUri) {
  const c = await client(redirectUri);
  const verifier = b64u(crypto.randomBytes(32));
  const stateId = b64u(crypto.randomBytes(18));
  await store.set('hootsuite:pending:' + stateId, { verifier, redirectUri, at: Date.now() });
  const q = new URLSearchParams({ response_type: 'code', client_id: c.client_id, redirect_uri: redirectUri, scope: 'offline', state: stateId, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', resource: MCP });
  return `${AUTH}?${q}`;
}

async function tokenCall(params) {
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Hootsuite token error (${res.status}): ${body.error_description || body.error || 'no token'}`);
  return { access_token: body.access_token, refresh_token: body.refresh_token || params.refresh_token, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
}

// Step 2: the browser comes back with ?code&state.
export async function finishConnect(code, stateId) {
  const pending = await store.get('hootsuite:pending:' + stateId);
  if (!pending || Date.now() - pending.at > 15 * 60e3) throw new Error('That sign-in link expired. Click Connect again.');
  await store.del('hootsuite:pending:' + stateId);
  const c = await client(pending.redirectUri);
  const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, client_id: c.client_id, code_verifier: pending.verifier, resource: MCP });
  await store.set('hootsuite:token', { ...t, client_id: c.client_id, connectedAt: new Date().toISOString() });
  toolCache = null;
}

export const disconnect = () => store.del('hootsuite:token');
export const connected = async () => !!(await store.get('hootsuite:token'))?.refresh_token;

export async function restCheck() {
  // Read-only: does the token we hold also open Hootsuite's REST API (which can really publish)?
  const tok = await accessToken();
  const out = {};
  for (const u of ['https://platform.hootsuite.com/v1/me', 'https://platform.hootsuite.com/v1/socialProfiles']) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } });
    const b = await r.text();
    out[u.split('/').pop()] = { status: r.status, body: b.slice(0, 600) };
  }
  return out;
}

async function accessToken() {
  const t = await store.get('hootsuite:token');
  if (!t) throw new Error('Hootsuite is not connected');
  if (t.expires_at - Date.now() > 60e3) return t.access_token;
  const fresh = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id, resource: MCP });
  await store.set('hootsuite:token', { ...t, ...fresh });
  return fresh.access_token;
}

// ---- a minimal MCP client (streamable HTTP)
let session = null;
async function rpc(method, params, { notify = false } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${await accessToken()}` };
  if (session?.id) headers['Mcp-Session-Id'] = session.id;
  if (session?.version) headers['MCP-Protocol-Version'] = session.version;
  const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: crypto.randomInt(1e9) }) };
  let res;
  for (let i = 0; ; i++) {
    res = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(msg) });
    if (res.status !== 429 || i >= 6) break;
    await new Promise((ok) => setTimeout(ok, (Number(res.headers.get('retry-after')) || 5 * 2 ** i) * 1000));   // rate limited: back off
  }
  if (res.status === 429) throw new Error('Hootsuite is rate-limiting us; try again in a few minutes');
  if (res.status === 404 && session && method !== 'initialize') { session = null; return rpc(method, params, { notify }); }
  if (res.status === 401) throw new Error('Hootsuite sign-in has expired: click Connect Hootsuite again.');
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = { ...(session || {}), id: sid };
  if (notify) return null;
  const text = await res.text();
  const payload = /text\/event-stream/.test(res.headers.get('content-type') || '')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === msg.id || m.result || m.error)
    : JSON.parse(text || '{}');
  if (!res.ok && !payload) throw new Error(`Hootsuite MCP ${res.status}: ${text.slice(0, 300)}`);
  if (payload?.error) throw new Error(`Hootsuite: ${payload.error.message || JSON.stringify(payload.error)}`);
  return payload?.result;
}

async function open() {
  if (session?.ready) return;
  session = null;
  const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'glassbox-admin', version: '1.0' } });
  session = { ...(session || {}), version: r?.protocolVersion || '2025-06-18' };
  await rpc('notifications/initialized', null, { notify: true });
  session.ready = true;
}

let toolCache = null;
export async function tools() {
  if (toolCache && Date.now() - toolCache.at < 10 * 60e3) return toolCache.list;
  await open();
  const r = await rpc('tools/list', {});
  toolCache = { at: Date.now(), list: r?.tools || [] };
  return toolCache.list;
}

async function call(name, args) {
  await open();
  const r = await rpc('tools/call', { name, arguments: args });
  const text = (r?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (r?.isError) throw new Error(`Hootsuite ${name}: ${text.slice(0, 400)}`);
  if (r?.structuredContent) return r.structuredContent;
  try { return JSON.parse(text); } catch { return { text }; }
}

// ---- publishing through the REST API
const API = 'https://platform.hootsuite.com/v1';
async function rest(pathname, opts = {}) {
  let res;
  for (let i = 0; ; i++) {
    res = await fetch(API + pathname, { ...opts, headers: { Authorization: `Bearer ${await accessToken()}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    if (res.status !== 429 || i >= 6) break;
    await new Promise((ok) => setTimeout(ok, (Number(res.headers.get('retry-after')) || 5 * 2 ** i) * 1000));
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Hootsuite ${res.status}: ${(body.errors || []).map((e) => e.message).join('; ') || text.slice(0, 300)}`);
  return body.data ?? body;
}

const NET = { instagram: /INSTAGRAM/i, facebook: /FACEBOOK/i, linkedin: /LINKEDIN/i, twitter: /TWITTER/i, tiktok: /TIKTOK/i, youtube: /YOUTUBE/i, threads: /THREADS/i, pinterest: /PINTEREST/i };

export async function profiles() {
  // REST /socialProfiles sometimes fails on Hootsuite's side (500 "Unknown error occurred")
  // while the token is fine. Retry briefly, then ask the MCP endpoint for the same list.
  let list, restErr;
  for (let i = 0; i < 3 && !list; i++) {
    try { list = await rest('/socialProfiles'); } catch (e) { restErr = e; if (!/Hootsuite 5\d\d/.test(e.message)) throw e; await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); }
  }
  if (!list) {
    try {
      const w = await perchWorkspace();
      const out = await perch('get_social_profiles', { workspaceScope: w.scope });
      list = (Array.isArray(out) ? out : out.socialProfiles || out.profiles || Object.values(out).find(Array.isArray) || [])
        .map((x) => ({ id: x.id ?? x.socialProfileId, type: x.type || x.networkType || '', socialNetworkUsername: x.socialNetworkUsername || x.username || x.name, isReauthRequired: x.isReauthRequired }));
    } catch (e) { throw new Error(`${restErr.message} (fallback also failed: ${e.message})`); }
  }
  return list.map((p) => ({ id: String(p.id), type: p.type, name: p.socialNetworkUsername || p.type.replace(/CHANNEL|BUSINESS|PAGE|COMPANY/, '').toLowerCase(), service: Object.keys(NET).find((k) => NET[k].test(p.type)) || null, reauth: !!p.isReauthRequired }));
}

const MIME = { mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
async function upload({ path: file, name }, log) {
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(file);
  const mimeType = MIME[name.split('.').pop().toLowerCase()];
  const slot = await rest('/media', { method: 'POST', body: JSON.stringify({ sizeBytes: bytes.length, mimeType }) });
  const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType, 'Content-Length': String(bytes.length) }, body: bytes });
  if (!put.ok) throw new Error(`upload of ${name} failed (${put.status})`);
  for (let i = 0; i < 60; i++) {
    const st = await rest('/media/' + encodeURIComponent(slot.id));
    if (st.state === 'READY') return slot.id;
    if (/FAIL|ERROR/i.test(st.state || '')) throw new Error(`Hootsuite couldn't process ${name}`);
    await new Promise((ok) => setTimeout(ok, 6000));
  }
  throw new Error(`Hootsuite is still processing ${name}; try again in a few minutes`);
}

// ---- YouTube: Perch drafts (the REST API rejects YouTube messages)
const P = (list, suffix) => list.find((t) => t.name.startsWith('create-mcp') && t.name.endsWith('_' + suffix))?.name;
async function perch(suffix, args) {
  const name = P(await tools(), suffix);
  if (!name) throw new Error(`Hootsuite no longer offers ${suffix}`);
  return call(name, args);
}
async function perchWorkspace() {
  const have = await store.get('hootsuite:workspace');
  if (have) return have;
  const out = await perch('get_entitled_workspaces', {});
  const arr = Array.isArray(out) ? out : out.workspaces || Object.values(out).find(Array.isArray) || [];
  if (!arr.length) throw new Error('no Hootsuite workspace');
  const w = { scope: arr[0].workspaceScope || arr[0] };
  await store.set('hootsuite:workspace', w);   // Personal workspace when it's the only one
  return w;
}
async function perchDraft(p, when, log) {
  const w = await perchWorkspace();
  const out = await perch('get_social_profiles', { workspaceScope: w.scope });
  const arr = Array.isArray(out) ? out : out.socialProfiles || out.profiles || Object.values(out).find(Array.isArray) || [];
  const profs = arr.filter((x) => NET[p.service].test(x.networkType || x.type || ''));
  if (!profs.length) return { target: p.target, skipped: `no ${p.service} profile in Hootsuite` };
  const fs = await import('node:fs');
  const media = [];
  for (const f of p.files) {
    log(`    uploading ${f.name} for a draft…`);
    const bytes = fs.readFileSync(f.path);
    const mimeType = MIME[f.name.split('.').pop()];
    const slot = await perch('request_media_upload', { mimeType, sizeBytes: bytes.length });
    const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
    if (!put.ok) throw new Error(`upload of ${f.name} failed (${put.status})`);
    let ready = null;
    for (let i = 0; i < 40 && !ready; i++) { const r = await perch('poll_media_upload', { mediaId: slot.mediaId }); if (r.ready) { const { ready: _, ...fields } = r; ready = fields; } else await new Promise((ok) => setTimeout(ok, 6000)); }
    if (!ready) throw new Error(`Hootsuite is still processing ${f.name}`);
    media.push(ready);
  }
  const text = p.title ? `${p.title}\n\n${p.text}` : p.text;
  const r = await perch('create_draft', { workspaceScope: w.scope, socialProfiles: profs, text, scheduledDate: when, mediaAttachments: media });
  return { target: p.target, provider: 'hootsuite', draft: true, id: r.id || r.draftId || r.draft?.id || null, dueAt: when };
}

// posts: [{ target, service, text, title?, files: [local paths], at }]
export async function publish(posts, { dry = false, log = console.log } = {}) {
  const profs = (await profiles()).filter((p) => !p.reauth);
  const uploaded = new Map();
  const results = [];
  for (const p of posts) {
    const targets = profs.filter((x) => x.service === p.service);
    if (!targets.length) { results.push({ target: p.target, skipped: `no ${p.service} profile in Hootsuite` }); continue; }
    if (p.service === 'youtube') {
      const when = new Date(Math.max(p.at ? Date.parse(p.at) : 0, Date.now() + 20 * 60e3)).toISOString();
      if (dry) { log(`  • ${p.target.padEnd(20)} → Hootsuite draft (YouTube) for ${when}: ${p.files.map((f) => f.name).join(', ')}`); results.push({ target: p.target, dry: true }); continue; }
      try {
        const r = await perchDraft(p, when, log);
        results.push(r);
        log(r.skipped ? `  – ${p.target}: ${r.skipped}` : `  ✓ ${p.target} → Hootsuite draft for ${when}: open Hootsuite Planner and press Schedule`);
      } catch (e) { results.push({ target: p.target, provider: 'hootsuite', error: e.message }); log(`  ✗ ${p.target} (Hootsuite draft): ${e.message}`); }
      continue;
    }
    // Hootsuite needs video posts at least 15 minutes ahead; give it 20.
    const earliest = Date.now() + 20 * 60e3;
    const when = new Date(Math.max(p.at ? Date.parse(p.at) : 0, earliest)).toISOString().replace(/\.\d+Z$/, '.000Z');
    const text = p.title ? `${p.title}\n\n${p.text}` : p.text;
    if (dry) { log(`  • ${p.target.padEnd(20)} → Hootsuite ${targets.map((t) => t.name).join(', ')} at ${when}: ${p.files.map((f) => f.name).join(', ')}`); results.push({ target: p.target, dry: true }); continue; }
    try {
      const media = [];
      for (const f of p.files) {
        if (!uploaded.has(f.path)) { log(`    uploading ${f.name}…`); uploaded.set(f.path, await upload(f, log)); }
        media.push({ id: uploaded.get(f.path) });
      }
      const msgs = await rest('/messages', { method: 'POST', body: JSON.stringify({ text, socialProfileIds: targets.map((t) => t.id), scheduledSendTime: when, media, emailNotification: false }) });
      const ids = (Array.isArray(msgs) ? msgs : [msgs]).map((m) => m.id);
      results.push({ target: p.target, provider: 'hootsuite', id: ids.join(','), dueAt: when, profiles: targets.map((t) => t.name) });
      log(`  ✓ ${p.target} → Hootsuite (${targets.map((t) => t.name).join(', ')}) scheduled for ${when}`);
    } catch (e) {
      results.push({ target: p.target, provider: 'hootsuite', error: e.message });
      log(`  ✗ ${p.target} (Hootsuite): ${e.message}`);
    }
  }
  return results;
}
