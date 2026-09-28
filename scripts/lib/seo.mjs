// Search and answer-engine plumbing: the short direct answer each box leads with,
// titles and descriptions sized for results pages, JSON-LD for every page type,
// the sitemap (with images and videos), robots.txt, llms.txt, and the head tags +
// crawlable summary injected into each box's own index.html.
// Everything here is computed from the manifests and the box files on disk; nothing
// adds a request to a page.
import fs from 'node:fs';
import path from 'node:path';
import { config, SITE, esc } from './apps.mjs';
import { extractChapters, plain } from './extract.mjs';
import { niceName } from './buffer.mjs';

export const BRAND = config.brand;
const mediaPath = (a, f) => `/${a.slug}/glassbox/${f}`;
const abs = (u) => (u.startsWith('http') ? u : SITE + u);
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

export const chaptersOf = (a) => (a.dir ? extractChapters(a.dir) : []);

// A box still carrying the starter template's text (the same test as scripts/check.mjs).
// Its pages say noindex and it stays out of the sitemap and llms.txt until it's written.
export const isDraft = (a) => /one or two sentences|say what is really going on/i.test(`${a.hook} ${JSON.stringify(a.explainer || [])}`);
export const robotsFor = (a) => (isDraft(a) ? 'noindex, follow' : undefined);

