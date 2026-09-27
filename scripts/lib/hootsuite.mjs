// Hootsuite, through its Perch MCP server (https://mcp.hootsuite.com/perch).
// Connecting is one click in the admin: the server registers itself with Hootsuite's OAuth
// (dynamic client registration, PKCE, no client secret), you sign in to your Hootsuite
// workspace once, and the refresh token is kept in the admin store.
// Perch publishes to Instagram, Facebook, LinkedIn, X and TikTok; YouTube stays with Buffer.
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

// ---- mapping Glassbox posts onto Perch's tools
// Perch's tool names and argument shapes are read from its own tool list at run time,
// so a renamed field shows up as a clear error (and in the dry run) rather than a bad post.
const pick = (list, ...res) => { for (const re of res) { const t = list.find((x) => re.test(x.name)); if (t) return t; } return null; };
const propsOf = (t) => t?.inputSchema?.properties || {};
const findProp = (t, re) => Object.keys(propsOf(t)).find((k) => re.test(k));

const NETWORK = { instagram: /insta/i, facebook: /facebook|^fb/i, linkedin: /linkedin/i, twitter: /twitter|^x$|x_/i, tiktok: /tiktok/i };

export async function profiles() {
  const list = await tools();
  const t = pick(list, /list.*(social.?)?profiles?/i, /get.*profiles?/i, /profiles?/i, /accounts?|channels?/i);
  if (!t) throw new Error(`Perch has no profile-listing tool (tools: ${list.map((x) => x.name).join(', ')})`);
  const out = await call(t.name, {});
  const arr = Array.isArray(out) ? out : Object.values(out).find(Array.isArray) || [];
  return arr.map((p) => {
    const type = String(p.type || p.network || p.socialNetwork || p.platform || p.socialProfileType || '');
    const service = Object.keys(NETWORK).find((s) => NETWORK[s].test(type)) || null;
    return { id: String(p.id ?? p.socialProfileId ?? p.profileId), name: p.name || p.username || p.socialNetworkUsername || p.displayName || type, type, service };
  }).filter((p) => p.id && p.id !== 'undefined');
}

// posts: [{ target, service, text, media: [urls], at: ISO|null, title? }]
export async function publish(posts, { dry = false, log = console.log } = {}) {
  const list = await tools();
  const create = pick(list, /schedule.*(post|message)/i, /create.*(post|message)/i, /publish/i, /(post|message).*create/i);
  if (!create) throw new Error(`Perch has no create-post tool (tools: ${list.map((x) => x.name).join(', ')})`);
  const upload = pick(list, /upload.*media/i, /media.*upload/i, /create.*media/i);
  const profs = await profiles();
  const P = {
    text: findProp(create, /^(text|content|message|body|caption)$/i) || findProp(create, /text|content|caption|message/i),
    profiles: findProp(create, /profile.*ids?|social.*ids?|channel.*ids?|account.*ids?/i),
    time: findProp(create, /sched|send.?time|publish.?at|date|time/i),
    media: findProp(create, /media|asset|attachment|image|video|url/i),
  };
  const req = create.inputSchema?.required || [];
  const unmapped = req.filter((k) => !Object.values(P).includes(k));
  if (unmapped.length) throw new Error(`Perch's ${create.name} needs ${unmapped.join(', ')}, which Glassbox doesn't know how to fill yet. Schema: ${JSON.stringify(create.inputSchema).slice(0, 600)}`);
  const results = [];
  for (const p of posts) {
    const targets = profs.filter((x) => x.service === p.service);
    if (!targets.length) { results.push({ target: p.target, skipped: `no ${p.service} profile in Hootsuite` }); continue; }
    let media = p.media;
    if (P.media && upload && !dry && /id/i.test(P.media)) {
      media = [];
      for (const u of p.media) { const r = await call(upload.name, { [findProp(upload, /url/i) || 'url']: u }); media.push(r.id || r.mediaId || r.data?.id); }
    }
    const args = { [P.text]: p.text, ...(P.profiles ? { [P.profiles]: targets.map((t) => t.id) } : {}), ...(P.time && p.at ? { [P.time]: p.at } : {}), ...(P.media && media.length ? { [P.media]: /s$|ids$/i.test(P.media) || propsOf(create)[P.media]?.type === 'array' ? media : media[0] } : {}) };
    if (dry) { log(`  • ${p.target.padEnd(20)} → Hootsuite ${targets.map((t) => t.name).join(', ')} via ${create.name}`); results.push({ target: p.target, dry: true, tool: create.name, args }); continue; }
    try {
      const r = await call(create.name, args);
      results.push({ target: p.target, provider: 'hootsuite', id: r.id || r.messageId || r.data?.id || null, profiles: targets.map((t) => t.name) });
      log(`  ✓ ${p.target} → Hootsuite (${targets.map((t) => t.name).join(', ')})`);
    } catch (e) {
      results.push({ target: p.target, provider: 'hootsuite', error: e.message });
      log(`  ✗ ${p.target} (Hootsuite): ${e.message}`);
    }
  }
  return results;
}
