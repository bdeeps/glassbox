// Admin state that must outlive deploys and be shared by every replica: the auto-publish
// switch, what has been published where, the Hootsuite connection and a short activity log.
// On Railway it lives in Postgres (DATABASE_URL); locally, without one, in .data/admin.json.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './apps.mjs';

let db = null;       // a pg Pool, or null when using the local file
let ready = null;

async function init() {
  if (!process.env.DATABASE_URL) return;
  const { default: pg } = await import('pg');
  const internal = /\.railway\.internal/.test(process.env.DATABASE_URL);
  db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: internal || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  await db.query(`create table if not exists glassbox_kv (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
    create table if not exists glassbox_log (id bigserial primary key, at timestamptz not null default now(), slug text, provider text, ok boolean, message text not null);`);
}
const up = () => (ready ||= init());

// ---- local file fallback
const FILE = path.join(ROOT, '.data', 'admin.json');
const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { kv: {}, log: [] }; } };
const writeFile = (d) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); };

export const storeKind = async () => (await up(), db ? 'postgres' : 'file');

export async function get(key) {
  await up();
  if (!db) return readFile().kv[key] ?? null;
  const r = await db.query('select value from glassbox_kv where key = $1', [key]);
  return r.rows[0]?.value ?? null;
}

export async function set(key, value) {
  await up();
  if (!db) { const d = readFile(); d.kv[key] = value; return writeFile(d); }
  await db.query('insert into glassbox_kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()', [key, JSON.stringify(value)]);
}

export async function del(key) {
  await up();
  if (!db) { const d = readFile(); delete d.kv[key]; return writeFile(d); }
  await db.query('delete from glassbox_kv where key = $1', [key]);
}

// Every key starting with prefix, as { key: value }.
export async function list(prefix) {
  await up();
  if (!db) return Object.fromEntries(Object.entries(readFile().kv).filter(([k]) => k.startsWith(prefix)));
  const r = await db.query('select key, value from glassbox_kv where key like $1', [prefix.replace(/[%_]/g, '\\$&') + '%']);
  return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
}

// Sets key only if nobody has yet: true for exactly one caller, across all replicas.
// A claim older than staleMs is treated as abandoned (a replica died mid-publish).
export async function claim(key, value, staleMs = 20 * 60e3) {
  await up();
  const v = { ...value, claimedAt: new Date().toISOString() };
  if (!db) {
    const d = readFile(); const old = d.kv[key];
    if (old && Date.now() - Date.parse(old.claimedAt || 0) < staleMs) return false;
    d.kv[key] = v; writeFile(d); return true;
  }
  const r = await db.query(`insert into glassbox_kv (key, value) values ($1, $2)
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where glassbox_kv.updated_at < now() - ($3 || ' milliseconds')::interval
    returning key`, [key, JSON.stringify(v), String(staleMs)]);
  return r.rowCount === 1;
}

export async function log(message, { slug = null, provider = null, ok = true } = {}) {
  await up();
  const row = { at: new Date().toISOString(), slug, provider, ok, message: String(message).slice(0, 2000) };
  if (!db) { const d = readFile(); d.log = [row, ...(d.log || [])].slice(0, 200); return writeFile(d); }
  await db.query('insert into glassbox_log (slug, provider, ok, message) values ($1, $2, $3, $4)', [slug, provider, ok, row.message]);
}

export async function recent(n = 40) {
  await up();
  if (!db) return (readFile().log || []).slice(0, n);
  const r = await db.query('select at, slug, provider, ok, message from glassbox_log order by id desc limit $1', [n]);
  return r.rows;
}