// ---------------------------------------------------------------- text sizing
// Splits at . ! ? followed by a space and a capital or digit; not inside 8.29, "C. V. Raman" or "e.g. this".
const sentences = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  .split(/(?<=[.!?…]["'’”)]*)(?<!\b[A-Z]\.)(?<!\b(?:e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|St|approx|c|ca|no|No|Fig)\.)\s+(?=[A-Z0-9"'‘“(])/)
  .map((x) => x.trim()).filter(Boolean);
const words = (s) => s.split(/\s+/).filter(Boolean).length;
// Hook sentences that invite you to play ("Take a 3D heart apart…") aren't part of the answer.
const INVITE = /^(Take|Play|Watch|Key|Film|Build|Pull|Try|Follow|Drag|See|Spin|Open|Explore|Tap|Turn|Grow|Race|Work|Learn|Zoom|Pick|Slide|Step|Mix|Set|Tune|Make|Fly|Drive|Launch|Load|Press|Switch|Break|Run|Crank|Peel|Cut|Shine|Split|Stack|Trace|Walk|Feel|Hear|Listen|Squeeze|Fire|Blow|Pour|Flip|Rotate|Dial|Push|Unfold|Lift|Throw|Fold|Tilt|Point|Shoot|Record|Plug|Wire|Draw|Paint|Scrub|Rewind|Freeze|Heat|Chop|Strip|Send|Sort|Fill|Stretch|Look|Meet|Hold|Drop|Light|Toss|Roll|Bend|Change|Compare|Play|Put|Steer|Shake|Crack|Tour|Get|Go|Find)\b|\bin 3D\b|\b3D\b|\binteractive\b/i;

function clipWords(s, max) {
  const w = s.split(/\s+/);
  return w.length <= max ? s : w.slice(0, max).join(' ').replace(/[,;:–—-]$/, '') + '…';
}
// Whole sentences until at least `min` words, never past `max`. `groups` are runs of
// sentences that read in order (the hook, then each beat); when a sentence would overflow,
// the rest of its group is skipped so no sentence appears without the one before it.
function fitWords(groups, min, max) {
  const out = [];
  let n = 0;
  for (const g of groups) {
    for (const s of g) {
      const w = words(s);
      if (!out.length && w > max) return clipWords(s, max);
      if (n + w > max) break;
      out.push(s); n += w;
      if (n >= min) return out.join(' ');
    }
  }
  return out.join(' ');
}
// Whole sentences up to `max` characters; clipped at a word if it's still short of `min`.
function fitChars(list, min, max) {
  let out = '';
  for (const s of [...new Set(list)]) {
    const next = out ? `${out} ${s}` : s;
    if (next.length <= max) { out = next; if (out.length >= min) break; continue; }
    if (out.length >= min) break;
    const room = next.slice(0, max - 1);
    out = room.slice(0, room.lastIndexOf(' ')).replace(/[,;:–—-]$/, '') + '…';
    break;
  }
  return out;
}

// The 40–60 word direct answer to the box's question that every page leads with.
const answers = new Map();
export function answerOf(a) {
  const key = `${a.slug}:${a.hook}:${a.date}`;
  if (answers.has(key)) return answers.get(key);
  let v;
  if (typeof a.answer === 'string' && a.answer.trim()) v = a.answer.trim();
  else {
    const P = a.principle || {};
    const beats = (a.explainer || []).map((b) => sentences(b.text));
    // A law leads with its formula ("Ohm's law: V = I × R (voltage = current × resistance…)."), then the idea.
    const formula = P.formula ? [`${P.name || a.title}: ${P.formula}${P.formulaNote && words(P.formulaNote) <= 14 ? ` (${P.formulaNote})` : ''}.`] : [];
    const lead = a.kind === 'principle' ? [...formula, ...sentences(P.idea || a.hook)] : sentences(a.hook).filter((s) => !INVITE.test(s));
    v = fitWords([lead, ...beats], 40, 60) || a.hook;
  }
  answers.set(key, v);
  return v;
}

// ~150–160 characters for the meta description: the hook first (it sells the click), then the answer.
export const describe = (a) => fitChars([...sentences(a.hook), ...sentences(answerOf(a))], 140, 160);
// The box's own page leads with what you can do in it, so its description differs from the explainer's.
export const describeApp = (a) => {
  const hs = sentences(a.hook);
  return fitChars([...hs.filter((x) => INVITE.test(x)), ...hs.filter((x) => !INVITE.test(x)), 'Free and open source, in your browser.'], 140, 160);
};
export const describeText = (s, extra = []) => fitChars([...sentences(s), ...extra.flatMap(sentences)], 140, 160);

// "<text> · Glassbox" when that fits in 60 characters, else the text alone.
export const titleFor = (text) => (`${text} · ${BRAND}`.length <= 60 ? `${text} · ${BRAND}` : text);

// ---------------------------------------------------------------- dates
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
// Last change to what the pages show: the manifest, history, chapters and cover.
export function updatedOf(a) {
  if (!a.dir) return a.date;
  const files = ['glassbox.json', 'history.json', 'glassbox/cover.jpg', 'glassbox/still.jpg'].map((f) => path.join(a.dir, f));
  try { const d = path.join(a.dir, 'js', 'chapters'); files.push(...fs.readdirSync(d).map((f) => path.join(d, f))); } catch { /* none */ }
  const m = Math.max(0, ...files.map(mtime));
  const u = m ? day(m) : a.date;
  const today = day(Date.now());
  const v = u > a.date ? u : a.date;
  return v > today ? today : v; // a box dated ahead (scheduled) never claims a future change
}
const newest = (list) => list.reduce((m, x) => (x > m ? x : m), config.startDate > day(Date.now()) ? day(Date.now()) : config.startDate);

// ---------------------------------------------------------------- media
export const imagesOf = (a) => ['cover.jpg', 'still.jpg'].filter((f) => a.media?.[f]).map((f) => abs(mediaPath(a, f)));
export const coverOf = (a) => imagesOf(a)[0] || null;

// Seconds, read from the mp4's movie header (moov/mvhd) without loading the whole file.
const durations = new Map();
function mp4Seconds(file) {
  const st = (() => { try { return fs.statSync(file); } catch { return null; } })();
  if (!st) return null;
  const k = `${file}:${st.size}:${st.mtimeMs}`;
  if (durations.has(k)) return durations.get(k);
  let secs = null, fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(16);
    for (let pos = 0; pos + 8 <= st.size;) {
      fs.readSync(fd, head, 0, 16, pos);
      let size = head.readUInt32BE(0), hdr = 8;
      const type = head.toString('latin1', 4, 8);
      if (size === 1) { size = Number(head.readBigUInt64BE(8)); hdr = 16; } else if (size === 0) size = st.size - pos;
      if (size < hdr) break;
      if (type === 'moov') {
        const body = Buffer.alloc(Math.min(size - hdr, 4e6));
        fs.readSync(fd, body, 0, body.length, pos + hdr);
        const at = body.indexOf('mvhd', 0, 'latin1');
        if (at >= 4) {
          const v = body[at + 4];
          const scale = v === 1 ? body.readUInt32BE(at + 24) : body.readUInt32BE(at + 16);
          const dur = v === 1 ? Number(body.readBigUInt64BE(at + 28)) : body.readUInt32BE(at + 20);
          if (scale) secs = dur / scale;
        }
        break;
      }
      pos += size;
    }
  } catch { secs = null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ } }
  durations.set(k, secs);
  return secs;
}
const isoDuration = (s) => { s = Math.round(s); const m = Math.floor(s / 60); return `PT${m ? `${m}M` : ''}${s % 60}S`; };

// The box's video (the long one when there is one), at its descriptive /<slug>/media/ URL
// when post.json lists it (that's what the server can serve by that name).
export function videoOf(a) {
  const f = ['video.mp4', 'reel.mp4'].find((x) => a.media?.[x]);
  if (!f) return null;
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(a.dir, 'glassbox', 'post.json'), 'utf8')); } catch { /* not recorded */ }
  const listed = plan && Object.values(plan.assets || {}).flat().includes(f);
  const url = listed ? `${SITE}/${a.slug}/media/${niceName({ ...plan, slug: a.slug }, f)}` : abs(mediaPath(a, f));
  const secs = a.dir ? mp4Seconds(path.join(a.dir, 'glassbox', f)) : null;
  const thumb = ['thumb.jpg', 'cover.jpg', 'still.jpg'].find((x) => a.media?.[x]);
  return { file: f, url, thumb: thumb ? abs(mediaPath(a, thumb)) : `${SITE}/assets/og.png`, secs, name: f === 'reel.mp4' ? `${a.question} (short)` : a.question };
}

