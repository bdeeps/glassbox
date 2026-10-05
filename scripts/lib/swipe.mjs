// The swipe feed (/swipe/): every box as a full-screen card, made for a phone held upright.
// Swipe up or down for the next box, sideways through that box's picture slides (the same
// ten slides made for the Instagram carousel), and tap through to play with the real thing.
// It is plain HTML with scroll-snap: it works without JavaScript; swipe.js adds the counter,
// the slide dots, keyboard keys, the short video and remembering where you were.
import fs from 'node:fs';
import path from 'node:path';
import { config, esc } from './apps.mjs';
import { head, asset, LOGO, waHref, boxShareText } from './render.mjs';

const mediaUrl = (a, f) => `/${a.slug}/glassbox/${f}`;
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// The picture slides a box has on disk, title slide first.
function slidesOf(a) {
  const dir = a.dir ? path.join(a.dir, 'glassbox') : null;
  let names = [];
  try { names = JSON.parse(fs.readFileSync(path.join(dir, 'post.json'), 'utf8')).assets?.slides || []; } catch { /* not recorded, or no plan */ }
  names = names.filter((f) => /^slide-\d+\.(jpg|png)$/.test(f) && fs.existsSync(path.join(dir, f))).slice(0, 10);
  if (!names.length && a.media?.['slide-1.jpg']) names = ['slide-1.jpg'];
  return names;
}
const hasFile = (a, f) => { try { return !!a.dir && fs.existsSync(path.join(a.dir, 'glassbox', f)); } catch { return false; } };

// One sentence of the hook, for the line under the picture.
const brief = (a) => { const s = String(a.hook || '').trim(); const m = s.match(/^.{40,170}?[.!?](?=\s|$)/); return m ? m[0] : s.slice(0, 170); };

function card(a, i) {
  const slides = slidesOf(a), law = a.kind === 'principle';
  const eager = i === 0;
  const pics = slides.length
    // Only the pictures near the card on screen are ever loaded (swipe.js fills and empties
    // them): a phone cannot hold 1,800 full-size slides in memory, and reloads the page if asked to.
    ? slides.map((f, k) => `<img src="${eager && k === 0 ? mediaUrl(a, f) : BLANK}" data-src="${mediaUrl(a, f)}" alt="${esc(k ? `${a.question} Slide ${k + 1} of ${slides.length}.` : a.question)}" width="1080" height="1350"${eager && k === 0 ? ' fetchpriority="high"' : ''} decoding="async" draggable="false">`).join('')
    : `<div class="sw-blank"><span>${esc(a.thumbText || a.title)}</span></div>`;
  const points = (a.explainer || []).slice(0, 3).map((b) => `<li>${esc(b.title)}</li>`).join('');
  return `<section class="sw-card" id="${esc(a.slug)}" style="--c:${esc(a.color)}" data-kind="${law ? 'law' : 'box'}" aria-label="${esc(a.question)}">
  <div class="sw-strip"${slides.length > 1 ? ' tabindex="0"' : ''}>${pics}</div>
  ${slides.length > 1 ? `<div class="sw-dots" aria-hidden="true">${slides.map((_, k) => `<i${k ? '' : ' class="on"'}></i>`).join('')}</div>` : ''}
  <div class="sw-info">
    <p class="sw-meta"><b>${law ? 'Law ' + esc(String(a.no).replace(/^L/, '')) : 'No. ' + esc(a.no)}</b><span>${esc(a.fieldLabel || a.field)}</span><span>${esc(a.minutes || 5)} min</span></p>
    <h2>${esc(a.question)}</h2>
    <p class="sw-hook">${esc(brief(a))}</p>
    ${points ? `<ul class="sw-points">${points}</ul>` : ''}
    <div class="sw-acts">
      <a class="btn primary" href="${esc(a.appUrl)}">Play with it</a>
      ${hasFile(a, 'reel.mp4') ? `<button class="btn" type="button" data-reel="${mediaUrl(a, 'reel.mp4')}" data-poster="${slides[0] ? mediaUrl(a, slides[0]) : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>Watch</button>` : ''}
      <a class="btn" href="${esc(a.pageUrl)}">Read</a>
      <a class="btn ghost sw-share" href="${esc(waHref(boxShareText(a)))}" rel="noopener" target="_blank" data-share-title="${esc(a.question)}" data-share-url="${esc(a.pageUrl)}" aria-label="Share ${esc(a.question)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></a>
    </div>
  </div>
</section>`;
}

export function swipePage(apps, laws = []) {
  // Newest box first, then the laws and principles in their own order.
  const boxes = [...apps].filter((a) => slidesOf(a).length).sort((x, y) => y.box - x.box);
  const rules = [...laws].filter((a) => slidesOf(a).length).sort((x, y) => x.box - y.box);
  const all = [...boxes, ...rules];
  return `${head({
    title: `Swipe through ${config.brand}: every explainer, one screen each`,
    description: `Every ${config.brand} explainer as a full-screen card. Swipe up for the next one, sideways for its picture story, and tap to play with the real 3D model.`,
    url: '/swipe/', cls: 'swipe', extra: `<link rel="stylesheet" href="${asset('/assets/swipe.css')}">\n<script src="${asset('/assets/swipe.js')}" defer></script>`,
  })}
<header class="sw-top">
  <a class="brand" href="/" aria-label="${esc(config.brand)} home">${LOGO}<span>${esc(config.brand)}</span></a>
  <nav aria-label="Jump to">
    <a href="#${esc(boxes[0]?.slug || '')}" data-jump="box" class="on">Boxes <small>${boxes.length}</small></a>
    ${rules.length ? `<a href="#${esc(rules[0].slug)}" data-jump="law">Laws <small>${rules.length}</small></a>` : ''}
  </nav>
  <a class="sw-close" href="/" aria-label="Back to the shelf"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z"/></svg></a>
</header>
<main class="sw-feed" id="main" tabindex="-1">
<noscript><p class="sw-nojs">The swipe view needs JavaScript for its pictures. <a href="/#shelf">Open the shelf instead.</a></p></noscript>
${all.map(card).join('\n')}
<section class="sw-card sw-end" aria-label="The end">
  <div class="sw-endbox">
    <p class="eyebrow">That is all ${all.length}</p>
    <h2>A new box opens most days.</h2>
    <p>Get a note when it does, or go back to the shelf and pick one to play with.</p>
    <div class="sw-acts"><a class="btn primary" href="/" data-welcome>Tell me when</a><a class="btn" href="/#shelf">The shelf</a><a class="btn ghost" href="#${esc(all[0]?.slug || '')}">Back to the top</a></div>
  </div>
</section>
</main>
<p class="sw-count" id="swCount" aria-live="polite"></p>
<div class="sw-hint" id="swHint" hidden><span>Swipe up for the next box</span><span>Swipe sideways for its story</span></div>
<dialog class="sw-video" id="swVideo" aria-label="Video"><button type="button" class="sw-vx" aria-label="Close the video">×</button><video playsinline controls preload="none"></video></dialog>
</body></html>`;
}
