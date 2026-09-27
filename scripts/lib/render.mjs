// Renders every hub page to static HTML strings. Pages are generated (not
// client-rendered) so each carries its own share-card tags and works with
// JavaScript switched off. Every asset is served from our own domain.
import { config, SITE, esc } from './apps.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { csp, active, analyticsJs } from './analytics.mjs';
import { historyTeaser } from './history.mjs';
import { art as artByName } from '../../site/assets/art.js';

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
export const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mediaUrl = (a, f) => `/${a.slug}/glassbox/${f}`;
const coverOf = (a) => (a.media['cover.jpg'] ? mediaUrl(a, 'cover.jpg') : null);
const poster = (a) => (a.media['slide-1.jpg'] ? `poster="${mediaUrl(a, 'slide-1.jpg')}"` : a.media['cover.jpg'] ? `poster="${mediaUrl(a, 'cover.jpg')}"` : '');
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const H = config.handles;
const REPO = `https://github.com/${config.org}/${config.hubRepo}`;
const SUGGEST = `${REPO}/issues/new?template=box-idea.yml`;

// Our own origin, the analytics services, and YouTube's no-cookie player after a click.
const CSP = () => csp({ frames: ['https://www.youtube-nocookie.com'] });

export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 56 18v28L32 59 8 46V18Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 18l24 13 24-13M32 31v28" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".45"/><circle cx="32" cy="31" r="7" fill="var(--glow, #8ef0ff)"/></svg>`;
const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  read: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5a2.5 2.5 0 0 1 2.5 2.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Versioned asset URLs: the server caches ?v= requests for a year, and a new build changes the hash.
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
const vcache = new Map();
export function asset(p) {
  if (!vcache.has(p)) {
    let body;
    try { body = p === '/assets/analytics.js' ? analyticsJs() : fs.readFileSync(new URL('../../site' + p, import.meta.url)); } catch { body = ''; }
    vcache.set(p, `${p}?v=${hash(body)}`);
  }
  return vcache.get(p);
}

export function head({ title, description, url, image, type = 'website', extra = '', cls = '' , style = '' }) {
  const img = image ? (image.startsWith('http') ? image : SITE + image) : `${SITE}/assets/og.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP()}">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#07080c">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(config.brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${H.x ? `<meta name="twitter:site" content="@${esc(H.x)}">` : ''}
<link rel="icon" href="${asset('/assets/icon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.brand)}" href="/feed.xml">
<link rel="preload" href="/assets/fonts/instrument-serif-latin-5.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/instrument-serif-latin-7.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist-latin-1.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist-mono-latin-3.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/assets/fonts/fonts.css')}">
<link rel="stylesheet" href="${asset('/assets/site.css')}">
<script src="${asset('/assets/analytics.js')}" defer></script>
${extra}
</head>
<body class="${cls}"${style ? ` style="${style}"` : ''}>
<a class="skip" href="#main">Skip to content</a>`;
}

export function nav() {
  return `<header class="nav">
  <a class="brand" href="/" aria-label="${esc(config.brand)} home">${LOGO}<span>${esc(config.brand)}</span></a>
  <nav aria-label="Main">
    <a href="/#shelf">Shelf</a>
    <a href="/laws/">Laws</a>
    <a href="/concepts/" class="wide">Concepts</a>
    <a href="/history/">History</a>
    <a href="/#calendar" class="wide">Calendar</a>
    <button class="search-btn" data-open-search aria-label="Search boxes and concepts">${ICON.search}<span>Search</span><kbd>/</kbd></button>
    <a class="icon" href="https://github.com/${esc(config.org)}" rel="noopener" target="_blank" aria-label="Glassbox on GitHub">${ICON.gh}</a>
  </nav>
</header>`;
}

export function footer() {
  return `<footer class="foot">
  <div class="foot-grid">
    <div class="foot-brand">
      <a class="brand" href="/">${LOGO}<span>${esc(config.brand)}</span></a>
      <p>${esc(config.tagline)} ${esc(config.pitch)}</p>
      <p class="promise-line">No accounts. No ads. Nothing sold. <a href="/privacy/">Exactly what we measure, and why.</a></p>
    </div>
    <div><h4>Explore</h4><a href="/#today">Today's box</a><a href="/#shelf">The shelf</a><a href="/concepts/">Concepts A–Z</a><a href="/history/">Every history</a><a href="/#calendar">Calendar</a></div>
    <div><h4>Follow</h4>${H.youtube ? `<a href="https://youtube.com/${esc(H.youtube)}" rel="noopener" target="_blank">YouTube</a>` : ''}${H.instagram ? `<a href="https://instagram.com/${esc(H.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}<a href="/feed.xml">RSS feed</a><a href="https://github.com/${esc(config.org)}" rel="noopener" target="_blank">GitHub</a></div>
    <div><h4>The small print</h4><a href="/privacy/">Privacy</a>${active().ga4 ? '<a href="/privacy/#choices" data-privacy-choices>Privacy choices</a>' : ''}<a href="/terms/">Terms</a><a href="/terms/#licences">Licences</a><a href="${SUGGEST}" rel="noopener" target="_blank">Suggest a box</a></div>
  </div>
  <p class="colophon">Code under ${esc(config.licenses.code)}. Words, images and videos under ${esc(config.licenses.content)}. Static files on GitHub Pages; fonts self-hosted; visits measured with Google Analytics, bots detected with ClickTrust. © ${new Date(config.policyDate).getUTCFullYear()} ${esc(config.owner)}.</p>
</footer>
<div class="palette" id="palette" hidden>
  <div class="palette-card" role="dialog" aria-modal="true" aria-label="Search">
    <label class="palette-input">${ICON.search}<input id="paletteInput" type="search" placeholder="Search boxes, questions and concepts…" autocomplete="off" spellcheck="false" aria-controls="paletteList"><kbd>esc</kbd></label>
    <ul id="paletteList" class="palette-list" role="listbox"></ul>
    <p class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>/</kbd> or <kbd>⌘K</kbd> search anywhere</span></p>
  </div>
</div>
<script src="${asset('/assets/site.js')}" defer></script>
</body>
</html>`;
}

// Prefer the clean, text-free still; fall back to the share cover.
function art(a, cls = '', eager = false) {
  const c = a.media['still.jpg'] ? mediaUrl(a, 'still.jpg') : coverOf(a);
  if (c && a.media['still.jpg']) cls += ' clean';
  return c
    ? `<img class="art ${cls}" src="${c}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1200" height="630">`
    : `<div class="art fallback ${cls}" aria-hidden="true"><span>${a.no}</span></div>`;
}

function card(a) {
  const hay = [a.question, a.title, a.fieldLabel, ...a.tags, ...a.concepts.map((c) => c.term)].join(' ').toLowerCase();
  return `<a class="card" href="${a.pageUrl}" style="--c:${esc(a.color)}" data-field="${esc(a.field)}" data-box="${a.box}" data-hay="${esc(hay)}">
    <div class="card-art">${art(a)}<span class="badge">No. ${a.no}</span></div>
    <div class="card-body">
      <div class="meta"><span class="dot"></span><span>${esc(a.fieldLabel)}</span><span class="sep">·</span><span>${fmtDate(a.date, { day: 'numeric', month: 'short' })}</span></div>
      <h3>${esc(a.question)}</h3>
      <p>${esc(a.title)}${a.minutes ? ` · ${a.minutes} min` : ''}</p>
    </div>
  </a>`;
}

function sealed(date, n) {
  return `<div class="card sealed" data-sealed aria-label="Box ${n} opens ${fmtDate(date)}">
    <div class="card-art"><div class="art fallback"><span>${String(n).padStart(3, '0')}</span></div><span class="badge">Sealed</span></div>
    <div class="card-body"><div class="meta"><span>Opens ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    <h3>Something you use every day.</h3><p>Follow along to see what's inside.</p></div>
  </div>`;
}

// A display case in the home page's cabinet. The whole case plays the box; the small
// buttons open the 60-second read and the history.
function caseTile(a, i, feature) {
  const hay = [a.question, a.title, a.fieldLabel, ...a.tags, ...a.concepts.map((c) => c.term)].join(' ').toLowerCase();
  const img = a.media['still.jpg'] ? mediaUrl(a, 'still.jpg') : coverOf(a);
  return `<article class="case${feature ? ' feature' : ''}" id="${feature ? 'today' : `box-${a.slug}`}" style="--c:${esc(a.color)};--i:${i}" data-field="${esc(a.field)}" data-box="${a.box}" data-hay="${esc(hay)}" data-tilt>
    <div class="glass">
      ${img ? `<img src="${img}" alt="" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1200" height="630">` : `<div class="art fallback"><span>${a.no}</span></div>`}
      <i class="sheen" aria-hidden="true"></i><i class="seal" aria-hidden="true"></i>
    </div>
    <a class="stretch" href="${a.appUrl}" aria-label="Play: ${esc(a.question)}"></a>
    <div class="case-body">
      <p class="case-meta"><span class="no">No. ${a.no}</span><span class="fld"><i></i>${esc(a.fieldLabel)}</span>${feature ? '<span class="now"><i class="pulse"></i>Today</span>' : ''}</p>
      <h3>${esc(a.question)}</h3>
      ${feature ? `<p class="hook">${esc(a.hook)}</p>` : ''}
      <div class="case-actions">
        <a class="ca play" href="${a.appUrl}" tabindex="-1">${ICON.play}<span>Play</span></a>
        <a class="ca ic" href="${a.pageUrl}" title="Read it in 60 seconds" aria-label="Read: ${esc(a.question)}">${ICON.read}<span>Read</span></a>
        ${a.historyUrl ? `<a class="ca ic" href="${a.historyUrl}" title="${esc(a.history?.title || 'History')}" aria-label="History: ${esc(a.history?.title || a.title)}">${ICON.clock}<span>History</span></a>` : ''}
      </div>
    </div>
  </article>`;
}

// Sealed boxes fill out the last row of the 5-column desktop cabinet (today's case is 2×2).
// The cabinet adds columns as boxes arrive so every box stays in the first screen (up to
// about 21; after that it scrolls). Today's box takes 2×2 cells.
const cabinetCols = (n) => Math.min(8, Math.max(5, Math.ceil((n + 3) / 3)));
const sealedCount = (n, cols = cabinetCols(n)) => (n ? (cols - ((n + 3) % cols)) % cols : 5);

function sealedCase(date, n, i) {
  return `<article class="case sealed" data-sealed style="--i:${i}" aria-label="Box ${n} opens ${fmtDate(date)}">
    <div class="glass"><div class="black"><span class="n">${String(n).padStart(3, '0')}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></div></div>
    <div class="case-body"><p class="case-meta"><span class="no">No. ${String(n).padStart(3, '0')}</span><span class="fld">Sealed</span></p>
    <h3>Opens ${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3></div>
  </article>`;
}

// ---------------------------------------------------------------- laws and principles
// A principle box's case: the formula is the picture. Clicking opens the law in a modal
// (site.js) that offers the full principle box; without JavaScript the link just goes there.
const lawType = (l) => (l.principle?.type === 'law' ? 'Law' : 'Principle');
function lawTile(l, i, boxes) {
  const P = l.principle || {};
  const seen = (P.appliesTo || []).map((s) => boxes.find((b) => b.slug === s)).filter(Boolean);
  const hay = [l.title, l.question, P.name, P.formula, ...(l.tags || []), ...seen.map((b) => b.title)].join(' ').toLowerCase();
  return `<article class="case law" style="--c:${esc(l.color)};--i:${i}" data-field="${esc(l.field)}" data-box="${l.box}" data-hay="${esc(hay)}" data-tilt>
    <div class="glass law-glass">
      <div class="law-art" aria-hidden="true">${artSvgInline(P.art)}</div>
      <p class="law-formula">${esc(P.formula || '')}</p>
      <i class="sheen" aria-hidden="true"></i><i class="seal" aria-hidden="true"></i>
    </div>
    <a class="stretch" href="${l.appUrl}" data-law="${esc(l.slug)}" aria-label="${esc(P.name || l.title)}: open"></a>
    <div class="case-body">
      <p class="case-meta"><span class="no">${lawType(l)} ${l.no.slice(1)}</span><span class="fld"><i></i>${esc(l.fieldLabel)}</span></p>
      <h3>${esc(P.name || l.title)}</h3>
      ${seen.length ? `<p class="law-seen">Seen in ${seen.slice(0, 3).map((b) => esc(b.title)).join(', ')}${seen.length > 3 ? ` +${seen.length - 3}` : ''}</p>` : ''}
    </div>
  </article>`;
}

function artSvgInline(name) {
  return name ? artByName(name, 64) : '';
}

// Everything the modal needs, as JSON the page carries (not executed, so the CSP is happy).
function lawsData(laws, boxes) {
  const pick = (b) => b && { slug: b.slug, title: b.title, question: b.question, appUrl: b.appUrl, pageUrl: b.pageUrl, color: b.color, no: b.no };
  const data = {};
  for (const l of laws) {
    const P = l.principle || {};
    data[l.slug] = {
      slug: l.slug, type: lawType(l), no: l.no, name: P.name || l.title, formula: P.formula || '', formulaNote: P.formulaNote || '', idea: P.idea || l.hook,
      discovered: P.discovered || '', color: l.color, fieldLabel: l.fieldLabel, appUrl: l.appUrl, pageUrl: l.pageUrl, historyUrl: l.historyUrl,
      art: P.art ? artByName(P.art, 96) : '',
      still: l.media['still.jpg'] ? mediaUrl(l, 'still.jpg') : null,
      examples: (P.examples || []).map((e) => ({ title: e.title, text: e.text, box: pick(boxes.find((b) => b.slug === e.box)) })),
      seen: (P.appliesTo || []).map((s) => pick(boxes.find((b) => b.slug === s))).filter(Boolean),
    };
  }
  return `<script type="application/json" id="lawsData">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

const lawModal = () => `<dialog class="law-modal" id="lawModal" aria-labelledby="lawName">
  <form method="dialog" class="lm-close-form"><button class="lm-x" aria-label="Close">×</button></form>
  <div class="lm-body" id="lawBody"></div>
  <div class="lm-foot">
    <p>Would you like to see the full page, with the interactive model?</p>
    <div class="lm-actions"><a class="btn primary" id="lawOpen" href="#">Yes, open it</a><form method="dialog"><button class="btn">Not now</button></form></div>
  </div>
</dialog>`;

function lawsSection(laws, boxes, { full = false } = {}) {
  if (!laws.length) return '';
  const kinds = [...new Set(laws.map((l) => l.field))].map((f) => ({ f, n: laws.filter((l) => l.field === f).length, ...config.fields[f] }));
  return `<section class="cabinet laws-shelf" id="laws" aria-label="Laws and principles">
    <header class="cab-head">
      ${full ? '<h1 class="cab-h1">Laws &amp; <em>principles</em>.</h1>' : '<h2 class="cab-h1">Laws &amp; <em>principles</em>.</h2>'}
      <p class="cab-sub"><span>The rules behind every box: ${laws.length} so far, each with a model to play with and everyday examples.</span></p>
      ${full ? '' : `<a class="cab-all" href="/laws/">All laws and principles →</a>`}
      <div class="chips" role="group" aria-label="Filter laws">
        <button class="chip on" data-lfilter="all" aria-pressed="true">All <small>${laws.length}</small></button>
        ${kinds.map((x) => `<button class="chip" data-lfilter="${esc(x.f)}" style="--c:${esc(x.color)}" aria-pressed="false">${esc(x.label)} <small>${x.n}</small></button>`).join('')}
      </div>
    </header>
    <div class="cases law-cases" id="lawGrid">${laws.map((l, i) => lawTile(l, i, boxes)).join('')}</div>
  </section>`;
}

// On an object box's page: the laws you can see at work inside it.
function lawsAtWork(a, laws) {
  const here = laws.filter((l) => (l.principle?.appliesTo || []).includes(a.slug));
  if (!here.length) return '';
  return `<section class="ex-laws">
    <p class="eyebrow">Laws at work here</p>
    <div class="law-chips">${here.map((l) => `<a class="law-chip" href="${l.appUrl}" data-law="${esc(l.slug)}" style="--c:${esc(l.color)}"><b>${esc(l.principle?.name || l.title)}</b><span>${esc(l.principle?.formula || '')}</span></a>`).join('')}</div>
  </section>`;
}

// On a principle box's page: every everyday example, linked to its box where there is one.
function principleExamples(l, boxes) {
  const P = l.principle || {};
  if (!P.examples?.length) return '';
  return `<section class="ex-laws">
    <p class="eyebrow">Where you'll meet it</p>
    ${P.formula ? `<p class="law-big">${esc(P.formula)}</p>${P.formulaNote ? `<p class="law-note">${esc(P.formulaNote)}</p>` : ''}` : ''}
    <ul class="law-examples">${P.examples.map((e) => {
      const b = boxes.find((x) => x.slug === e.box);
      return `<li style="--c:${esc(b?.color || l.color)}"><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${b ? `<a href="${b.pageUrl}">See it in ${esc(b.title)} →</a>` : ''}</li>`;
    }).join('')}</ul>
  </section>`;
}

export function lawsPage(laws, boxes) {
  return `${head({ title: `Laws and principles · ${config.brand}`, description: 'Famous laws and principles of physics and chemistry, each with an interactive model and the everyday things where you can see it at work.', url: '/laws/', cls: 'home laws-page' })}
${nav()}
<main id="main">
  ${laws.length ? lawsSection(laws, boxes, { full: true }) : '<section class="cabinet"><h1 class="cab-h1">Laws &amp; <em>principles</em>.</h1><p class="cab-sub">The first ones are on their way.</p></section>'}
</main>
${lawsData(laws, boxes)}
${lawModal()}
${footer()}`;
}

// 365 days from the start date, one cell per day, lit where a box opened.
function calendar(apps) {
  const byDate = new Map(apps.map((a) => [a.date, a]));
  const start = config.startDate;
  const today = new Date().toISOString().slice(0, 10);
  const startDow = (new Date(start + 'T12:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<i class="pad"></i>');
  const months = [];
  let lastCol = -9;
  for (let d = 0; d < 365; d++) {
    const date = addDays(start, d);
    const col = Math.floor((d + startDow) / 7);
    if ((date.endsWith('-01') && col - lastCol >= 3) || d === 0) lastCol = col, months.push(`<span style="grid-column:${col + 1}">${fmtDate(date, { month: 'short' })}</span>`);
    const a = byDate.get(date);
    if (a) cells.push(`<a class="lit" href="${a.pageUrl}" style="--c:${esc(a.color)}" title="No. ${a.no} · ${esc(a.question)}" aria-label="${fmtDate(date)}: ${esc(a.question)}"></a>`);
    else cells.push(`<i class="${date < today ? 'past' : date === today ? 'today' : ''}" title="${fmtDate(date)}"></i>`);
  }
  return `<div class="cal"><div class="cal-months" aria-hidden="true">${months.join('')}</div><div class="cal-grid">${cells.join('')}</div></div>`;
}

export function allConcepts(apps) {
  return apps.flatMap((a) => a.concepts.map((c) => ({ ...c, id: slugify(c.term), box: a })))
    .sort((x, y) => x.term.localeCompare(y.term, 'en', { sensitivity: 'base' }));
}

// ---------------------------------------------------------------- home
export function home(apps, laws = []) {
  const today = apps[0];
  const fields = [...new Set(apps.map((a) => a.field))].map((f) => ({ f, n: apps.filter((a) => a.field === f).length, ...config.fields[f] }));
  const next = today ? today.box + 1 : 1;
  const nextDate = today ? addDays(today.date, 1) : config.startDate;
  const concepts = allConcepts(apps);
  const hints = concepts.slice(0, 5).map((c) => c.term);
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: config.brand, url: SITE + '/', description: config.pitch,
    potentialAction: { '@type': 'SearchAction', target: `${SITE}/?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };
  return `${head({ title: `${config.brand}: ${config.tagline}`, description: config.pitch, url: '/', cls: 'home', style: today ? `--c:${esc(today.color)}` : '',
    extra: `<script type="application/ld+json">${JSON.stringify(ld)}</script>` })}
${nav()}
<main id="main">
  <section class="cabinet" id="shelf" aria-label="Every box">
    <header class="cab-head">
        <h1 class="cab-h1">See inside how things <em>work</em>.</h1>
        <p class="cab-sub">${today ? `<span class="pulse"></span><span>Box No. ${today.no} is open · ` : '<span>'}a new glass box every day. Play, read, and see its history.</span></p>
        <label class="cab-search" data-open-search>${ICON.search}<input type="search" placeholder="Search boxes and ideas" aria-label="Search boxes and concepts" readonly><kbd>/</kbd></label>
        <div class="chips" role="group" aria-label="Filter by field">
          <button class="chip on" data-filter="all" aria-pressed="true">All <small>${apps.length}</small></button>
          ${fields.map((x) => `<button class="chip" data-filter="${esc(x.f)}" style="--c:${esc(x.color)}" aria-pressed="false">${esc(x.label)} <small>${x.n}</small></button>`).join('')}
        </div>
    </header>
    <div class="cases" id="grid" style="--cols:${cabinetCols(apps.length)};--rows:${Math.max(2, Math.ceil((apps.length + 3) / cabinetCols(apps.length)))}"${cabinetCols(apps.length) > 5 ? ' data-dense' : ''}>
      ${apps.map((a, i) => caseTile(a, i, i === 0)).join('')}
      ${Array.from({ length: sealedCount(apps.length) }, (_, k) => sealedCase(addDays(nextDate, k), next + k, apps.length + k)).join('')}
    </div>
    <p class="empty" id="shelfEmpty" hidden>No box matches that yet. <a href="${SUGGEST}" rel="noopener" target="_blank">Suggest it as a future box →</a></p>
  </section>

  ${lawsSection(laws, apps)}

  <section class="manifesto" aria-label="Why Glassbox">
    <p class="m-line reveal">You use them every day.</p>
    <p class="m-line reveal">Most of them are <span class="blackbox">black boxes</span>.</p>
    <p class="m-line reveal">So every day, we open one.</p>
    <div class="pillars">
      <div class="pillar reveal"><span class="n">01 · Play</span><h3>Pull the levers</h3><p>An interactive model that runs in any browser. Change one thing and watch cause turn into effect.</p></div>
      <div class="pillar reveal"><span class="n">02 · Understand</span><h3>A minute of plain words</h3><p>The idea in six short beats, plus a 40-second video. No jargon you won't get a definition for.</p></div>
      <div class="pillar reveal"><span class="n">03 · Fork</span><h3>Nothing hidden</h3><p>Every box is its own public repo, MIT licensed. Read how it's built, remix it, teach with it.</p></div>
    </div>
  </section>

  ${concepts.length ? `
  <section class="concepts-band">
    <div class="sec-head"><div><p class="eyebrow">Words worth knowing</p><h2>Concepts, A to Z</h2></div><a class="btn" href="/concepts/">See all ${concepts.length}</a></div>
    <div class="term-cloud">${concepts.slice(0, 48).map((c) => `<a href="/concepts/#${c.id}" style="--c:${esc(c.box.color)}">${esc(c.term)}</a>`).join('')}</div>
  </section>` : ''}

  <section id="calendar" class="calendar">
    <div class="sec-head"><div><p class="eyebrow">${fmtDate(config.startDate)} → ${fmtDate(addDays(config.startDate, 364))}</p><h2>One box a day, for a year</h2></div><p class="legend"><span><i class="lit"></i> opened</span><span><i></i> sealed</span></p></div>
    ${calendar(apps)}
  </section>

  <section class="promise">
    <div class="promise-head"><p class="eyebrow">Our promise</p><h2>A glass box has<br><em>nothing to hide</em>.</h2><p class="lede">Not in how things work, not in our code, and not in what we measure. We count visits with Google Analytics and filter out bots with ClickTrust, and we tell you exactly what that means.</p></div>
    <ul class="promise-list">
      <li><b>No accounts</b><span>Nothing to sign up for, ever.</span></li>
      <li><b>No ads, nothing sold</b><span>Your visit is never sold or used for advertising.</span></li>
      <li><b>Two analytics tools, named</b><span>Google Analytics for visits, ClickTrust for bots. Nothing else.</span></li>
      <li><b>Privacy signals respected</b><span>Send Global Privacy Control or Do Not Track and Google Analytics stays off.</span></li>
      <li><b>Open source</b><span>Every box's code is public under ${esc(config.licenses.code)}.</span></li>
      <li><b>Free to reuse</b><span>Explanations, images and videos under ${esc(config.licenses.content)}.</span></li>
    </ul>
    <p class="promise-foot"><a class="btn" href="/privacy/">Read the privacy policy</a> <a class="btn ghost" href="/terms/">Terms</a></p>
  </section>

  <section class="follow">
    <p class="eyebrow">Tomorrow: box No. ${String(next).padStart(3, '0')}</p>
    <h2>Get a new box every day.</h2>
    <p class="lede">A short video every evening where you already scroll. The full, playable box is always here.</p>
    <div class="ctas center">
      ${H.youtube ? `<a class="btn primary big" href="https://youtube.com/${esc(H.youtube)}" rel="noopener" target="_blank">Subscribe on YouTube</a>` : ''}
      ${H.instagram ? `<a class="btn big" href="https://instagram.com/${esc(H.instagram)}" rel="noopener" target="_blank">Follow on Instagram</a>` : ''}
      <a class="btn big" href="/feed.xml">RSS</a>
    </div>
  </section>
</main>
${laws.length ? lawsData(laws, apps) + lawModal() : ''}
${footer()}`;
}

// ---------------------------------------------------------------- explainer
export function explainer(a, apps, { laws = [], apps: boxes = apps } = {}) {
  const i = apps.findIndex((x) => x.slug === a.slug);
  const newer = apps[i - 1], older = apps[i + 1];
  const related = apps.filter((x) => x.field === a.field && x.slug !== a.slug).slice(0, 3);
  const url = a.pageUrl;
  const img = a.media['cover.jpg'] ? mediaUrl(a, 'cover.jpg') : null;
  const hasReel = a.media['reel.mp4'];
  const ld = {
    '@context': 'https://schema.org', '@type': 'LearningResource', name: a.question, headline: a.title,
    description: a.hook, url: SITE + url, datePublished: a.date, learningResourceType: 'Interactive simulation',
    isAccessibleForFree: true, license: 'https://creativecommons.org/licenses/by/4.0/', keywords: a.tags.join(', '),
    ...(img ? { image: SITE + img } : {}), publisher: { '@type': 'Organization', name: config.brand, url: SITE },
    ...(a.media['reel.mp4'] ? { video: { '@type': 'VideoObject', name: a.question, description: a.hook, contentUrl: SITE + mediaUrl(a, 'reel.mp4'), thumbnailUrl: SITE + (img || '/assets/og.png'), uploadDate: a.date } } : {}),
  };
  const yt = a.links.youtube ? a.links.youtube.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] : null;
  return `${head({ title: `${a.question} · ${config.brand} No. ${a.no}`, description: a.hook, url, image: img, type: 'article', cls: 'explainer', style: `--c:${esc(a.color)}`,
    extra: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` })}
${nav()}
<main id="main" data-prev="${older ? older.pageUrl : ''}" data-next="${newer ? newer.pageUrl : ''}">
  <section class="ex-hero">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">${esc(config.brand)}</a><span>/</span>${a.kind === 'principle' ? '<a href="/laws/">Laws &amp; principles</a>' : `<a href="/?f=${esc(a.field)}#shelf">${esc(a.fieldLabel)}</a>`}<span>/</span><span class="no" aria-current="page">No. ${a.no}</span></nav>
    <h1>${esc(a.question)}</h1>
    <p class="lede">${esc(a.hook)}</p>
    <div class="ctas">
      <a class="btn primary big" href="${a.appUrl}">${ICON.play} Open the box</a>
      <a class="btn big" href="${esc(a.repo)}" rel="noopener" target="_blank">Read the source</a>
      <button class="btn big" data-share data-title="${esc(a.question)}" data-url="${SITE}${url}">Share</button>
    </div>
    <p class="facts"><span>${esc(a.title)}</span><span>Opened ${fmtDate(a.date)}</span>${a.minutes ? `<span>${a.minutes} min to play</span>` : ''}<span>Free · no sign-up</span></p>
  </section>

  <section class="ex-body">
    <div class="ex-media">
      ${hasReel
        ? `<video class="reel" src="${mediaUrl(a, 'reel.mp4')}" ${poster(a)} controls playsinline muted loop preload="none" aria-label="40-second video: ${esc(a.question)}"></video>
           <button class="btn ghost try-inline" data-src="${a.appUrl}">Or play with it right here</button>`
        : `<div class="try" data-src="${a.appUrl}">${art(a)}<button class="btn primary">Play with it right here</button></div>`}
    </div>
    <div class="ex-text">
      <p class="eyebrow">In 60 seconds</p>
      <ol class="beats">
        ${a.explainer.map((b) => `<li><h2>${esc(b.title)}</h2><p>${esc(b.text)}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  ${a.kind === 'principle' ? principleExamples(a, boxes) : lawsAtWork(a, laws)}

  ${historyTeaser(a)}

  ${yt ? `<section class="ex-yt"><p class="eyebrow">The video</p><div class="yt" data-yt="${yt}" ${a.media['thumb.jpg'] ? `style="background-image:url(${mediaUrl(a, 'thumb.jpg')})"` : ''}><button class="btn primary big">${ICON.play} Play on YouTube</button><p class="yt-note">Loads a YouTube player (youtube-nocookie.com) only when you press play.</p></div></section>` : ''}

  ${a.concepts.length ? `<section class="ex-concepts" id="concepts">
    <p class="eyebrow">Words worth knowing</p>
    <dl class="concepts">${a.concepts.map((c) => `<div id="c-${slugify(c.term)}"><dt>${esc(c.term)}</dt><dd>${esc(c.def)}</dd></div>`).join('')}</dl>
  </section>` : ''}

  <section class="ex-fork">
    <div>
      <h2>Fork it. Teach with it.</h2>
      <p>This box is plain HTML, CSS and JavaScript, with no build step and no accounts. Run it yourself and it sends nothing anywhere. The code is ${esc(config.licenses.code)}. The words, images and videos are ${esc(config.licenses.content)}, so you can reuse them anywhere if you credit <b>“${esc(config.brand)}, ${esc(config.domain)}/e/${esc(a.slug)}”</b>.</p>
    </div>
    <div>
      <pre class="cmd"><code>git clone ${esc(a.repo)}.git</code><button class="copy" data-copy="git clone ${esc(a.repo)}.git">Copy</button></pre>
      ${a.credits.length ? `<p class="credits">Built with ${a.credits.map((c) => `<a href="${esc(c.url)}" rel="noopener" target="_blank">${esc(c.name)}</a> (${esc(c.license)})`).join(', ')}.</p>` : ''}
    </div>
  </section>

  ${related.length ? `<section class="related"><p class="eyebrow">More in ${esc(a.fieldLabel)}</p><div class="grid">${related.map(card).join('')}</div></section>` : ''}

  <nav class="ex-nav" aria-label="Other boxes">
    ${older ? `<a href="${older.pageUrl}" class="prev"><small>← No. ${older.no}</small><span>${esc(older.question)}</span></a>` : `<a href="/#shelf" class="prev"><small>←</small><span>Back to the shelf</span></a>`}
    ${newer ? `<a href="${newer.pageUrl}" class="next"><small>No. ${newer.no} →</small><span>${esc(newer.question)}</span></a>` : `<a href="/#calendar" class="next"><small>Tomorrow →</small><span>No. ${String(a.box + 1).padStart(3, '0')} opens ${fmtDate(addDays(a.date, 1), { day: 'numeric', month: 'short' })}</span></a>`}
  </nav>
  <p class="kbd-hint"><kbd>←</kbd><kbd>→</kbd> previous / next box · <kbd>/</kbd> search</p>
</main>
${laws.length ? lawsData(laws, boxes) + lawModal() : ''}
${footer()}`;
}

// ---------------------------------------------------------------- concepts A–Z
export function conceptsPage(apps) {
  const all = allConcepts(apps);
  const groups = new Map();
  for (const c of all) {
    const L = /[a-z]/i.test(c.term[0]) ? c.term[0].toUpperCase() : '#';
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(c);
  }
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  return `${head({ title: `Concepts A–Z · ${config.brand}`, description: `Every term explained across Glassbox's interactive explainers, with a link to the box where you can play with it.`, url: '/concepts/', cls: 'page' })}
${nav()}
<main id="main" class="doc wide">
  <p class="eyebrow">${all.length} concepts from ${apps.length} ${apps.length === 1 ? 'box' : 'boxes'}</p>
  <h1>Concepts, A to Z</h1>
  <p class="lede">Every term we define, in one place. Each one links to the box where you can see it working.</p>
  <label class="filter-search big">${ICON.search}<input type="search" id="conceptSearch" placeholder="Filter concepts" aria-label="Filter concepts"></label>
  <nav class="az" aria-label="Jump to letter">${letters.map((L) => groups.has(L) ? `<a href="#l-${L}">${L}</a>` : `<span>${L}</span>`).join('')}</nav>
  ${[...groups].map(([L, cs]) => `<section class="az-group" id="l-${L}"><h2>${L}</h2><dl>${cs.map((c) => `
    <div class="concept" id="${c.id}" data-hay="${esc((c.term + ' ' + c.def + ' ' + c.box.question).toLowerCase())}" style="--c:${esc(c.box.color)}">
      <dt>${esc(c.term)}</dt><dd>${esc(c.def)}<a href="${c.box.pageUrl}#c-${c.id}">See it in No. ${c.box.no}: ${esc(c.box.question)} →</a></dd>
    </div>`).join('')}</dl></section>`).join('')}
  <p class="empty" id="conceptEmpty" hidden>Nothing matches yet. <a href="${SUGGEST}" rel="noopener" target="_blank">Suggest a box about it →</a></p>
</main>
${footer()}`;
}

export function notFound() {
  return `${head({ title: `Not found · ${config.brand}`, description: config.pitch, url: '/404.html', cls: 'nf' })}${nav()}<main id="main" class="nf-main"><p class="eyebrow">404</p><h1>This box is empty.</h1><p class="lede">The page you're after isn't here. Maybe that box hasn't been opened yet.</p><div class="ctas center"><a class="btn primary" href="/">Back to the shelf</a><button class="btn" data-open-search>Search</button></div></main>${footer()}`;
}

export function feed(apps) {
  const items = apps.map((a) => `<item><title>${esc(`No. ${a.no}: ${a.question}`)}</title><link>${SITE}${a.pageUrl}</link><guid>${SITE}${a.pageUrl}</guid><pubDate>${new Date(a.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(a.hook)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(config.brand)}</title><link>${SITE}/</link><description>${esc(config.pitch)}</description>${items}</channel></rss>`;
}

export function sitemap(apps) {
  const urls = ['/', '/concepts/', '/history/', '/privacy/', '/terms/', ...apps.flatMap((a) => [a.pageUrl, a.appUrl, ...(a.historyUrl ? [a.historyUrl] : [])])];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join('')}</urlset>`;
}

// Public index for search, the bar and the studio. Media flags let the studio skip missing files.
export function appsJson(apps) {
  return JSON.stringify({
    brand: config.brand, domain: config.domain, site: SITE, org: config.org, hubRepo: config.hubRepo, handles: config.handles, hashtags: config.hashtags, post: config.post,
    // History is summarised here; the full text lives on each history page.
    apps: apps.map(({ dir, history, ...a }) => ({ ...a, history: history ? { title: history.title, tagline: history.tagline, events: history.events.length } : null })),
  }, null, 2);
}