// ---------------------------------------------------------------- JSON-LD
export const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const graph = (...nodes) => ({ '@context': 'https://schema.org', '@graph': nodes.flat().filter(Boolean) });

const ORG_ID = `${SITE}/#org`, SITE_ID = `${SITE}/#website`;
const H = config.handles || {};
export function orgNode() {
  const sameAs = [
    H.youtube && `https://www.youtube.com/${H.youtube}`, H.instagram && `https://www.instagram.com/${H.instagram}`,
    H.x && `https://x.com/${H.x}`, H.linkedin && H.linkedin, `https://github.com/${config.org}`,
  ].filter(Boolean);
  return { '@type': 'Organization', '@id': ORG_ID, name: BRAND, url: `${SITE}/`, description: `${config.tagline} ${config.pitch}`,
    logo: { '@type': 'ImageObject', url: `${SITE}/assets/og.png`, width: 1200, height: 630 }, sameAs };
}
export function websiteNode() {
  return { '@type': 'WebSite', '@id': SITE_ID, name: BRAND, url: `${SITE}/`, description: config.pitch, inLanguage: 'en', publisher: { '@id': ORG_ID },
    // site.js opens the search palette from ?q= (see the search block in site/assets/site.js).
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } };
}
export const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })) });
export const boxCrumbs = (a, last) => [[BRAND, '/'], a.kind === 'principle' ? ['Laws, principles and concepts', '/laws/'] : [a.fieldLabel, `/?f=${a.field}`], [a.question, a.pageUrl], ...(last ? [last] : [])];
const audience = { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'Curious learners, students and teachers' };
const keywordsOf = (a) => [...new Set([...(a.tags || []), ...(a.concepts || []).map((c) => c.term), a.fieldLabel].filter(Boolean))];
const minutes = (a) => (a.minutes ? `PT${a.minutes}M` : undefined);

