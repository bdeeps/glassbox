// Renders every hub page to static HTML strings. Pages are generated (not
// client-rendered) so each one carries its own share-card meta tags.
import { config, SITE, esc } from './apps.mjs';

const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap';
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mediaUrl = (a, f) => `/${a.slug}/glassbox/${f}`;
const coverOf = (a) => (a.media['cover.jpg'] ? mediaUrl(a, 'cover.jpg') : null);

export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 56 18v28L32 59 8 46V18Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 18l24 13 24-13M32 31v28" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".45"/><circle cx="32" cy="31" r="7" fill="var(--glow, #8ef0ff)"/></svg>`;

function head({ title, description, url, image, type = 'website', extra = '' }) {
  const img = image ? (image.startsWith('http') ? image : SITE + image) : `${SITE}/assets/og.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#07080c">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(config.brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${config.handles.x ? `<meta name="twitter:site" content="@${esc(config.handles.x)}">` : ''}
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.brand)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/site.css">
${extra}
</head>`;
}

function nav(active = '') {
  const h = config.handles;
  return `<header class="nav">
  <a class="brand" href="/" aria-label="${esc(config.brand)} home">${LOGO}<span>${esc(config.brand)}</span></a>
  <nav>
    <a href="/#shelf" class="${active === 'shelf' ? 'on' : ''}">The shelf</a>
    <a href="/#how">How it works</a>
    ${h.youtube ? `<a class="ext" href="https://youtube.com/${esc(h.youtube)}" rel="noopener" target="_blank">YouTube</a>` : ''}
    ${h.instagram ? `<a class="ext" href="https://instagram.com/${esc(h.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}
    <a class="ext gh" href="https://github.com/${esc(config.org)}" rel="noopener" target="_blank">GitHub</a>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="foot">
  <div class="brand">${LOGO}<span>${esc(config.brand)}</span></div>
  <p>${esc(config.pitch)} Every box is its own MIT-licensed repo.</p>
  <p class="small"><a href="/feed.xml">RSS</a> · <a href="https://github.com/${esc(config.org)}">github.com/${esc(config.org)}</a> · <a href="/studio/">Studio</a></p>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function art(a, cls = '') {
  const c = coverOf(a);
  return c
    ? `<img class="art ${cls}" src="${c}" alt="" loading="lazy" decoding="async" width="1200" height="630">`
    : `<div class="art fallback ${cls}" aria-hidden="true"><span>${a.no}</span></div>`;
}

function card(a) {
  return `<a class="card" href="${a.pageUrl}" style="--c:${esc(a.color)}" data-field="${esc(a.field)}">
    <div class="card-art">${art(a)}</div>
    <div class="card-body">
      <div class="meta"><span class="no">No. ${a.no}</span><span class="dot"></span><span>${esc(a.fieldLabel)}</span></div>
      <h3>${esc(a.question)}</h3>
      <p>${esc(a.title)} · ${fmtDate(a.date)}</p>
    </div>
  </a>`;
}

function sealed(date, n) {
  return `<div class="card sealed" aria-label="Box ${n} opens ${fmtDate(date)}">
    <div class="card-art"><div class="art fallback"><span>${String(n).padStart(3, '0')}</span></div></div>
    <div class="card-body"><div class="meta"><span class="no">No. ${String(n).padStart(3, '0')}</span><span class="dot"></span><span>Sealed</span></div>
    <h3>Opens ${fmtDate(date)}</h3><p>Follow along to see what's inside.</p></div>
  </div>`;
}

export function home(apps) {
  const today = apps[0];
  const fieldsUsed = [...new Set(apps.map((a) => a.field))];
  const next = today ? today.box + 1 : 1;
  const nextDate = today ? addDays(today.date, 1) : config.startDate;
  const dayNum = today ? today.box : 0;
  const cube = today ? `
    <a class="cube-wrap" href="${today.pageUrl}" style="--c:${esc(today.color)}" aria-label="Open box ${today.no}: ${esc(today.question)}">
      <div class="cube" aria-hidden="true">
        <i class="f front"></i><i class="f back"></i><i class="f left"></i><i class="f right"></i><i class="f top"></i><i class="f bottom"></i>
        <div class="core">${art(today, 'core-art')}</div>
      </div>
      <div class="cube-label"><span class="no">No. ${today.no} · today</span><strong>${esc(today.question)}</strong></div>
    </a>` : '';
  return `${head({ title: `${config.brand}: ${config.tagline}`, description: config.pitch, url: '/' })}
<body class="home">
${nav('shelf')}
<main>
  <section class="hero">
    <div class="hero-text">
      <p class="kicker"><span class="pulse"></span>${today ? `Box ${today.no} opened ${fmtDate(today.date)}` : 'Box 001 opens soon'}</p>
      <h1>See inside<br>how things <em>work</em>.</h1>
      <p class="lede">${esc(config.pitch)}</p>
      <div class="ctas">
        ${today ? `<a class="btn primary" href="${today.pageUrl}">Open today's box</a>` : ''}
        <a class="btn" href="#shelf">Browse the shelf</a>
      </div>
      <div class="year" aria-label="${dayNum} of 365 boxes opened">
        <div class="year-grid">${Array.from({ length: 365 }, (_, i) => `<i${i < dayNum ? ' class="lit"' : ''}></i>`).join('')}</div>
        <span><b>${dayNum}</b> / 365 boxes opened</span>
      </div>
    </div>
    ${cube}
  </section>

  <section id="shelf" class="shelf">
    <div class="sec-head">
      <h2>The shelf</h2>
      <div class="chips" role="group" aria-label="Filter by field">
        <button class="chip on" data-filter="all">All</button>
        ${fieldsUsed.map((f) => `<button class="chip" data-filter="${esc(f)}" style="--c:${esc(config.fields[f].color)}">${esc(config.fields[f].label)}</button>`).join('')}
      </div>
    </div>
    <div class="grid">
      ${apps.map(card).join('')}
      ${[0, 1, 2].map((k) => sealed(addDays(nextDate, k), next + k)).join('')}
    </div>
  </section>

  <section id="how" class="how">
    <h2>Every box, three ways in</h2>
    <div class="steps">
      <div class="step"><span class="n">01</span><h3>Play</h3><p>An interactive model that runs in any browser. Pull the levers and watch cause turn into effect.</p></div>
      <div class="step"><span class="n">02</span><h3>Understand</h3><p>A 60-second explainer, plus a short video for YouTube and Instagram. The idea, without the jargon.</p></div>
      <div class="step"><span class="n">03</span><h3>Fork</h3><p>Every box is a public repo under the MIT licence. Read how it's built, remix it, teach with it.</p></div>
    </div>
  </section>

  <section class="follow">
    <h2>One new box, every day.</h2>
    <p>Get the daily short where you already scroll.</p>
    <div class="ctas">
      ${config.handles.youtube ? `<a class="btn primary" href="https://youtube.com/${esc(config.handles.youtube)}" rel="noopener" target="_blank">Subscribe on YouTube</a>` : ''}
      ${config.handles.instagram ? `<a class="btn" href="https://instagram.com/${esc(config.handles.instagram)}" rel="noopener" target="_blank">Follow on Instagram</a>` : ''}
      <a class="btn" href="/feed.xml">RSS</a>
    </div>
  </section>
</main>
${footer()}`;
}

export function explainer(a, apps) {
  const i = apps.findIndex((x) => x.slug === a.slug);
  const newer = apps[i - 1], older = apps[i + 1];
  const url = a.pageUrl;
  const img = a.media['cover.jpg'] ? mediaUrl(a, 'cover.jpg') : null;
  const hasReel = a.media['reel.mp4'];
  const ld = {
    '@context': 'https://schema.org', '@type': 'LearningResource', name: a.question, headline: a.title,
    description: a.hook, url: SITE + url, datePublished: a.date, learningResourceType: 'Interactive simulation',
    isAccessibleForFree: true, license: 'https://opensource.org/licenses/MIT', keywords: a.tags.join(', '),
    ...(img ? { image: SITE + img } : {}), publisher: { '@type': 'Organization', name: config.brand, url: SITE },
  };
  const yt = a.links.youtube ? a.links.youtube.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] : null;
  return `${head({ title: `${a.question} · ${config.brand} No. ${a.no}`, description: a.hook, url, image: img, type: 'article',
    extra: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` })}
<body class="explainer" style="--c:${esc(a.color)}">
${nav()}
<main>
  <section class="ex-hero">
    <p class="crumbs"><a href="/">${esc(config.brand)}</a><span>/</span><span class="no">No. ${a.no}</span><span>/</span><a href="/#shelf" data-field-link="${esc(a.field)}">${esc(a.fieldLabel)}</a></p>
    <h1>${esc(a.question)}</h1>
    <p class="lede">${esc(a.hook)}</p>
    <div class="ctas">
      <a class="btn primary big" href="${a.appUrl}">Open the box <span aria-hidden="true">↗</span></a>
      <a class="btn" href="${esc(a.repo)}" rel="noopener" target="_blank">Read the source</a>
      <button class="btn share" data-share data-title="${esc(a.question)}" data-url="${SITE}${url}">Share</button>
    </div>
    <p class="facts"><span>${esc(a.title)}</span><span>${fmtDate(a.date)}</span>${a.minutes ? `<span>${a.minutes} min to play</span>` : ''}<span>MIT licence</span></p>
  </section>

  <section class="ex-body">
    <div class="ex-media">
      ${hasReel
        ? `<video class="reel" src="${mediaUrl(a, 'reel.mp4')}" ${img ? `poster="${img}"` : ''} controls playsinline muted loop preload="none"></video>`
        : `<div class="try" data-src="${a.appUrl}">${art(a)}<button class="btn primary">Try it right here</button></div>`}
      ${hasReel ? `<button class="btn ghost try-inline" data-src="${a.appUrl}">Or try it right here</button>` : ''}
    </div>
    <div class="ex-text">
      <h2>In 60 seconds</h2>
      <ol class="beats">
        ${a.explainer.map((b) => `<li><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  ${yt ? `<section class="ex-yt"><div class="yt" data-yt="${yt}"><button class="btn primary">Play the video</button></div></section>` : ''}

  ${a.concepts.length ? `<section class="ex-concepts">
    <h2>Words worth knowing</h2>
    <dl class="concepts">${a.concepts.map((c) => `<div><dt>${esc(c.term)}</dt><dd>${esc(c.def)}</dd></div>`).join('')}</dl>
  </section>` : ''}

  <section class="ex-fork">
    <div>
      <h2>Fork it</h2>
      <p>This box is a plain HTML5 app. No build step, no accounts, no tracking. Clone it and open it in a browser.</p>
    </div>
    <pre class="cmd"><code>git clone ${esc(a.repo)}.git</code><button class="copy" data-copy="git clone ${esc(a.repo)}.git">Copy</button></pre>
  </section>

  <nav class="ex-nav">
    ${older ? `<a href="${older.pageUrl}" class="prev"><small>← No. ${older.no}</small><span>${esc(older.question)}</span></a>` : '<span></span>'}
    ${newer ? `<a href="${newer.pageUrl}" class="next"><small>No. ${newer.no} →</small><span>${esc(newer.question)}</span></a>` : '<span></span>'}
  </nav>
</main>
${footer()}`;
}

export function notFound() {
  return `${head({ title: `Not found · ${config.brand}`, description: config.pitch, url: '/404.html' })}
<body class="nf">${nav()}<main class="nf-main"><h1>This box is empty.</h1><p class="lede">The page you're after isn't here. Maybe it hasn't been opened yet.</p><a class="btn primary" href="/">Back to the shelf</a></main>${footer()}`;
}

export function feed(apps) {
  const items = apps.map((a) => `<item><title>${esc(`No. ${a.no}: ${a.question}`)}</title><link>${SITE}${a.pageUrl}</link><guid>${SITE}${a.pageUrl}</guid><pubDate>${new Date(a.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(a.hook)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(config.brand)}</title><link>${SITE}/</link><description>${esc(config.pitch)}</description>${items}</channel></rss>`;
}

export function sitemap(apps) {
  const urls = ['/', ...apps.flatMap((a) => [a.pageUrl, a.appUrl])];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join('')}</urlset>`;
}

// Public index the bar, studio and anyone else can read.
export function appsJson(apps) {
  return JSON.stringify({
    brand: config.brand, domain: config.domain, org: config.org, handles: config.handles, hashtags: config.hashtags, post: config.post,
    apps: apps.map(({ dir, ...a }) => a),
  }, null, 2);
}
