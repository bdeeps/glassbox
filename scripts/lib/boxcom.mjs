// Box (box.com) as a home for every box's videos: a "Glassbox" folder with one folder per
// date, holding that day's Short, long video and history Short. It uses the same Box Platform
// app as ClearTrust's Folio and Data Room (Client Credentials Grant, acting as the app's own
// service account). Nothing is sent until these are set:
//   BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID   the Box app
//   BOX_FOLDER_ID   optional: the folder to fill. Without it, a folder named "Glassbox" at the
//                   top of the app's own files is found, or made on first use.
// Uploads run in the background from a queue in the shared store, one box at a time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as store from './store.mjs';
import { niceName } from './buffer.mjs';

const API = 'https://api.box.com/2.0';
const UPLOAD = 'https://upload.box.com/api/2.0';
const SIMPLE_MAX = 50 * 1024 * 1024;   // Box's limit for a one-request upload
const VIDEOS = [['reel', 'Short'], ['video', 'video'], ['historyReel', 'history Short']];

export const configured = () => !!(process.env.BOX_CLIENT_ID && process.env.BOX_CLIENT_SECRET && process.env.BOX_ENTERPRISE_ID);

let token = null;
async function accessToken(force = false) {
  if (!configured()) throw new Error('Box is not set up (BOX_CLIENT_ID, BOX_CLIENT_SECRET and BOX_ENTERPRISE_ID)');
  if (!force && token && token.until > Date.now() + 60e3) return token.value;
  const res = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.BOX_CLIENT_ID, client_secret: process.env.BOX_CLIENT_SECRET, box_subject_type: 'enterprise', box_subject_id: process.env.BOX_ENTERPRISE_ID }),
    signal: AbortSignal.timeout(20000),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b.access_token) throw new Error(`Box refused the app's credentials${b.error_description ? ': ' + b.error_description : ''}`);
  token = { value: b.access_token, until: Date.now() + (b.expires_in ?? 3600) * 1000 };
  return token.value;
}

// One Box call, as JSON. Retries once on an expired token and on a dropped connection.
async function call(url, init = {}, tries = 0) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { authorization: `Bearer ${await accessToken(tries > 0 && init.reauth)}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(init.timeout || 30000) });
  } catch (e) {
    if (tries < 2) { await new Promise((r) => setTimeout(r, 1500 * (tries + 1))); return call(url, init, tries + 1); }
    throw new Error(`Box did not answer (${e.cause?.code || e.name})`);
  }
  if (res.status === 401 && !init.reauth) return call(url, { ...init, reauth: true }, 1);
  if ((res.status === 429 || res.status >= 500) && tries < 2) { await new Promise((r) => setTimeout(r, (+res.headers.get('retry-after') || 2) * 1000)); return call(url, init, tries + 1); }
  const b = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Box: ${b.message || res.statusText} (${res.status})`), { status: res.status, conflict: [b.context_info?.conflicts].flat()[0] });
  return b;
}
const post = (url, body) => call(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// A folder of that name inside parent: the existing one, or a new one.
async function folder(parentId, name) {
  try { return (await post(`${API}/folders?fields=id,name`, { name, parent: { id: parentId } })).id; }
  catch (e) { if (e.status === 409 && e.conflict?.id) return e.conflict.id; throw e; }
}

// The Glassbox folder. Its id is kept in the store so every replica uses the same one.
export async function rootFolder() {
  if (process.env.BOX_FOLDER_ID) return process.env.BOX_FOLDER_ID;
  const saved = await store.get('boxcom:root');
  if (saved?.id) return saved.id;
  const id = await folder('0', 'Glassbox');
  await store.set('boxcom:root', { id });
  return id;
}
export const folderUrl = (id) => `https://app.box.com/folder/${id}`;

const sha1 = (file) => new Promise((ok, no) => { const h = crypto.createHash('sha1'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });

// Uploads one file. A file of that name already there with the same contents is left alone;
// with different contents it gets a new version.
async function upload(folderId, name, file) {
  const size = fs.statSync(file).size;
  if (size > SIMPLE_MAX) throw new Error(`${name} is ${(size / 1048576).toFixed(0)} MB, over Box's 50 MB single-upload limit`);
  const hash = await sha1(file);
  const form = (attrs) => { const f = new FormData(); f.set('attributes', JSON.stringify(attrs)); f.set('file', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), name); return f; };
  const send = (url, attrs) => call(url, { method: 'POST', headers: { 'content-md5': hash }, body: form(attrs), timeout: 10 * 60e3 });
  try {
    const r = await send(`${UPLOAD}/files/content?fields=id,name,size`, { name, parent: { id: folderId } });
    return { id: r.entries[0].id, size, state: 'new' };
  } catch (e) {
    if (e.status !== 409 || !e.conflict?.id) throw e;
    if ((e.conflict.sha1 || e.conflict.file_version?.sha1) === hash) return { id: e.conflict.id, size, state: 'same' };
    const r = await send(`${UPLOAD}/files/${e.conflict.id}/content?fields=id,name,size`, { name });
    return { id: r.entries[0].id, size, state: 'version' };
  }
}

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);   // the date in India