function videoNode(a) {
  const v = videoOf(a);
  if (!v) return null;
  return { '@type': 'VideoObject', '@id': `${SITE}${a.pageUrl}#video`, name: v.name, description: describe(a), thumbnailUrl: [v.thumb], contentUrl: v.url,
    uploadDate: `${a.date}T12:00:00Z`, ...(v.secs ? { duration: isoDuration(v.secs) } : {}), inLanguage: 'en', publisher: { '@id': ORG_ID }, isFamilyFriendly: true };
}

// "The right side. The right ventricle sends…": the correct option, then why.
export const stop = (s) => (/[.!?…]["'’”)]?$/.test(s) ? s : `${s}.`);
export const answerText = (x) => [stop(x.options[x.answer]), x.why].filter(Boolean).join(' ');
export const faqOf = (a) => chaptersOf(a).flatMap((c) => c.quiz.map((x) => ({ ...x, chapter: c })));

export function faqNode(a, url) {
  const qs = chaptersOf(a).flatMap((c) => c.quiz);
  if (!qs.length) return null;
  return { '@type': 'FAQPage', '@id': `${SITE}${url}#faq`, url: SITE + url, inLanguage: 'en',
    mainEntity: qs.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: answerText(x) } })) };
}

function termNode(a) {
  const P = a.principle || {};
  return { '@type': 'DefinedTerm', '@id': `${SITE}${a.pageUrl}#term`, name: P.name || a.title, description: P.idea || answerOf(a), url: SITE + a.pageUrl,
    ...(P.formula ? { termCode: P.formula } : {}), inDefinedTermSet: { '@type': 'DefinedTermSet', '@id': `${SITE}/laws/#set`, name: `${BRAND} laws, principles and concepts`, url: `${SITE}/laws/` } };
}

// The explainer page (/e/<slug>/): an Article that is also a LearningResource, its FAQ, video and breadcrumbs.
export function explainerLd(a, { laws = [], boxes = [] } = {}) {
  const url = SITE + a.pageUrl;
  const P = a.principle || {};
  const chapters = chaptersOf(a);
  const lawsHere = laws.filter((l) => (l.principle?.appliesTo || []).includes(a.slug));
  const video = videoNode(a);
  const faq = faqNode(a, a.pageUrl);
  const article = {
    '@type': ['Article', 'LearningResource'], '@id': `${url}#article`, url, mainEntityOfPage: url, headline: a.question, name: a.question,
    alternativeHeadline: a.kind === 'principle' ? P.name || a.title : a.title, description: answerOf(a), abstract: answerOf(a),
    datePublished: a.date, dateModified: updatedOf(a), inLanguage: 'en', isAccessibleForFree: true, license: LICENSE,
    author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID }, isPartOf: { '@id': SITE_ID },
    ...(imagesOf(a).length ? { image: imagesOf(a) } : {}), keywords: keywordsOf(a).join(', '),
    about: a.kind === 'principle' ? { '@id': `${url}#term` } : [{ '@type': 'Thing', name: a.title }, { '@type': 'Thing', name: a.fieldLabel }],
    teaches: (a.concepts || []).map((c) => ({ '@type': 'DefinedTerm', name: c.term, description: c.def })),
    ...(lawsHere.length ? { mentions: lawsHere.map((l) => ({ '@type': 'DefinedTerm', name: l.principle?.name || l.title, url: SITE + l.pageUrl })) } : {}),
    ...(a.kind === 'principle' && P.appliesTo?.length ? { mentions: P.appliesTo.map((s) => boxes.find((b) => b.slug === s)).filter(Boolean).map((b) => ({ '@type': 'Thing', name: b.title, url: SITE + b.pageUrl })) } : {}),
    educationalLevel: 'Beginner', audience, learningResourceType: ['Explainer', 'Interactive simulation'], interactivityType: 'mixed',
    ...(minutes(a) ? { timeRequired: minutes(a) } : {}),
    hasPart: [
      { '@type': 'WebApplication', name: `${a.title}: interactive model`, url: SITE + a.appUrl, applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser)', isAccessibleForFree: true },
      ...chapters.map((c) => ({ '@type': 'CreativeWork', name: c.title, ...(c.subtitle ? { description: c.subtitle } : {}), url: `${url}#ch-${c.id}` })),
    ],
    ...(video ? { video: { '@id': video['@id'] } } : {}),
    ...(a.repo ? { isBasedOn: a.repo } : {}),
  };
  return graph(article, a.kind === 'principle' && termNode(a), faq, video, crumbs(boxCrumbs(a)), orgNode());
}

