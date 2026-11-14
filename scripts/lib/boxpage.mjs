// How a box page is prepared for fast loads. Used by the production server (serve.mjs).
//
// 1. Every module in the page's graph gets a content-hashed URL (through the import map), so
//    the browser caches it for a year and never has to ask "has this changed?" again.
// 2. The whole graph is listed as <link rel="modulepreload">, so it downloads in parallel.
// 3. Files that are byte-identical in every box (three.js and its addons, the fonts) are served
//    from one shared address, /_s/<hash>/…, instead of once per box. A visitor who has opened
//    one box already has them for all the others.
//
// The page's own <meta> Content-Security-Policy pins the import map by hash, so that hash is
// recomputed here. If anything looks unusual the page is left exactly as the box wrote it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64url = (buf) => crypto.createHash('sha1').update(buf).digest('base64url');
const ver = (file) => { try { return b64url(fs.readFileSync(file)).slice(0, 10); } catch { return null; } };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('base64');

const THREE = 'vendor/three/';
const THREE_MAIN = THREE + 'three.module.min.js';

// hash → the box folders that hold that exact three.js build. All are kept, because one box may
// vendor an addon another does not.
let threeDirs = new Map();
let threeOf = new Map();      // box dir → hash
let commonThree = null;       // the build most boxes use (what the hub warms up)
let hubFonts = null;          // { hash, href } when the hub's own fonts can stand in for a box's

const hashes = new Map();     // file:size:mtime → hash, so a re-sync only hashes what changed

// Called whenever the set of boxes changes. Deterministic, so every replica agrees on the
// addresses without talking to the others.
export function buildShared(apps, siteDir, fontsHref) {
  const dirs = new Map(), of = new Map();
  for (const a of apps) {
    const main = path.join(a.dir, THREE_MAIN);
    let st; try { st = fs.statSync(main); } catch { continue; }
    const k = `${main}:${st.size}:${st.mtimeMs}`;
    const h = hashes.get(k) || ver(main);
    if (!h) continue;
    hashes.set(k, h);
    of.set(a.dir, h);
    (dirs.get(h) || dirs.set(h, []).get(h)).push(path.join(a.dir, THREE));
  }
  threeDirs = dirs; threeOf = of;
  commonThree = [...dirs].sort((x, y) => y[1].length - x[1].length)[0]?.[0] || null;
  const f = ver(path.join(siteDir, 'assets/fonts/fonts.css'));
  hubFonts = f && fontsHref ? { hash: f, href: fontsHref } : null;
}

// /_s/<hash>/three/<rest> → a file on disk, or null. /_s/three.js → { redirect } to the common build.
export function sharedFile(p) {
  if (p === '/_s/three.js') return commonThree ? { redirect: `/_s/${commonThree}/three/three.module.min.js` } : null;
  const m = p.match(/^\/_s\/([\w-]{6,})\/three\/(.+)$/);
  if (!m || m[2].split('/').some((s) => s === '..' || s.startsWith('.'))) return null;
  for (const dir of threeDirs.get(m[1]) || []) {
    const file = path.resolve(dir, m[2]);
    if (!file.startsWith(path.resolve(dir) + path.sep)) return null;
    try { if (fs.statSync(file).isFile()) return { file }; } catch { /* try the next box */ }
  }
  return null;
}

const IMPORTS = /(?:^|[;\n}])\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

// html: the box's index.html. base: its folder. Returns the page to send.
export function prepareBoxPage(html, base) {
  const local = (rel) => !/^(?:https?:|\/|data:)/.test(rel);
  const v = (rel) => ver(path.join(base, rel));

  // Stylesheets: content-hashed, and the fonts come from the hub's copy when it is the same file.
  html = html.replace(/(<link[^>]+rel="stylesheet"[^>]+href=")([^"?]+)"/g, (m, a, rel) => {
    if (!local(rel)) return m;
    const h = v(rel);
    if (!h) return m;
    if (hubFonts && rel === 'fonts/fonts.css' && h === hubFonts.hash) return `${a}${hubFonts.href}"`;
    return `${a}${rel}?v=${h}"`;
  });

  const mapTag = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  let map = {};
  try { map = JSON.parse(mapTag?.[1] || '{}').imports || {}; } catch { /* no import map */ }
  const resolve = (spec, from) => {
    if (map[spec]) return path.posix.normalize(map[spec].replace(/^\.\//, ''));
    const pre = Object.keys(map).find((k) => k.endsWith('/') && spec.startsWith(k));
    if (pre) return path.posix.normalize(map[pre].replace(/^\.\//, '') + spec.slice(pre.length));
    if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return null;
  };
  const entries = [...html.matchAll(/<script type="module" src="([^"?]+)"/g)].map((m) => m[1]).filter(local).map((r) => path.posix.normalize(r));
  const seen = new Set(), queue = [...entries];
  while (queue.length && seen.size < 200) {
    const rel = queue.shift();
    if (seen.has(rel) || rel.startsWith('..')) continue;
    let src; try { src = fs.readFileSync(path.join(base, rel), 'utf8'); } catch { continue; }
    seen.add(rel);
    for (const m of src.matchAll(IMPORTS)) {
      const r = resolve(m[1] || m[2] || m[3], rel);
      if (r && !seen.has(r)) queue.push(r);
    }
  }

  // New addresses. They are only used when the import map can be rewritten safely: the page has
  // one, and its policy names that map's hash (or has no script hash to keep in step).
  const three = threeOf.get(base) && map.three === './' + THREE_MAIN ? `/_s/${threeOf.get(base)}/three/` : null;
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] || '';
  const oldHash = mapTag ? `'sha256-${sha256(mapTag[1])}'` : null;
  const canMap = mapTag && (csp.includes(oldHash) || !/'sha256-/.test(csp));
  const urlOf = (rel) => {
    if (!canMap) return rel;
    if (three && rel.startsWith(THREE)) return three + rel.slice(THREE.length);
    const h = v(rel);
    return h ? `${rel}?v=${h}` : rel;
  };

  if (canMap) {
    const imports = { ...map };
    if (three) { imports.three = three + 'three.module.min.js'; imports['three/addons/'] = three + 'addons/'; imports['./' + THREE] = three; }
    for (const rel of seen) {
      if (three && rel.startsWith(THREE)) continue;
      const u = urlOf(rel);
      if (u !== rel) imports['./' + rel] = './' + u;
    }
    const body = '\n' + JSON.stringify({ imports }, null, 2) + '\n';
    html = html.replace(mapTag[0], `<script type="importmap">${body}</script>`);
    if (csp.includes(oldHash)) html = html.replace(oldHash, `'sha256-${sha256(body)}'`);
    // A module script's own src is not looked up in the import map, so it is rewritten directly.
    html = html.replace(/(<script type="module" src=")([^"?]+)"/g, (m, a, rel) => (local(rel) ? `${a}${urlOf(path.posix.normalize(rel))}"` : m));
  }

  const pre = [...seen].filter((r) => !entries.includes(r)).map((r) => `<link rel="modulepreload" href="${urlOf(r)}">`).join('\n');
  if (pre) html = html.replace(/<\/head>/, `${pre}\n</head>`);
  return html;
}
