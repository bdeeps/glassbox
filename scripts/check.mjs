// Validates every local box manifest and flags what's missing before a ship.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, localApps } from './lib/apps.mjs';
import { csp } from './lib/analytics.mjs';
import { ART_NAMES } from '../site/assets/art.js';

// Checks a history.json against the framework's expectations (docs/HISTORY.md).
function checkHistory(h) {
  const w = [];
  if (!h) return ['no history.json (every box should tell its history; see docs/HISTORY.md)'];
  const eras = new Set((h.eras || []).map((e) => e.id));
  if (/^Replace|One sentence that spans/.test(JSON.stringify(h))) w.push('history.json still has template text');
  if ((h.events || []).length < 12) w.push(`history has only ${(h.events || []).length} moments (aim for 20+)`);
  if ((h.events || []).filter((e) => e.key).length < 5) w.push('mark at least 5 key moments ("key": true) for the history reel');
  (h.events || []).forEach((e, i) => {
    const at = `history event ${i + 1} (${e.title || 'untitled'})`;
    if (!Number.isInteger(e.year) || !e.date || !e.title || !e.text) w.push(`${at}: needs year, date, title and text`);
    if (!eras.has(e.era)) w.push(`${at}: unknown era "${e.era}"`);
    if (e.art && !ART_NAMES.includes(e.art)) w.push(`${at}: unknown art "${e.art}" (one of ${ART_NAMES.join(', ')})`);
    if (!(e.sources || []).length) w.push(`${at}: no source`);
    if ((e.sources || []).some((n) => !h.sources?.[n])) w.push(`${at}: points at a missing source`);
  });
  for (const s of h.series || []) if ((s.points || []).some((p) => s.log && p.value <= 0)) w.push(`series ${s.id}: log scale needs values above 0`);
  return w;
}

let bad = 0;
let apps = [];
try { apps = localApps(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
for (const a of apps.sort((x, y) => x.box - y.box)) {
  const warn = [];
  if (a.explainer.length < 3) warn.push('fewer than 3 explainer beats');
  if (/one or two sentences|say what is really going on/i.test(a.hook + JSON.stringify(a.explainer))) warn.push('template text still in glassbox.json');
  if (!fs.existsSync(path.join(a.dir, 'LICENSE'))) warn.push('no LICENSE');
  if (!fs.existsSync(path.join(a.dir, '.nojekyll'))) warn.push('no .nojekyll (GitHub Pages may hide files)');
  const html = fs.readFileSync(path.join(a.dir, 'index.html'), 'utf8');
  if (!html.includes('/bar.js')) warn.push('index.html does not load /bar.js');
  if (/(src|href)="\/(?!bar\.js)/.test(html)) warn.push('root-absolute URLs in index.html break under /<slug>/; use relative paths');
  if (/https:\/\/(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg|cdnjs)/.test(html)) warn.push('index.html loads from a third-party CDN; self-host it (the privacy policy promises no third-party requests)');
  if (!html.includes('Content-Security-Policy')) warn.push('no Content-Security-Policy meta tag');
  const hashes = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)].map((m) => crypto.createHash('sha256').update(m[1]).digest('base64'));
  if (!html.includes(`content="${csp({ scriptHashes: hashes })}"`)) warn.push(`import map or analytics changed: CSP is stale, run npm run readme -- ${a.slug}`);
  const js = fs.readdirSync(a.dir, { recursive: true }).filter((f) => /\.m?js$/.test(f) && !f.includes('node_modules'));
  if (!js.some((f) => fs.readFileSync(path.join(a.dir, f), 'utf8').includes('glassbox'))) warn.push('no window.glassbox.director found (studio cannot record video)');
  if (!a.media['post.json']) warn.push('not recorded yet (no glassbox/post.json)');
  warn.push(...checkHistory(a.history));
  for (const f of ['reel.mp4', 'video.mp4']) {
    const p = path.join(a.dir, 'glassbox', f);
    if (fs.existsSync(p) && fs.statSync(p).size > 95e6) warn.push(`${f} is over GitHub's 100 MB file limit`);
  }
  console.log(`${warn.length ? '⚠' : '✓'} No. ${a.no} ${a.slug} (${a.date}, ${config.fields[a.field].label})`);
  warn.forEach((w) => console.log('    - ' + w));
  if (warn.some((w) => /limit|root-absolute|bar\.js|third-party|CSP is stale/.test(w))) bad++;
}
const nums = apps.map((a) => a.box).sort((x, y) => x - y);
nums.forEach((n, i) => { if (i && n !== nums[i - 1] + 1) { console.log(`⚠ box numbers jump from ${nums[i - 1]} to ${n}`); } });
process.exit(bad ? 1 : 0);