// The box itself (/<slug>/): an interactive web app that teaches.
export function appLd(a) {
  const url = SITE + a.appUrl;
  return graph({
    '@type': ['WebApplication', 'LearningResource'], '@id': `${url}#app`, url, name: `${a.title}: ${a.question}`, headline: a.question, description: describeApp(a),
    applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser with WebGL)', browserRequirements: 'Requires JavaScript and WebGL',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, isAccessibleForFree: true, inLanguage: 'en', license: 'https://opensource.org/licenses/MIT',
    datePublished: a.date, dateModified: updatedOf(a), ...(imagesOf(a).length ? { image: imagesOf(a), screenshot: imagesOf(a)[0] } : {}),
    keywords: keywordsOf(a).join(', '), educationalLevel: 'Beginner', audience, learningResourceType: 'Interactive simulation', interactivityType: 'active',
    ...(minutes(a) ? { timeRequired: minutes(a) } : {}), author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID }, isPartOf: { '@id': SITE_ID },
    subjectOf: { '@type': 'Article', '@id': `${SITE}${a.pageUrl}#article`, url: SITE + a.pageUrl, headline: a.question },
    ...(a.repo ? { codeRepository: a.repo, isBasedOn: a.repo } : {}),
  }, crumbs([[BRAND, '/'], [a.question, a.pageUrl], [`Play: ${a.title}`, a.appUrl]]), orgNode());
}

