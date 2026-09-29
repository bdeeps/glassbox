// SocialPilot, through its MCP server (https://mcp.socialpilot.co/mcp).
// Connecting is one click in the admin: the server registers itself with SocialPilot's OAuth
// (dynamic client registration + PKCE; SocialPilot issues a client secret, kept in the admin
// store), you sign in once, and the refresh token is kept in the admin store.
import crypto from 'node:crypto';
import * as store from './store.mjs';

const MCP = 'https://mcp.socialpilot.co/mcp';
const META = 'https://mcp.socialpilot.co/.well-known/oauth-authorization-server';
const b64u = (buf) => Buffer.from(buf).toString('base64url');

let meta = null;
async function endpoints() {
  if (meta) return meta;
  const res = await fetch(META);
  if (!res.ok) throw new Error(`SocialPilot sign-in details unavailable (${res.status})`);
  return (meta = await res.json());
}

async function client(redirectUri) {
  const key = 'socialpilot:client:' + redirectUri;
  const have = await store.get(key);
  if (have?.client_id) return have;
  const m = await endpoints();
  const res = await fetch(m.registration_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Glassbox Admin', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post', scope: (m.scopes_supported || []).join(' ') }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.client_id) throw new Error(`SocialPilot registration failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  await store.set(key, body);
  return body;
}

// Step 1: where to send the browser.
export async function connectUrl(redirectUri) {
  const [c, m] = await Promise.all([client(redirectUri), endpoints()]);
  const verifier = b64u(crypto.randomBytes(32));
  const stateId = b64u(crypto.randomBytes(18));
  await store.set('socialpilot:pending:' + stateId, { verifier, redirectUri, at: Date.now() });
  const q = new URLSearchParams({ response_type: 'code', client_id: c.client_id, redirect_uri: redirectUri, scope: c.scope || (m.scopes_supported || []).join(' '), state: stateId, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', resource: MCP });
  return `${m.authorization_endpoint}?${q}`;
}

async function tokenCall(c, params) {
  const m = await endpoints();
  const res = await fetch(m.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: c.client_id, ...(c.client_secret ? { client_secret: c.client_secret } : {}) }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`SocialPilot token error (${res.status}): ${body.error_description || body.error || 'no token'}`);
  return { access_token: body.access_token, refresh_token: body.refresh_token || params.refresh_token, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
}

// Step 2: the browser comes back with ?code&state.
export async function finishConnect(code, stateId) {
  const pending = await store.get('socialpilot:pending:' + stateId);
  if (!pending || Date.now() - pending.at > 15 * 60e3) throw new Error('That sign-in link expired. Click Connect again.');
  await store.del('socialpilot:pending:' + stateId);
  const c = await client(pending.redirectUri);
  const t = await tokenCall(c, { grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier, resource: MCP });
  await store.set('socialpilot:token', { ...t, redirectUri: pending.redirectUri, connectedAt: new Date().toISOString() });
  toolCache = null; session = null;
}

export const disconnect = () => store.del('socialpilot:token');
export const connected = async () => !!(await store.get('socialpilot:token'))?.refresh_token;

async function accessToken() {
  const t = await store.get('socialpilot:token');
  if (!t) throw new Error('SocialPilot is not connected');
  if (t.expires_at - Date.now() > 60e3) return t.access_token;
  const fresh = await tokenCall(await client(t.redirectUri), { grant_type: 'refresh_token', refresh_token: t.refresh_token, resource: MCP });
  await store.set('socialpilot:token', { ...t, ...fresh });
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
    await new Promise((ok) => setTimeout(ok, (Number(res.headers.get('retry-after')) || 5 * 2 ** i) * 1000));
  }
  if (res.status === 404 && session && method !== 'initialize') { session = null; await open(); return rpc(method, params, { notify }); }
  if (res.status === 401) throw new Error('SocialPilot sign-in has expired: click Connect SocialPilot again.');
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = { ...(session || {}), id: sid };
  if (notify) return null;
  const text = await res.text();
  const payload = /text\/event-stream/.test(res.headers.get('content-type') || '')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === msg.id || m.result || m.error)
    : JSON.parse(text || '{}');
  if (!res.ok && !payload) throw new Error(`SocialPilot MCP ${res.status}: ${text.slice(0, 300)}`);
  if (payload?.error) throw new Error(`SocialPilot: ${payload.error.message || JSON.stringify(payload.error)}`);
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

export async function call(name, args) {
  await open();
  const r = await rpc('tools/call', { name, arguments: args });
  const text = (r?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (r?.isError) throw new Error(`SocialPilot ${name}: ${text.slice(0, 400)}`);
  if (r?.structuredContent) return r.structuredContent;
  try { return JSON.parse(text); } catch { return { text }; }
}

// Publishing. Filled in once the connected account's tools are known; until then every post is
// reported as skipped with the reason, so nothing is recorded as sent.
export async function publish(posts, { log = console.log } = {}) {
  const why = (await connected().catch(() => false))
    ? 'SocialPilot is connected; posting through it is being set up'
    : 'SocialPilot is not connected: click Connect SocialPilot in the admin';
  log(`SocialPilot: ${why}`);
  return posts.map((p) => ({ target: p.target, skipped: why }));
}
