// The history framework: every box can ship a history.json (eras, events, people,
// firsts, number series, facts, sources). This renders it as a visual story:
// a scrubbable strip of moments, era chapters, an alternating timeline with
// line-art illustrations, log-scale charts, people, places and sources.
// It also builds the combined /history/ page across all boxes.
import { config, SITE, esc } from './apps.mjs';
import { head, nav, footer, fmtDate } from './render.mjs';
import { art } from '../../site/assets/art.js';

export const yearLabel = (y) => (y < 0 ? `${-y} BCE` : String(y));
const mediaUrl = (a, f) => `/${a.slug}/glassbox/${f}`;
const eraOf = (h, id) => h.eras.find((e) => e.id === id) || { id, name: id, color: '#8ef0ff', from: 0, to: 0 };
const countryCount = (h) => new Set(h.events.map((e) => e.country).filter(Boolean)).size;
const spanYears = (h) => { const ys = h.events.map((e) => e.year); return Math.max(...ys) - Math.min(...ys); };
const roundSpan = (n) => (n >= 1000 ? `${(Math.floor(n / 100) * 100).toLocaleString('en')}+` : String(n));

// Events in reading order: era by era (eras are chapters and may overlap in time), then by year.
export function ordered(h) {
  const rank = new Map([...h.eras].sort((x, y) => x.from - y.from).map((e, i) => [e.id, i]));
  return h.events.map((e, i) => ({ ...e, i })).sort((x, y) => (rank.get(x.era) ?? 99) - (rank.get(y.era) ?? 99) || x.year - y.year);
}

// ---------------------------------------------------------------- pieces
function strip(events, h, idFor) {
  return `<div class="h-strip" data-strip>
    <div class="h-now"><span class="h-now-year" data-now-year>${esc(events[0].date)}</span><span class="h-now-era" data-now-era>${esc(eraOf(h, events[0].era).name)}</span></div>
    <nav class="h-dots" aria-label="Jump to a moment">${events.map((e) => `<a href="#${idFor(e)}" class="h-dot${e.key ? ' key' : ''}" style="--c:${esc(eraOf(h, e.era).color)}" data-year="${esc(e.date)}" data-era="${esc(eraOf(h, e.era).name)}" title="${esc(`${e.date}: ${e.title}`)}"><span class="sr">${esc(`${e.date}: ${e.title}`)}</span></a>`).join('')}</nav>
  </div>`;
}

function sourceRefs(e, prefix = 'src') {
  return (e.sources || []).map((n) => `<a class="ref" href="#${prefix}-${n + 1}" aria-label="Source ${n + 1}">${n + 1}</a>`).join('');
}

function eventCard(e, a, h, { id, side, showBox = false } = {}) {
  const era = eraOf(h, e.era);
  return `<article class="h-event${e.key ? ' key' : ''} ${side || ''} reveal" id="${id}" style="--c:${esc(era.color)}" data-year="${esc(e.date)}" data-era="${esc(era.name)}">
    <div class="h-pin" aria-hidden="true"></div>
    <div class="h-card">
      <div class="h-top">
        <div class="h-art">${art(e.art, e.key ? 72 : 56)}</div>
        <div><p class="h-year">${esc(yearLabel(e.year))}</p><p class="h-date">${e.date !== String(e.year) ? esc(e.date) : ''}${showBox ? ` · <a href="${a.historyUrl}">No. ${a.no} ${esc(a.title)}</a>` : ''}</p></div>
      </div>
      <h3>${esc(e.title)}</h3>
      <p class="h-meta">${e.who ? `<span>${esc(e.who)}</span>` : ''}${e.where ? `<span>${esc(e.where)}</span>` : ''}</p>
      <p>${esc(e.text)}</p>
      ${e.why ? `<p class="h-why"><b>Why it mattered.</b> ${esc(e.why)}</p>` : ''}
      <p class="h-links">${e.box ? `<a href="${a.appUrl}#${esc(e.box)}">See it working in ${esc(a.title)} →</a>` : ''}${showBox ? '' : `<span class="refs">${sourceRefs(e)}</span>`}</p>
    </div>
  </article>`;
}

