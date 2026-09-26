// History Reel (1080×1920) and carousel (1080×1350) drawn from a box's
// history.json: a year counter racing through time, an illustration for each
// key moment, and a timeline bar. No app needed: it's all canvas.
import * as D from './draw.js';
import { artSvg } from '/assets/art.js';

export const HREEL = { W: 1080, H: 1920 };
const INTRO_MS = 3200, EVENT_MS = 3800, OUTRO_MS = 3500;
const yearLabel = (y) => (y < 0 ? `${-y} BCE` : String(y));
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const eraOf = (h, id) => h.eras.find((e) => e.id === id) || { name: '', color: '#8ef0ff' };

// Up to n key moments, in time order, spread across the whole story.
export function pickEvents(h, n = 10) {
  const byYear = [...h.events].sort((a, b) => a.year - b.year);
  const keys = byYear.filter((e) => e.key);
  const pool = keys.length >= Math.min(n, 5) ? keys : byYear;
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (n - 1))]);
}

async function loadArt(events, h) {
  const out = new Map();
  await Promise.all(events.map(async (e) => {
    const svg = artSvg(e.art, { accent: eraOf(h, e.era).color, size: 560, width: 2.2 });
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode().catch(() => null);
    out.set(e, img);
  }));
  return out;
}

export const historyTiming = (events) => ({ intro: INTRO_MS, each: EVENT_MS, outro: OUTRO_MS, total: INTRO_MS + events.length * EVENT_MS + OUTRO_MS });

