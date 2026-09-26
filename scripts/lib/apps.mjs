// Loads the site config and every box's glassbox.json manifest, either from
// sibling folders on disk (local dev) or from the GitHub org (CI builds).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'glassbox.config.json'), 'utf8'));
export const SITE = `https://${config.domain}`;

// The media files the studio writes into <app>/glassbox/.
export const MEDIA = ['cover.jpg', 'still.jpg', 'thumb.jpg', 'slide-1.jpg', 'reel.mp4', 'video.mp4', 'post.json'];

const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const RESERVED = new Set(['e', 'studio', 'assets', 'about', 'privacy', 'terms', 'concepts', 'feed.xml', 'apps.json', 'bar.js']);

export function normalize(raw, extra = {}) {
  const m = { ...raw, ...extra };
  const errs = [];
  if (!SLUG.test(m.slug || '')) errs.push('slug must be lowercase letters, digits and dashes');
  if (RESERVED.has(m.slug)) errs.push(`slug "${m.slug}" is reserved by the hub`);
  for (const k of ['title', 'question', 'hook', 'field', 'date']) if (!m[k]) errs.push(`missing "${k}"`);
  if (!Number.isInteger(m.box) || m.box < 1) errs.push('"box" must be the box number (1, 2, 3 …)');
  if (m.field && !config.fields[m.field]) errs.push(`unknown field "${m.field}" (see glassbox.config.json fields)`);
  if (errs.length) throw new Error(`${m.slug || '(no slug)'}: ${errs.join('; ')}`);
  const field = config.fields[m.field];
  return {
    tags: [], explainer: [], concepts: [], links: {}, media: {}, storage: [], credits: [],
    ...m,
    color: m.color || field.color,
    fieldLabel: field.label,
    no: String(m.box).padStart(3, '0'),
    repo: m.repo || `https://github.com/${config.org}/${m.slug}`,
    appUrl: `/${m.slug}/`,
    pageUrl: `/e/${m.slug}/`,
  };
}

// Local: apps.local.json lists sibling repo folders. Dev server also serves them.
export function localApps() {
  const file = path.join(ROOT, 'apps.local.json');
  if (!fs.existsSync(file)) return [];
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).apps || [];
  return list.map((p) => {
    const dir = path.resolve(ROOT, p);
    const mf = path.join(dir, 'glassbox.json');
    if (!fs.existsSync(mf)) throw new Error(`${dir} has no glassbox.json`);
    const raw = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const media = {};
    for (const f of MEDIA) if (fs.existsSync(path.join(dir, 'glassbox', f))) media[f] = true;
    return { ...normalize(raw, { media }), dir };
  });
}

// CI: every public repo in the org tagged with the topic is a box.
export async function githubApps() {
  const headers = { 'User-Agent': 'glassbox-build', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const q = encodeURIComponent(`org:${config.org} topic:${config.topic} is:public`);
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=100`, { headers });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status} ${await res.text()}`);
  const { items } = await res.json();
  const out = [];
  for (const r of items) {
    const raw = `https://raw.githubusercontent.com/${r.full_name}/${r.default_branch}`;
    const mr = await fetch(`${raw}/glassbox.json`, { headers });
    if (!mr.ok) { console.warn(`skip ${r.full_name}: no glassbox.json`); continue; }
    try {
      const media = {};
      await Promise.all(MEDIA.map(async (f) => {
        const h = await fetch(`${raw}/glassbox/${f}`, { method: 'HEAD', headers });
        if (h.ok) media[f] = true;
      }));
      out.push(normalize(await mr.json(), { media, repo: r.html_url, stars: r.stargazers_count }));
    } catch (e) { console.warn(`skip ${r.full_name}: ${e.message}`); }
  }
  return out;
}

export async function loadApps({ source } = {}) {
  const src = source || (process.env.CI ? 'github' : 'local');
  const apps = src === 'github' ? await githubApps() : localApps();
  const seen = new Set();
  for (const a of apps) {
    if (seen.has(a.slug)) throw new Error(`duplicate slug ${a.slug}`);
    seen.add(a.slug);
  }
  // Newest box first; the shelf and feed read in that order.
  return apps.sort((a, b) => b.box - a.box);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