// ---------------------------------------------------------------- box index.html
// Replaces the box's own title/description with ours, adds canonical, share cards and
// JSON-LD, and puts a short, readable summary (question, answer, chapters, links to the
// explainer) at the top of <body> for readers without WebGL and for crawlers. The summary
// is visually hidden but reachable by screen readers; a <noscript> shows it to no-JS readers.
export function boxHead(a) {
  const title = [`${a.title}: ${a.question} · ${BRAND}`, `${a.title}: ${a.question}`, a.question].find((t) => t.length <= 60) || a.question;
  const desc = describeApp(a);
  const img = coverOf(a) || `${SITE}/assets/og.png`;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${a.appUrl}">
<link rel="alternate" type="text/html" title="${esc(`${a.question}: the explainer`)}" href="${SITE}${a.pageUrl}">
<meta name="robots" content="${robotsFor(a) || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${a.appUrl}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(a.question)}">
<meta name="twitter:card" content="summary_large_image">
${H.x ? `<meta name="twitter:site" content="@${esc(H.x)}">\n` : ''}<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
${ldScript(appLd(a))}`;
}

export function boxSummary(a) {
  const ch = chaptersOf(a);
  const inner = `<h1>${esc(a.question)}</h1>
<p>${esc(answerOf(a))}</p>
<p><a href="${a.pageUrl}">Read how it works: ${esc(a.question)}</a>${a.historyUrl ? ` · <a href="${a.historyUrl}">${esc(a.history?.title || 'The history')}</a>` : ''} · <a href="/">More boxes on ${esc(BRAND)}</a></p>
${ch.length ? `<h2>Chapters in this interactive model</h2><ol>${ch.map((c) => `<li><a href="${a.pageUrl}#ch-${esc(c.id)}">${esc(c.title)}</a>${c.subtitle ? `: ${esc(c.subtitle)}` : ''}</li>`).join('')}</ol>` : ''}`;
  const hide = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
  // Hidden links stay readable by screen readers but out of the Tab order, so focus never lands on something invisible.
  return `<section id="glassbox-summary" style="${hide}" aria-label="About this box">${inner.replace(/<a href/g, '<a tabindex="-1" href')}</section>
<noscript><div style="max-width:720px;margin:40px auto;padding:0 16px;font:16px/1.6 system-ui,sans-serif;color:#eef0f6">${inner.replace('<h1>', '<p><b>').replace('</h1>', '</b></p>')}<p>This interactive model needs JavaScript and WebGL.</p></div></noscript>`;
}

export function injectBoxSeo(html, a) {
  if (!a || html.includes('id="glassbox-summary"')) return html;
  let out = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(description|robots|twitter:[\w:]+)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[\w:]+"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  const tags = boxHead(a);
  // After charset/viewport/CSP so the CSP still comes first; otherwise before </head>.
  const anchor = out.match(/<meta name="referrer"[^>]*>\n?|<meta http-equiv="Content-Security-Policy"[^>]*>\n?/i);
  out = anchor ? out.replace(anchor[0], `${anchor[0].replace(/\n?$/, '\n')}${tags}\n`) : out.replace(/<\/head>/i, `${tags}\n</head>`);
  if (!/<html[^>]*\blang=/i.test(out)) out = out.replace(/<html\b/i, '<html lang="en"');
  return out.replace(/<body\b[^>]*>/i, (m) => `${m}\n${boxSummary(a)}`);
}

// ---------------------------------------------------------------- sitemap, robots, llms.txt
const xml = (s) => esc(s);
export function sitemap(all) {
  all = all.filter((a) => !isDraft(a));
  const laws = all.filter((a) => a.kind === 'principle');
  const up = (list) => newest(list.map(updatedOf));
  const img = (a) => imagesOf(a).map((u) => `<image:image><image:loc>${xml(u)}</image:loc></image:image>`).join('');
  const vid = (a) => {
    const v = videoOf(a);
    if (!v) return '';
    return `<video:video><video:thumbnail_loc>${xml(v.thumb)}</video:thumbnail_loc><video:title>${xml(v.name)}</video:title><video:description>${xml(describe(a))}</video:description><video:content_loc>${xml(v.url)}</video:content_loc>${v.secs ? `<video:duration>${Math.max(1, Math.round(v.secs))}</video:duration>` : ''}<video:publication_date>${a.date}T12:00:00+00:00</video:publication_date><video:family_friendly>yes</video:family_friendly></video:video>`;
  };
  const entries = [
    ['/', up(all)], ['/laws/', up(laws)], ['/concepts/', up(all)], ['/history/', up(all.filter((a) => a.historyUrl))],
    ['/privacy/', config.policyDate], ['/terms/', config.policyDate],
    ...all.flatMap((a) => [
      [a.pageUrl, updatedOf(a), img(a) + vid(a)],
      [a.appUrl, updatedOf(a), img(a)],
      ...(a.historyUrl ? [[a.historyUrl, updatedOf(a), a.media?.['cover.jpg'] ? `<image:image><image:loc>${xml(abs(mediaPath(a, 'cover.jpg')))}</image:loc></image:image>` : '']] : []),
    ]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries.map(([u, d, extra = '']) => `<url><loc>${xml(SITE + u)}</loc><lastmod>${d}</lastmod>${extra}</url>`).join('\n')}
</urlset>
`;
}