function timelineBar(g, W, y, events, h, active, k) {
  const x0 = 80, x1 = W - 80, n = events.length;
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  const px = (i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
  if (active >= 0) {
    g.strokeStyle = eraOf(h, events[active].era).color; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(px(Math.max(0, active - 1)) + (px(active) - px(Math.max(0, active - 1))) * ease(k * 3), y); g.stroke();
  }
  events.forEach((e, i) => {
    const on = i === active, done = i < active;
    g.fillStyle = on || done ? eraOf(h, e.era).color : '#1a1d27';
    g.strokeStyle = eraOf(h, e.era).color; g.lineWidth = 3;
    g.beginPath(); g.arc(px(i), y, on ? 16 : 10, 0, Math.PI * 2); g.fill(); g.stroke();
  });
  g.font = `500 26px ${D.MONO}`; g.fillStyle = D.MUTED;
  g.textAlign = 'left'; g.fillText(yearLabel(events[0].year), x0 - 10, y + 56);
  g.textAlign = 'right'; g.fillText(yearLabel(events[n - 1].year), x1 + 10, y + 56);
  g.textAlign = 'left';
}

// One frame at time t (ms from the start).
export function historyFrame(g, t, ctx) {
  const { h, events, art, meta } = ctx;
  const { W, H } = HREEL;
  const T = historyTiming(events);
  const years = events.map((e) => e.year);
  const span = Math.max(...years) - Math.min(...years);
  if (t < T.intro) {
    const k = t / T.intro;
    D.background(g, W, H, eraOf(h, events[0].era).color);
    g.globalAlpha = ease(k * 2);
    D.logo(g, 80, 150, 64, meta.color);
    g.font = `600 30px ${D.SANS}`; g.fillStyle = D.TEXT; g.fillText(`${meta.brand.toUpperCase()}  ·  No. ${meta.no}`, 164, 196);
    g.font = `500 34px ${D.MONO}`; g.fillStyle = meta.color; g.fillText('THE HISTORY', 80, 520);
    const target = span >= 1000 ? Math.floor(span / 100) * 100 : span;
    const n = Math.round(ease(k * 1.4) * target);
    g.font = `400 250px ${D.SERIF}`; g.fillStyle = D.TEXT; g.fillText(n.toLocaleString('en'), 70, 780);
    g.font = `italic 400 90px ${D.SERIF}`; g.fillStyle = meta.color; g.fillText('years', 80, 890);
    const q = D.fit(g, h.title, (s) => `400 ${s}px ${D.SERIF}`, 96, 60, W - 160, 3);
    g.font = `400 ${q.size}px ${D.SERIF}`; g.fillStyle = D.TEXT;
    q.lines.forEach((l, i) => g.fillText(l, 80, 1100 + i * q.size * 1.02));
    const tl = D.fit(g, h.tagline, (s) => `500 ${s}px ${D.SANS}`, 44, 30, W - 160, 3);
    g.font = `500 ${tl.size}px ${D.SANS}`; g.fillStyle = D.MUTED;
    tl.lines.forEach((l, i) => g.fillText(l, 80, 1100 + q.lines.length * q.size * 1.02 + 50 + i * tl.size * 1.3));
    g.globalAlpha = 1;
    timelineBar(g, W, 1640, events, h, -1, 0);
    return;
  }
  const te = t - T.intro;
  if (te < events.length * T.each) {
    const i = Math.floor(te / T.each), k = (te % T.each) / T.each, e = events[i], era = eraOf(h, e.era);
    D.background(g, W, H, era.color);
    D.logo(g, 80, 110, 52, meta.color);
    g.font = `600 26px ${D.SANS}`; g.fillStyle = D.TEXT; g.fillText(h.title.toUpperCase(), 150, 148);
    // Year counter races from the previous moment's year.
    const from = i ? events[i - 1].year : e.year - Math.min(200, span / 8);
    const y = Math.round(from + (e.year - from) * ease(k * 3.2));
    g.font = `400 230px ${D.SERIF}`; g.fillStyle = era.color;
    g.fillText(yearLabel(y), 70, 420);
    g.font = `500 30px ${D.MONO}`; g.fillStyle = D.MUTED; g.fillText([e.date !== String(e.year) ? e.date.toUpperCase() : '', era.name.toUpperCase()].filter(Boolean).join('  ·  '), 80, 480);
    // Illustration in a glass tile.
    const img = art.get(e);
    const s = 520, x = (W - s) / 2, yy = 540, a = ease((k - 0.05) * 4);
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(255,255,255,.04)'; g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - 40, yy - 40, s + 80, s + 80, 48); g.fill(); g.stroke();
    if (img) { const z = 0.92 + 0.08 * ease(k * 2); g.drawImage(img, x + (s * (1 - z)) / 2, yy + (s * (1 - z)) / 2, s * z, s * z); }
    g.restore();
    // Words.
    const ta = ease((k - 0.12) * 4);
    g.globalAlpha = ta;
    const title = D.fit(g, e.title, (sz) => `600 ${sz}px ${D.SANS}`, 64, 44, W - 160, 3);
    g.font = `600 ${title.size}px ${D.SANS}`; g.fillStyle = D.TEXT;
    title.lines.forEach((l, j) => g.fillText(l, 80, 1230 + j * title.size * 1.15));
    const ty = 1230 + title.lines.length * title.size * 1.15 + 16;
    g.font = `500 30px ${D.MONO}`; g.fillStyle = D.MUTED;
    const who = [e.who, e.where].filter(Boolean).join('  ·  ');
    D.wrap(g, who, W - 160).slice(0, 2).forEach((l, j) => g.fillText(l, 80, ty + j * 40));
    g.globalAlpha = ease((k - 0.3) * 4);
    const why = D.fit(g, e.why || '', (sz) => `italic 400 ${sz}px ${D.SERIF}`, 50, 36, W - 160, 3);
    g.font = `italic 400 ${why.size}px ${D.SERIF}`; g.fillStyle = era.color;
    why.lines.forEach((l, j) => g.fillText(l, 80, ty + 100 + j * why.size * 1.1));
    g.globalAlpha = 1;
    timelineBar(g, W, 1760, events, h, i, k);
    return;
  }
  D.outro(g, W, H, { ...meta, follow: `The full history: ${meta.domain}/e/${meta.slug}/history` }, (te - events.length * T.each) / T.outro);
}

export async function prepare(h, box) {
  const events = pickEvents(h, 10);
  return { h, events, art: await loadArt(events, h) };
}

// Carousel: a cover, one slide per key moment, and an end card.
export function historySlides(ctx, meta) {
  const { h, events, art } = ctx;
  const W = 1080, H = 1350, out = [];
  const years = events.map((e) => e.year), raw = Math.max(...years) - Math.min(...years);
  const span = raw >= 1000 ? Math.floor(raw / 100) * 100 : raw;
  {
    const c = D.canvas(W, H), g = c.getContext('2d');
    D.background(g, W, H, meta.color);
    D.logo(g, 70, 70, 56, meta.color);
    g.font = `600 26px ${D.SANS}`; g.fillStyle = D.TEXT; g.fillText(`${meta.brand.toUpperCase()}  ·  No. ${meta.no}`, 140, 108);
    g.font = `400 220px ${D.SERIF}`; g.fillStyle = D.TEXT; g.fillText(span.toLocaleString('en'), 64, 470);
    g.font = `italic 400 80px ${D.SERIF}`; g.fillStyle = meta.color; g.fillText(`years in ${events.length} moments`, 70, 570);
    const q = D.fit(g, h.title, (s) => `400 ${s}px ${D.SERIF}`, 100, 60, W - 140, 3);
    g.font = `400 ${q.size}px ${D.SERIF}`; g.fillStyle = D.TEXT;
    q.lines.forEach((l, i) => g.fillText(l, 70, 780 + i * q.size));
    g.font = `500 30px ${D.MONO}`; g.fillStyle = D.MUTED; g.textAlign = 'right'; g.fillText('swipe →', W - 70, H - 60); g.textAlign = 'left';
    out.push(c);
  }
  events.slice(0, 8).forEach((e, i) => {
    const c = D.canvas(W, H), g = c.getContext('2d'), era = eraOf(h, e.era);
    D.background(g, W, H, era.color);
    g.font = `500 28px ${D.MONO}`; g.fillStyle = era.color; g.fillText(`${String(i + 2).padStart(2, '0')} / ${Math.min(8, events.length) + 2}   ·   ${era.name.toUpperCase()}`, 70, 90);
    g.font = `400 190px ${D.SERIF}`; g.fillStyle = era.color; g.fillText(yearLabel(e.year), 60, 290);
    const img = art.get(e); if (img) g.drawImage(img, W - 70 - 300, 60, 300, 300);
    const title = D.fit(g, e.title, (s) => `600 ${s}px ${D.SANS}`, 62, 42, W - 140, 3);
    g.font = `600 ${title.size}px ${D.SANS}`; g.fillStyle = D.TEXT;
    title.lines.forEach((l, j) => g.fillText(l, 70, 450 + j * title.size * 1.15));
    let y = 450 + title.lines.length * title.size * 1.15 + 10;
    g.font = `500 28px ${D.MONO}`; g.fillStyle = D.MUTED;
    D.wrap(g, [e.who, e.where].filter(Boolean).join('  ·  '), W - 140).slice(0, 2).forEach((l) => { g.fillText(l, 70, y); y += 38; });
    const txt = D.fit(g, e.text, (s) => `400 ${s}px ${D.SANS}`, 36, 26, W - 140, 9);
    g.font = `400 ${txt.size}px ${D.SANS}`; g.fillStyle = '#c9cedb';
    y += 30; txt.lines.forEach((l) => { g.fillText(l, 70, y); y += txt.size * 1.45; });
    if (e.why) {
      const why = D.fit(g, e.why, (s) => `italic 400 ${s}px ${D.SERIF}`, 44, 30, W - 180, 3);
      g.fillStyle = era.color; g.fillRect(70, y + 10, 4, why.lines.length * why.size * 1.1 + 10);
      g.font = `italic 400 ${why.size}px ${D.SERIF}`;
      why.lines.forEach((l, j) => g.fillText(l, 96, y + 10 + why.size + j * why.size * 1.1));
    }
    out.push(c);
  });
  const c = D.canvas(W, H), g = c.getContext('2d');
  D.outro(g, W, H, { ...meta, follow: `Full history: ${meta.domain}/e/${meta.slug}/history` }, 1);
  out.push(c);
  return out;
}
