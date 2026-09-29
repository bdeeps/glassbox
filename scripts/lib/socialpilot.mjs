// SocialPilot, through its MCP server (https://mcp.socialpilot.co/mcp).
// Connecting is one click in the admin: the server registers itself with SocialPilot's OAuth
// (dynamic client registration + PKCE; SocialPilot issues a client secret, kept in the admin
// store), you sign in once, and the refresh token is kept in the admin store.
import crypto from 'node:crypto';
import * as store from './store.mjs';
import { config } from './apps.mjs';

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

// Publishing. SocialPilot's connector posts text, images, links and PDFs only: no video, and
// no YouTube. So image carousels go out as image posts, video targets on networks that take
// links go out as a link to the box, and everything else (YouTube, reels) is reported as
// skipped with the reason, never recorded as sent.
const PLATFORM = { facebook: /facebook/i, instagram: /instagram/i, linkedin: /linkedin/i, twitter: /^(x|twitter)/i, threads: /threads/i, pinterest: /pinterest/i, bluesky: /bluesky/i, youtube: /youtube/i, tiktok: /tiktok/i };
const LINKS_OK = new Set(['facebook', 'linkedin', 'twitter', 'threads']);
const isImage = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);

export async function accounts() {
  const out = await call('AccountList', { limit: 200 });
  return (out.accounts || []).filter((a) => !a.isReconnect).map((a) => ({ loginId: a.loginId, platform: a.platform, name: a.accountUsername, handle: (a.accountUrl || '').match(/(?:instagram|x|twitter)\.com\/([\w.]+)/i)?.[1]?.toLowerCase() || null, service: Object.keys(PLATFORM).find((k) => PLATFORM[k].test(a.platform)) || null }));
}

// Only ever post to Glassbox's own handles (glassbox.config.json "handles"). The handle is read
// from the account's real profile link, not its display name, which can be renamed in SocialPilot.
const HANDLE_OF = { instagram: 'instagram', twitter: 'x' };
function ours(service, list) {
  const want = (config.handles?.[HANDLE_OF[service]] || '').replace(/^@/, '').toLowerCase();
  if (!want) return { ids: list.map((a) => a.loginId) };
  const hit = list.filter((a) => a.handle === want);
  if (hit.length) return { ids: hit.map((a) => a.loginId) };
  return { ids: [], why: `SocialPilot's ${service} account is @${list.map((a) => a.handle || a.name).join(', @')}, not @${want}: connect @${want} in SocialPilot` };
}

// "YYYY-MM-DD HH:mm" in India time, which is how the SocialPilot account schedules.
const istStamp = (iso) => new Date(Date.parse(iso) + 330 * 60e3).toISOString().slice(0, 16).replace('T', ' ');

export async function publish(posts, { dry = false, drafts = false, log = console.log } = {}) {
  if (!(await connected().catch(() => false))) return posts.map((p) => ({ target: p.target, skipped: 'SocialPilot is not connected: click Connect SocialPilot in the admin' }));
  const accs = await accounts();
  const results = [];
  for (const p of posts) {
    const mine = accs.filter((a) => a.service === p.service);
    if (!mine.length) { results.push({ target: p.target, skipped: `no ${p.service} account in SocialPilot` }); continue; }
    const { ids, why } = ours(p.service, mine);
    if (!ids.length) { results.push({ target: p.target, skipped: why }); continue; }
    const imgs = (p.media || []).filter(isImage);
    const link = (p.text || '').match(/https:\/\/glassbox\.how\/[^\s)]*/)?.[0];
    let body;
    if (imgs.length && imgs.length === (p.media || []).length) body = { type: 'image', image: { images: imgs.slice(0, 10), postDescription: p.text || '' } };
    else if (LINKS_OK.has(p.service) && link) body = { type: 'article', article: { postUrl: link, postDescription: p.text || '' } };
    else { results.push({ target: p.target, skipped: `SocialPilot can't post video to ${p.service} from Glassbox (its connection takes images and links only)` }); continue; }
    const when = p.at && Date.parse(p.at) > Date.now() + 10 * 60e3 ? istStamp(p.at) : null;
    const args = { ...body, loginIds: ids, ...(drafts ? {} : when ? { shareType: 3, scheduleDateTime: [when] } : { shareType: 0 }) };
    if (dry) { log(`  • ${p.target.padEnd(20)} → SocialPilot ${drafts ? 'draft' : when ? 'at ' + when + ' IST' : 'queue'} (${body.type})`); results.push({ target: p.target, dry: true }); continue; }
    try {
      const r = await call(drafts ? 'CreateDraft' : 'CreatePost', args);
      if (r?.success === false) throw new Error(r.message || 'refused');
      results.push({ target: p.target, id: r?.postId || r?.draftId || r?.data?.id || null, dueAt: p.at || null, draft: drafts || undefined });
      log(`  ✓ ${p.target} → SocialPilot ${drafts ? 'draft' : when ? 'scheduled ' + when + ' IST' : 'queued'} (${body.type})`);
    } catch (e) {
      results.push({ target: p.target, error: e.message });
      log(`  ✗ ${p.target} (SocialPilot): ${e.message}`);
    }
  }
  return results;
}