// Log-scale line chart as a static SVG, readable without JavaScript.
function chart(s, color) {
  const W = 800, H = 380, L = 70, R = 30, T = 30, B = 50;
  const pts = [...s.points].sort((x, y) => x.year - y.year);
  const xs = pts.map((p) => p.year), vs = pts.map((p) => p.value);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lg = (v) => (s.log ? Math.log10(v) : v);
  // Human-friendly ticks: time uses day / hour / minute / second steps.
  const HUMAN = s.unit === 'seconds'
    ? [[86400, '1 day'], [3600, '1 hour'], [60, '1 min'], [1, '1 s'], [0.1, '1/10 s'], [0.01, '1/100 s'], [0.001, '1/1,000 s'], [0.0001, '1/10,000 s'], [0.00001, '1/100,000 s']]
    : [];
  const lo = Math.min(...vs), hi = Math.max(...vs);
  let ticks;
  if (HUMAN.length) {
    const below = HUMAN.filter(([v]) => v <= lo).sort((a, b) => b[0] - a[0])[0] || HUMAN[HUMAN.length - 1];
    const above = HUMAN.filter(([v]) => v >= hi).sort((a, b) => a[0] - b[0])[0] || HUMAN[0];
    ticks = HUMAN.filter(([v]) => v >= below[0] && v <= above[0]);
  } else {
    ticks = [];
    for (let k = Math.floor(lg(lo)); k <= Math.ceil(lg(hi)); k++) ticks.push([10 ** k, `${(10 ** k).toLocaleString('en', { maximumFractionDigits: 4 })}${s.unit === 'megapixels' ? ' MP' : ''}`]);
  }
  const y0 = lg(Math.min(...ticks.map((t) => t[0]))), y1 = lg(Math.max(...ticks.map((t) => t[0])));
  const X = (x) => L + ((x - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (lg(v) - y0) / Math.max(1e-9, y1 - y0)) * (H - T - B);
  // Label a point only if it isn't crowded by the last labelled one; the list below has them all.
  let lastX = -1e9;
  const showLabel = pts.map((p) => { const x = X(p.year); const ok = x - lastX > 44; if (ok) lastX = x; return ok; });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.year).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const decades = [];
  const step = x1 - x0 > 150 ? 50 : x1 - x0 > 60 ? 10 : 5;
  for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) decades.push(y);
  return `<figure class="h-chart reveal" id="chart-${esc(s.id)}" style="--c:${esc(color)}">
    <figcaption><p class="eyebrow">By the numbers</p><h3>${esc(s.title)}</h3><p>${esc(s.caption || '')}</p></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.title)}. ${pts.map((p) => `${p.year}: ${p.label}`).join('; ')}">
      ${ticks.map(([t, label]) => `<g class="tick"><line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text x="${L - 10}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(label)}</text></g>`).join('')}
      ${decades.map((d) => `<text class="xl" x="${X(d).toFixed(1)}" y="${H - 18}" text-anchor="middle">${d}</text>`).join('')}
      <path class="h-line" d="${line}" pathLength="1"/>
      ${pts.map((p, i) => `<g class="pt"><circle cx="${X(p.year).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="6"><title>${esc(`${p.year}: ${p.label}`)}</title></circle>${showLabel[i] ? `<text x="${X(p.year).toFixed(1)}" y="${(Y(p.value) + (i % 2 ? 22 : -14)).toFixed(1)}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(p.year)}</text>` : ''}</g>`).join('')}
    </svg>
    <ol class="h-chart-list">${pts.map((p) => `<li><b>${p.year}</b> ${esc(p.label)}</li>`).join('')}</ol>
  </figure>`;
}

function places(h, idFor) {
  const by = new Map();
  for (const e of ordered(h)) { if (!e.country) continue; if (!by.has(e.country)) by.set(e.country, []); by.get(e.country).push(e); }
  const rows = [...by].sort((x, y) => y[1].length - x[1].length);
  const max = rows[0]?.[1].length || 1;
  return `<section class="h-places reveal"><p class="eyebrow">Where it happened</p><h2>${rows.length} places, one idea</h2>
    <div class="h-place-list">${rows.map(([c, es]) => `<details class="h-place"><summary><span class="h-place-name">${esc(c)}</span><span class="h-bar"><i style="width:${(es.length / max) * 100}%"></i></span><span class="h-count">${es.length}</span></summary>
      <ul>${es.map((e) => `<li><a href="#${idFor(e)}"><b>${esc(yearLabel(e.year))}</b> ${esc(e.title)}</a></li>`).join('')}</ul></details>`).join('')}</div>
  </section>`;
}

// ---------------------------------------------------------------- a box's history page
export function historyPage(a, apps) {
  const h = a.history;
  const evs = ordered(h);
  const idFor = (e) => `m-${e.i + 1}`;
  const url = a.historyUrl;
  const img = a.media['cover.jpg'] ? mediaUrl(a, 'cover.jpg') : null;
  const eras = [...h.eras].sort((x, y) => x.from - y.from);
  const withHistory = apps.filter((x) => x.historyUrl);
  const hi = withHistory.findIndex((x) => x.slug === a.slug);
  const older = withHistory[hi + 1], newer = withHistory[hi - 1];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: h.title, description: h.tagline, url: SITE + url,
    datePublished: a.date, ...(img ? { image: SITE + img } : {}), publisher: { '@type': 'Organization', name: config.brand, url: SITE },
    citation: h.sources.map((s) => s.url), license: 'https://creativecommons.org/licenses/by/4.0/',
  };
  let body = '';
  for (const era of eras) {
    const list = evs.filter((e) => e.era === era.id);
    if (!list.length) continue;
    body += `<section class="h-era" id="era-${esc(era.id)}" style="--c:${esc(era.color)}">
      <header class="h-era-head reveal"><p class="h-era-range">${esc(yearLabel(era.from))} – ${era.to >= new Date().getFullYear() ? 'today' : esc(yearLabel(era.to))}</p><h2>${esc(era.name)}</h2><p>${esc(era.summary || '')}</p></header>
      <div class="h-line-wrap">${list.map((e, k) => eventCard(e, a, h, { id: idFor(e), side: k % 2 ? 'right' : 'left' })).join('')}</div>
    </section>`;
    for (const s of (h.series || []).filter((x) => x.after === era.id)) body += chart(s, era.color);
  }
  const loose = (h.series || []).filter((s) => !s.after || !eras.some((e) => e.id === s.after));
  return `${head({ title: `${h.title} · ${config.brand} No. ${a.no}`, description: h.tagline, url, image: img, type: 'article', cls: 'history-page', style: `--c:${esc(a.color)}`,
    extra: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` })}
${nav()}
<main id="main" class="h-main">
  <section class="h-hero">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">${esc(config.brand)}</a><span>/</span><a href="${a.pageUrl}">No. ${a.no} · ${esc(a.title)}</a><span>/</span><span class="no" aria-current="page">History</span></nav>
    <p class="eyebrow">The history</p>
    <h1>${esc(h.title)}</h1>
    <p class="h-tagline">${esc(h.tagline)}</p>
    <p class="lede">${esc(h.intro)}</p>
    <dl class="h-stats">
      <div><dt>${roundSpan(spanYears(h))}</dt><dd>years</dd></div>
      <div><dt>${h.events.length}</dt><dd>moments</dd></div>
      <div><dt>${(h.people || []).length}</dt><dd>people</dd></div>
      <div><dt>${countryCount(h)}</dt><dd>places</dd></div>
    </dl>
    <div class="ctas"><a class="btn primary big" href="#timeline">Start the story</a><a class="btn big" href="${a.appUrl}">Play with ${esc(a.title)}</a><a class="btn big ghost" href="${a.pageUrl}">How it works in 60 seconds</a></div>
  </section>

  ${(h.firsts || []).length ? `<section class="h-firsts">${h.firsts.map((f) => `<div class="h-first reveal"><p class="v">${esc(f.value)}</p><p class="l">${esc(f.label)}</p><p class="w">${esc(f.who)}</p></div>`).join('')}</section>` : ''}

  <div id="timeline" class="h-timeline-anchor"></div>
  ${strip(evs, h, idFor)}
  <nav class="h-eras" aria-label="Chapters">${eras.map((e) => `<a href="#era-${esc(e.id)}" style="--c:${esc(e.color)}"><span>${esc(yearLabel(e.from))}</span>${esc(e.name)}</a>`).join('')}</nav>

  ${body}
  ${loose.map((s) => chart(s, a.color)).join('')}

  ${(h.facts || []).length ? `<section class="h-facts"><p class="eyebrow">Did you know?</p><div class="h-fact-grid">${h.facts.map((f) => `<p class="h-fact reveal">${esc(f)}</p>`).join('')}</div></section>` : ''}

  ${(h.people || []).length ? `<section class="h-people"><p class="eyebrow">The people</p><h2>Who figured it out</h2><div class="h-people-grid">${h.people.map((p) => `<div class="h-person reveal"><span class="mono" aria-hidden="true">${esc(p.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join(''))}</span><div><h3>${esc(p.name)}</h3><p class="life">${esc(p.life)} · ${esc(p.role)} · ${esc(p.from)}</p><p>${esc(p.note)}</p></div></div>`).join('')}</div></section>` : ''}

  ${places(h, idFor)}

  <section class="h-sources" id="sources"><p class="eyebrow">Sources</p><h2>Where this comes from</h2>
    <p class="hint">Dates marked “c.” are approximate, and historians sometimes disagree about who was first. If you spot a mistake, <a href="https://github.com/${esc(config.org)}/${esc(a.slug)}/issues/new?title=${encodeURIComponent('History correction: ')}">tell us</a>.</p>
    <ol>${h.sources.map((s, i) => `<li id="src-${i + 1}"><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a> <span>${esc(s.publisher || '')}</span></li>`).join('')}</ol>
  </section>

  <section class="h-end">
    <h2>That's the history. <em>Now see how it works.</em></h2>
    <div class="ctas center"><a class="btn primary big" href="${a.appUrl}">Play with ${esc(a.title)}</a><a class="btn big" href="${a.pageUrl}">Read the 60-second explainer</a><a class="btn big ghost" href="/history/">All histories</a></div>
  </section>

  <nav class="ex-nav" aria-label="Other histories">
    ${older ? `<a href="${older.historyUrl}" class="prev"><small>← No. ${older.no}</small><span>${esc(older.history.title)}</span></a>` : '<a href="/history/" class="prev"><small>←</small><span>Every history, one timeline</span></a>'}
    ${newer ? `<a href="${newer.historyUrl}" class="next"><small>No. ${newer.no} →</small><span>${esc(newer.history.title)}</span></a>` : '<a href="/#shelf" class="next"><small>→</small><span>Back to the shelf</span></a>'}
  </nav>
</main>
${footer()}`;
}

// ---------------------------------------------------------------- teaser on the explainer page
export function historyTeaser(a) {
  const h = a.history;
  if (!h?.events?.length) return '';
  const idx = ordered(h);
  const keys = idx.filter((e) => e.key);
  const pick = (keys.length >= 5 ? keys : idx).filter((_, i, arr) => arr.length <= 6 || i % Math.ceil(arr.length / 6) === 0).slice(0, 6);
  return `<section class="h-teaser reveal">
    <div class="h-teaser-head"><div><p class="eyebrow">The history</p><h2>${esc(h.tagline)}</h2></div><a class="btn primary big" href="${a.historyUrl}">Read the full history</a></div>
    <ol class="h-teaser-row">${pick.map((e) => `<li style="--c:${esc(eraOf(h, e.era).color)}"><a href="${a.historyUrl}#m-${e.i + 1}">${art(e.art, 44)}<b>${esc(yearLabel(e.year))}</b><span>${esc(e.title)}</span></a></li>`).join('')}</ol>
  </section>`;
}

// ---------------------------------------------------------------- /history/ across every box
export function allHistory(apps) {
  const boxes = apps.filter((a) => a.historyUrl);
  const all = boxes.flatMap((a) => a.history.events.map((e, i) => ({ ...e, i, a })))
    .sort((x, y) => x.year - y.year);
  const years = all.map((e) => e.year);
  const span = all.length ? Math.max(...years) - Math.min(...years) : 0;
  const idFor = (e) => `${e.a.slug}-${e.i + 1}`;
  const centuries = new Map();
  for (const e of all) {
    const c = e.year < 0 ? 'Before the Common Era' : e.year < 1500 ? '1 – 1499' : e.year < 1800 ? '1500 – 1799' : e.year < 1900 ? 'The 1800s' : e.year < 1950 ? '1900 – 1949' : e.year < 2000 ? '1950 – 1999' : 'Since 2000';
    if (!centuries.has(c)) centuries.set(c, []);
    centuries.get(c).push(e);
  }
  return `${head({ title: `Every history, one timeline · ${config.brand}`, description: `The history behind every Glassbox explainer, merged into one timeline: ${all.length} moments over ${roundSpan(span)} years.`, url: '/history/', cls: 'history-page all' })}
${nav()}
<main id="main" class="h-main">
  <section class="h-hero">
    <p class="eyebrow">Every box has a past</p>
    <h1>One timeline for everything we've opened</h1>
    <p class="lede">Each box comes with the story of how people figured it out. Here they are, merged into one line through time, so you can see which ideas grew up together.</p>
    <dl class="h-stats"><div><dt>${roundSpan(span)}</dt><dd>years</dd></div><div><dt>${all.length}</dt><dd>moments</dd></div><div><dt>${boxes.length}</dt><dd>${boxes.length === 1 ? 'history' : 'histories'}</dd></div></dl>
    ${boxes.length > 1 ? `<div class="chips" role="group" aria-label="Show one box">${['<button class="chip on" data-hfilter="all">All</button>', ...boxes.map((b) => `<button class="chip" data-hfilter="${esc(b.slug)}" style="--c:${esc(b.color)}">No. ${b.no} ${esc(b.title)}</button>`)].join('')}</div>` : ''}
    <div class="h-box-list">${boxes.map((b) => `<a class="btn" href="${b.historyUrl}" style="--c:${esc(b.color)}">${esc(b.history.title)} →</a>`).join('')}</div>
  </section>
  ${all.length ? `<div class="h-strip" data-strip><div class="h-now"><span class="h-now-year" data-now-year>${esc(all[0].date)}</span><span class="h-now-era" data-now-era></span></div><nav class="h-dots">${all.map((e) => `<a href="#${idFor(e)}" class="h-dot${e.key ? ' key' : ''}" style="--c:${esc(e.a.color)}" data-year="${esc(e.date)}" data-era="${esc(e.a.title)}" title="${esc(`${e.date}: ${e.title}`)}"><span class="sr">${esc(e.title)}</span></a>`).join('')}</nav></div>` : ''}
  ${[...centuries].map(([c, es]) => `<section class="h-era" style="--c:var(--glow)"><header class="h-era-head reveal"><h2>${esc(c)}</h2></header><div class="h-line-wrap">${es.map((e, k) => `<div class="h-wrap" data-box="${esc(e.a.slug)}">${eventCard(e, e.a, e.a.history, { id: idFor(e), side: k % 2 ? 'right' : 'left', showBox: true })}</div>`).join('')}</div></section>`).join('')}
</main>
${footer()}`;
}

// Compact index for site search: every moment, with where to find it.
export function historyIndex(apps) {
  return JSON.stringify(apps.filter((a) => a.historyUrl).flatMap((a) => a.history.events.map((e, i) => ({
    t: e.title, d: e.date, y: e.year, w: e.who || '', p: e.where || '', u: `${a.historyUrl}#m-${i + 1}`, b: `No. ${a.no} ${a.title}`, c: a.color,
  }))));
}