// Copies a box's videos into Glassbox/<date>/. `date` is the box's date on the site.
export async function pushBox(box, { log = () => {}, by = 'you' } = {}) {
  let plan;
  try { plan = JSON.parse(fs.readFileSync(path.join(box.dir, 'glassbox', 'post.json'), 'utf8')); } catch { throw new Error(`${box.slug} is not recorded yet`); }
  const todo = VIDEOS.map(([k, label]) => ({ f: plan.assets?.[k], label })).filter((v) => v.f && fs.existsSync(path.join(box.dir, 'glassbox', v.f)));
  if (!todo.length) throw new Error(`${box.slug} has no videos on this server`);
  const prev = await store.get('boxcom:' + box.slug);
  const date = prev?.date || (/^\d{4}-\d{2}-\d{2}$/.test(box.date || '') ? box.date : today());
  const dir = await folder(await rootFolder(), date);
  log(`${box.slug}: ${todo.length} video(s) to Box, folder ${date}`);
  const files = [];
  for (const v of todo) {
    const name = `${String(box.no ?? '').padStart(3, '0')}-${niceName({ ...plan, slug: box.slug }, v.f)}`.replace(/^-/, '');
    const r = await upload(dir, name, path.join(box.dir, 'glassbox', v.f));
    files.push({ file: v.f, name, id: r.id, size: r.size });
    log(`  ✓ ${v.label}: ${name}${r.state === 'same' ? ' (already there)' : r.state === 'version' ? ' (new version)' : ''}`);
  }
  const rec = { at: new Date().toISOString(), by, date, folderId: dir, files };
  await store.set('boxcom:' + box.slug, rec);
  await store.log(`${files.length} video(s) saved to Box, folder ${date}`, { slug: box.slug, provider: 'box' });
  return rec;
}

// ---- the queue: [{ slug, state: 'queued'|'running'|'error', error?, added }]
const QUEUE = 'boxcom:queue';
export const queue = async () => (await store.get(QUEUE)) || [];
export async function enqueue(slugs) {
  const cur = await queue();
  const next = [...cur.filter((x) => !slugs.includes(x.slug) || x.state === 'running'),
    ...slugs.filter((s) => !cur.some((x) => x.slug === s && x.state === 'running')).map((slug) => ({ slug, state: 'queued', added: new Date().toISOString() }))];
  await store.set(QUEUE, next);
  return next;
}
export async function dequeue(slug) {
  const next = (await queue()).filter((x) => (slug ? x.slug !== slug || x.state === 'running' : x.state === 'running'));
  await store.set(QUEUE, next);
  return next;
}

let running = false;
export async function runQueue(getApps, logFn = console.log) {
  if (running || !configured()) return;
  running = true;
  try {
    for (;;) {
      let items = await queue();
      items = items.map((x) => (x.state === 'running' && Date.now() - Date.parse(x.startedAt || 0) > 20 * 60e3 ? { ...x, state: 'queued' } : x));
      const item = items.find((x) => x.state === 'queued');
      if (!item) break;
      if (!(await store.claim('boxcom:runner', {}, 20 * 60e3))) break;   // another replica is on it
      const mark = async (patch) => store.set(QUEUE, (await queue()).flatMap((x) => (x.slug !== item.slug ? [x] : patch ? [{ ...x, ...patch }] : [])));
      await mark({ state: 'running', startedAt: new Date().toISOString(), error: null });
      try {
        const box = getApps().find((a) => a.slug === item.slug);
        if (!box) throw new Error('box not found on this server');
        await pushBox(box, { by: item.by || 'queue', log: (m) => logFn(`[box ${item.slug}] ${m.trim()}`) });
        await mark(null);
      } catch (e) {
        await mark({ state: 'error', error: e.message.slice(0, 300) });
        await store.log(`Box: ${e.message}`, { slug: item.slug, provider: 'box', ok: false });
      }
      await store.del('boxcom:runner').catch(() => {});
    }
  } catch (e) { logFn('box: ' + e.message); } finally { running = false; }
}

// For the admin: is it connected, where is the folder, how much is in it.
let statusCache = null;
export async function status() {
  if (!configured()) return { configured: false };
  if (statusCache && Date.now() - statusCache.at < 5 * 60e3) return statusCache.v;
  let v;
  try {
    const id = await rootFolder();
    const f = await call(`${API}/folders/${id}?fields=name,permissions,item_collection`);
    const me = await call(`${API}/users/me?fields=space_used,space_amount`);
    v = { configured: true, ok: f.permissions?.can_upload !== false, folderId: id, name: f.name, url: folderUrl(id), days: f.item_collection?.total_count ?? 0, used: me.space_used, space: me.space_amount,
      ...(f.permissions?.can_upload === false ? { error: `the app cannot upload to "${f.name}": invite its service account as Editor` } : {}) };
  } catch (e) { v = { configured: true, ok: false, error: e.message }; }
  statusCache = { at: Date.now(), v };
  return v;
}

// Shares the Glassbox folder with a Box user (so it appears in their own Box) as an editor.
export async function shareWith(email) {
  const id = await rootFolder();
  try { await post(`${API}/collaborations`, { item: { type: 'folder', id }, accessible_by: { type: 'user', login: email }, role: 'editor' }); }
  catch (e) { if (e.status !== 409) throw e; }
  await store.log(`Box folder shared with ${email}`, { provider: 'box' });
  return { ok: true, url: folderUrl(id) };
}
