// Hootsuite, through its Perch MCP server (https://mcp.hootsuite.com/perch).
// Connecting is one click in the admin: the server registers itself with Hootsuite's OAuth
// (dynamic client registration, PKCE, no client secret), you sign in to your Hootsuite
// workspace once, and the refresh token is kept in the admin store.
// Perch can't publish by itself: it saves each post as a draft in the Hootsuite Planner (media
// attached, at the planned time) for Instagram, Facebook, LinkedIn, X and TikTok. YouTube stays with Buffer.
import crypto from 'node:crypto';
import * as store from './store.mjs';

const MCP = 'https://mcp.hootsuite.com/perch';
const AUTH = 'https://platform.hootsuite.com/oauth2/auth';
const TOKEN = 'https://platform.hootsuite.com/oauth2/token';
const REGISTER = 'https://platform.hootsuite.com/oauth2/register';
export const SERVICES = ['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok'];

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
  const res = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(msg) });
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

// ---- Perch's tools (names as Hootsuite ships them; the prefix is its internal service name)
// Perch cannot publish: it saves drafts in the Hootsuite Planner at the planned time, with the
// media attached, and you press Schedule/Publish in Hootsuite. Glassbox fills those drafts.
const T = (list, suffix) => list.find((t) => t.name.endsWith('_' + suffix) && t.name.startsWith('create-mcp'))?.name || list.find((t) => t.name.endsWith('_' + suffix))?.name;
const need = async (suffix) => { const n = T(await tools(), suffix); if (!n) throw new Error(`Hootsuite no longer offers ${suffix}`); return n; };

export async function workspaces() {
  const out = await call(await need('get_entitled_workspaces'), {});
  const arr = Array.isArray(out) ? out : out.workspaces || Object.values(out).find(Array.isArray) || [];
  return arr.map((w) => {
    const scope = w.workspaceScope || w;
    return { scope, name: scope.organizationName || w.name || w.organizationName || 'Personal workspace', personal: scope.organizationId == null };
  });
}
export const workspace = () => store.get('hootsuite:workspace');
export async function chooseWorkspace(index) {
  const list = await workspaces();
  const w = list[index];
  if (!w) throw new Error('unknown workspace');
  await store.set('hootsuite:workspace', w);
  return w;
}

const NET = { instagram: /INSTAGRAM/i, facebook: /FACEBOOK/i, linkedin: /LINKEDIN/i, twitter: /TWITTER|^X$/i, tiktok: /TIKTOK/i, youtube: /YOUTUBE/i, threads: /THREADS/i, pinterest: /PINTEREST/i };

export async function profiles() {
  const w = await workspace();
  if (!w) throw new Error('choose a Hootsuite workspace first');
  const out = await call(await need('get_social_profiles'), { workspaceScope: w.scope });
  const arr = Array.isArray(out) ? out : out.socialProfiles || out.profiles || Object.values(out).find(Array.isArray) || [];
  return arr.map((p) => ({ raw: p, id: String(p.socialProfileId ?? p.id), name: p.name || p.username || String(p.socialProfileId), type: p.networkType || p.type || '', service: Object.keys(NET).find((k) => NET[k].test(p.networkType || p.type || '')) || null }));
}

const MIME = { mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
async function upload(file, log) {
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(file);
  const mimeType = MIME[file.split('.').pop().toLowerCase()];
  const slot = await call(await need('request_media_upload'), { mimeType, sizeBytes: bytes.length });
  const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  if (!put.ok) throw new Error(`upload of ${file.split('/').pop()} failed (${put.status})`);
  const poll = await need('poll_media_upload');
  for (let i = 0; i < 40; i++) {
    const r = await call(poll, { mediaId: slot.mediaId });
    if (r.ready) { const { ready, ...fields } = r; return fields; }
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new Error(`Hootsuite is still processing ${file.split('/').pop()}; try again in a minute`);
}

// posts: [{ target, service, text, files: [local paths], at }]
export async function publish(posts, { dry = false, log = console.log } = {}) {
  const w = await workspace();
  const profs = await profiles();
  const create = await need('create_draft');
  const uploaded = new Map();
  const results = [];
  for (const p of posts) {
    const targets = profs.filter((x) => x.service === p.service);
    if (!targets.length) { results.push({ target: p.target, skipped: `no ${p.service} profile in Hootsuite` }); continue; }
    const when = p.at || new Date(Date.now() + 30 * 60e3).toISOString();
    if (dry) { log(`  • ${p.target.padEnd(20)} → Hootsuite draft for ${targets.map((t) => t.name).join(', ')} at ${when} (${p.files.length} file${p.files.length === 1 ? '' : 's'})`); results.push({ target: p.target, dry: true }); continue; }
    try {
      const media = [];
      for (const f of p.files) {
        if (!uploaded.has(f)) { log(`    uploading ${f.split('/').pop()} to Hootsuite…`); uploaded.set(f, await upload(f, log)); }
        media.push(uploaded.get(f));
      }
      const r = await call(create, { workspaceScope: w.scope, socialProfiles: targets.map((t) => t.raw), text: p.text, scheduledDate: when, mediaAttachments: media });
      results.push({ target: p.target, provider: 'hootsuite', draft: true, id: r.id || r.draftId || r.draft?.id || null, profiles: targets.map((t) => t.name) });
      log(`  ✓ ${p.target} → Hootsuite draft (${targets.map((t) => t.name).join(', ')}) for ${when}`);
    } catch (e) {
      results.push({ target: p.target, provider: 'hootsuite', error: e.message });
      log(`  ✗ ${p.target} (Hootsuite): ${e.message}`);
    }
  }
  return results;
}