export const robots = () => `User-agent: *
Allow: /
Disallow: /studio/
Disallow: /admin
Disallow: /__

Sitemap: ${SITE}/sitemap.xml
`;

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
export function llmsTxt(all) {
  all = all.filter((a) => !isDraft(a));
  const boxes = all.filter((a) => a.kind !== 'principle');
  const laws = all.filter((a) => a.kind === 'principle').sort((x, y) => x.box - y.box);
  const line = (a) => `- [${oneLine(a.question)}](${SITE}${a.pageUrl}): ${oneLine(answerOf(a))} Interactive model: ${SITE}${a.appUrl}${a.historyUrl ? ` · History: ${SITE}${a.historyUrl}` : ''}`;
  return `# ${BRAND}

> ${config.tagline} ${config.pitch}

${BRAND} publishes one free, open-source interactive explainer a day. Every box answers one question ("How does the heart work?") three ways: a playable 3D model at ${SITE}/<slug>/, a text explainer with chapters and a FAQ at ${SITE}/e/<slug>/, and the history of how people figured it out at ${SITE}/e/<slug>/history/. Words, images and videos are ${config.licenses.content} (credit "${BRAND}" and link the page); code is ${config.licenses.code}.

## Boxes

${boxes.map(line).join('\n')}

## Laws, principles and concepts

${laws.map(line).join('\n')}

## Pages

- [Every box](${SITE}/): the shelf, newest first
- [Laws, principles and concepts](${SITE}/laws/): the rules behind every box
- [Concepts A to Z](${SITE}/concepts/): every term we define, linked to its box
- [Every history, one timeline](${SITE}/history/)

## Optional

- [Full text of every explainer](${SITE}/llms-full.txt): answers, chapters and FAQs as plain text
- [Machine-readable index](${SITE}/apps.json)
- [RSS feed](${SITE}/feed.xml)
`;
}

const paras = (html) => String(html || '').split(/<\/(?:p|li|h4|ul|ol)>/i).map(plain).filter(Boolean);
export function llmsFull(all) {
  const order = all.filter((a) => !isDraft(a)).sort((x, y) => (x.kind === y.kind ? y.box - x.box : x.kind === 'principle' ? 1 : -1));
  const one = (a) => {
    const ch = chaptersOf(a);
    const P = a.principle || {};
    const faq = ch.flatMap((c) => c.quiz);
    return [
      `# ${a.question}`,
      `Explainer: ${SITE}${a.pageUrl}\nInteractive model: ${SITE}${a.appUrl}${a.historyUrl ? `\nHistory: ${SITE}${a.historyUrl}` : ''}\nField: ${a.fieldLabel} · Published ${a.date} · ${BRAND} ${a.kind === 'principle' ? 'principle' : 'box'} No. ${a.no}`,
      `## Short answer\n\n${answerOf(a)}`,
      a.kind === 'principle' && P.formula ? `Formula: ${P.formula}${P.formulaNote ? ` (${P.formulaNote})` : ''}${P.discovered ? `\nDiscovered: ${P.discovered}` : ''}` : '',
      a.explainer?.length ? `## In 60 seconds\n\n${a.explainer.map((b) => `- ${b.title}: ${oneLine(b.text)}`).join('\n')}` : '',
      ch.length ? `## Chapter by chapter\n\n${ch.map((c) => `### ${c.title}\n\n${c.subtitle ? c.subtitle + '\n\n' : ''}${paras(c.learn).join('\n\n')}`).join('\n\n')}` : '',
      P.examples?.length ? `## Where you'll meet it\n\n${P.examples.map((e) => `- ${e.title}: ${oneLine(e.text)}`).join('\n')}` : '',
      faq.length ? `## Frequently asked\n\n${faq.map((x) => `Q: ${x.q}\nA: ${answerText(x)}`).join('\n\n')}` : '',
      a.concepts?.length ? `## Words worth knowing\n\n${a.concepts.map((c) => `- ${c.term}: ${oneLine(c.def)}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
  };
  return `# ${BRAND}: full text\n\n> ${config.tagline} ${config.pitch} Licence: ${config.licenses.content}. Index: ${SITE}/llms.txt\n\n${order.map(one).join('\n\n---\n\n')}\n`;
}
