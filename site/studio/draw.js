// Canvas compositing for every studio output: Reels/Shorts frames, YouTube
// frames, carousel slides, thumbnail, share cover and the brand kit.
export const INK = '#07080c', TEXT = '#eef0f6', MUTED = '#a3a9ba', DIM = '#6b7285', GLOW = '#8ef0ff';
export const SERIF = '"Instrument Serif", Georgia, serif', SANS = '"Geist", system-ui, sans-serif', MONO = '"Geist Mono", ui-monospace, monospace';

export async function loadFonts() {
  await Promise.all([
    `400 80px ${SERIF}`, `italic 400 80px ${SERIF}`, `600 60px ${SANS}`, `700 60px ${SANS}`, `500 30px ${SANS}`, `500 30px ${MONO}`,
  ].map((f) => document.fonts.load(f).catch(() => null)));
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function background(g, W, H, color, { grid = true } = {}) {
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  const r = Math.max(W, H) * 0.75;
  const glow = g.createRadialGradient(W * 0.85, H * 0.05, 0, W * 0.85, H * 0.05, r);
  glow.addColorStop(0, alpha(color, 0.28)); glow.addColorStop(1, alpha(color, 0));
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  if (grid) {
    const s = Math.round(W / 19);
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = s; x < W; x += s) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = s; y < H; y += s) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
  }
}

// The Glassbox mark: an isometric glass cube with a glowing core.
export function logo(g, x, y, size, color = GLOW, stroke = TEXT) {
  const k = size / 64;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.lineJoin = 'round'; g.lineWidth = 3.4; g.strokeStyle = stroke;
  g.beginPath(); g.moveTo(32, 5); g.lineTo(56, 18); g.lineTo(56, 46); g.lineTo(32, 59); g.lineTo(8, 46); g.lineTo(8, 18); g.closePath(); g.stroke();
  g.globalAlpha = 0.45; g.beginPath(); g.moveTo(8, 18); g.lineTo(32, 31); g.lineTo(56, 18); g.moveTo(32, 31); g.lineTo(32, 59); g.stroke();
  g.globalAlpha = 1; g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color;
  g.beginPath(); g.arc(32, 31, 7.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Largest font size (≤ max) whose wrapped text fits in maxLines.
export function fit(g, text, font, max, min, maxW, maxLines) {
  for (let s = max; s >= min; s -= 2) {
    g.font = font(s);
    const lines = wrap(g, text, maxW);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  g.font = font(min);
  return { size: min, lines: wrap(g, text, maxW).slice(0, maxLines) };
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Draws src into the rect with object-fit: cover.
function cover(g, src, x, y, w, h) {
  const sw = src.width, sh = src.height, s = Math.max(w / sw, h / sh);
  const cw = w / s, ch = h / s;
  g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

function windowed(g, src, x, y, w, h, r, color) {
  g.save();
  g.shadowColor = alpha(color, 0.45); g.shadowBlur = 60;
  rrect(g, x, y, w, h, r); g.fillStyle = '#0b0d14'; g.fill();
  g.restore();
  g.save(); rrect(g, x, y, w, h, r); g.clip();
  if (src) cover(g, src, x, y, w, h);
  g.restore();
  g.save(); rrect(g, x + 1, y + 1, w - 2, h - 2, r); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.stroke(); g.restore();
}

function inset(g, src, x, y, w, label) {
  const h = Math.round((w * src.height) / src.width);
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30;
  rrect(g, x, y, w, h, 18); g.fillStyle = '#000'; g.fill(); g.restore();
  g.save(); rrect(g, x, y, w, h, 18); g.clip(); g.drawImage(src, x, y, w, h); g.restore();
  g.save(); rrect(g, x, y, w, h, 18); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke(); g.restore();
  if (label) {
    g.font = `500 ${Math.round(w / 20)}px ${MONO}`;
    const tw = g.measureText(label).width, px = 12, ph = Math.round(w / 13);
    g.fillStyle = 'rgba(7,8,12,.75)'; rrect(g, x + 12, y + 12, tw + px * 2, ph, ph / 2); g.fill();
    g.fillStyle = TEXT; g.textBaseline = 'middle'; g.fillText(label, x + 12 + px, y + 12 + ph / 2); g.textBaseline = 'alphabetic';
  }
  return h;
}

function brandRow(g, x, y, W, meta, size = 30) {
  logo(g, x, y - size * 0.95, size * 1.3, meta.color);
  g.font = `600 ${size}px ${SANS}`; g.fillStyle = TEXT; g.textBaseline = 'middle';
  g.fillText(meta.brand.toUpperCase(), x + size * 1.65, y - size * 0.3);
  g.font = `500 ${size}px ${MONO}`; g.fillStyle = meta.color; g.textAlign = 'right';
  g.fillText(`No. ${meta.no}`, W - x, y - size * 0.3);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

// Reveals a caption word by word over the first part of a scene.
function caption(g, lines, x, y, lh, t, color = TEXT) {
  const total = lines.join(' ').split(' ').length;
  const shown = t >= 0.32 ? total : Math.ceil((t / 0.32) * total);
  let n = 0;
  lines.forEach((line, li) => {
    let cx = x;
    for (const w of line.split(' ')) {
      n++;
      const a = n <= shown ? 1 : 0.12;
      g.fillStyle = a === 1 ? color : 'rgba(238,240,246,.12)';
      g.fillText(w, cx, y + li * lh);
      cx += g.measureText(w + ' ').width;
    }
  });
}

function progress(g, x, y, w, h, scenes, i, t) {
  const gap = 8, n = scenes.length, sw = (w - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const sx = x + k * (sw + gap);
    g.fillStyle = 'rgba(255,255,255,.16)'; rrect(g, sx, y, sw, h, h / 2); g.fill();
    const f = k < i ? 1 : k === i ? t : 0;
    if (f > 0) { g.fillStyle = TEXT; rrect(g, sx, y, Math.max(h, sw * f), h, h / 2); g.fill(); }
  }
}

// ---------------------------------------------------------------- video frames
// 9:16 Reel / Short. App window is 1000×1000; layout avoids the bottom overlay zone.
export const REEL = { W: 1080, H: 1920, app: { w: 1000, h: 1000 } };
export function reelFrame(g, { main, inset: ins, insetLabel }, meta, scenes, i, t) {
  const { W, H } = REEL;
  background(g, W, H, meta.color);
  brandRow(g, 60, 150, W, meta, 30);
  g.font = `italic 400 50px ${SERIF}`; g.fillStyle = meta.color;
  const q = wrap(g, meta.question, W - 120).slice(0, 2);
  q.forEach((l, k) => g.fillText(l, 60, 235 + k * 54));
  const top = 235 + q.length * 54 + 30;
  const cap = fit(g, scenes[i].caption, (s) => `600 ${s}px ${SANS}`, 64, 44, W - 120, 3);
  g.font = `600 ${cap.size}px ${SANS}`;
  caption(g, cap.lines, 60, top + cap.size * 0.8, cap.size * 1.18, t);
  const wy = 560;
  windowed(g, main, 40, wy, 1000, 1000, 40, meta.color);
  if (ins) inset(g, ins, 40 + 1000 - 420 - 24, wy + 24, 420, insetLabel);
  progress(g, 60, 1600, W - 120, 8, scenes, i, t);
  g.font = `500 32px ${MONO}`; g.fillStyle = MUTED; g.textAlign = 'center';
  g.fillText(`${meta.domain}/${meta.slug}`, W / 2, 1670);
  g.textAlign = 'left';
}

// 16:9 YouTube video. The app fills the frame; captions sit in a lower third.
export const VIDEO = { W: 1920, H: 1080, app: { w: 1920, h: 1080 } };
export function videoFrame(g, { main, inset: ins, insetLabel }, meta, scenes, i, t) {
  const { W, H } = VIDEO;
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  if (main) cover(g, main, 0, 0, W, H);
  const top = g.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, 'rgba(7,8,12,.85)'); top.addColorStop(1, 'rgba(7,8,12,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 260);
  const bot = g.createLinearGradient(0, H - 340, 0, H);
  bot.addColorStop(0, 'rgba(7,8,12,0)'); bot.addColorStop(1, 'rgba(7,8,12,.9)');
  g.fillStyle = bot; g.fillRect(0, H - 340, W, 340);
  brandRow(g, 64, 96, W, meta, 28);
  g.font = `italic 400 48px ${SERIF}`; g.fillStyle = meta.color;
  g.fillText(meta.question, 64, 170);
  if (ins) inset(g, ins, W - 64 - 440, 200, 440, insetLabel);
  const cap = fit(g, scenes[i].caption, (s) => `600 ${s}px ${SANS}`, 56, 40, W - 400, 2);
  g.font = `600 ${cap.size}px ${SANS}`;
  caption(g, cap.lines, 64, H - 150 - (cap.lines.length - 1) * cap.size * 1.15, cap.size * 1.15, t);
  progress(g, 64, H - 60, W - 128, 6, scenes, i, t);
  g.font = `500 26px ${MONO}`; g.fillStyle = MUTED; g.textAlign = 'right';
  g.fillText(`${meta.domain}/${meta.slug}`, W - 64, H - 90);
  g.textAlign = 'left';
}

// End card, faded in over k (0→1) on top of whatever is in the canvas.
export function outro(g, W, H, meta, k) {
  g.save();
  g.globalAlpha = Math.min(1, k * 2.2);
  background(g, W, H, meta.color);
  const cx = W / 2, portrait = H > W, s = portrait ? 1 : 0.8;
  const lift = (1 - Math.min(1, k * 1.6)) * 30;
  logo(g, cx - 90 * s, H * (portrait ? 0.24 : 0.14) + lift, 180 * s, meta.color);
  g.textAlign = 'center';
  g.fillStyle = TEXT; g.font = `400 ${Math.round(100 * s)}px ${SERIF}`;
  g.fillText('Play with it yourself.', cx, H * (portrait ? 0.46 : 0.52) + lift);
  g.font = `500 ${Math.round(50 * s)}px ${MONO}`; g.fillStyle = meta.color;
  g.fillText(`${meta.domain}/${meta.slug}`, cx, H * (portrait ? 0.53 : 0.64) + lift);
  g.font = `500 ${Math.round(36 * s)}px ${SANS}`; g.fillStyle = MUTED;
  g.fillText(`Box No. ${meta.no}. A new one every day.`, cx, H * (portrait ? 0.62 : 0.76) + lift);
  if (meta.follow) { g.fillStyle = TEXT; g.fillText(meta.follow, cx, H * (portrait ? 0.67 : 0.83) + lift); }
  g.restore();
  g.textAlign = 'left';
}

// ---------------------------------------------------------------- stills
// Stills are {main, inset} canvases captured mid-scene during recording.
export function flatten(still, W, H) {
  const c = canvas(W, H), g = c.getContext('2d');
  cover(g, still.main, 0, 0, W, H);
  if (still.inset) inset(g, still.inset, W - Math.round(W * 0.38) - 20, 20, Math.round(W * 0.38), null);
  return c;
}

export function slideCover(meta, still) {
  const W = 1080, H = 1350, c = canvas(W, H), g = c.getContext('2d');
  background(g, W, H, meta.color);
  brandRow(g, 60, 110, W, meta, 28);
  const q = fit(g, meta.question, (s) => `400 ${s}px ${SERIF}`, 118, 70, W - 120, 3);
  g.font = `400 ${q.size}px ${SERIF}`; g.fillStyle = TEXT;
  q.lines.forEach((l, k) => g.fillText(l, 60, 200 + q.size * 0.85 + k * q.size * 0.98));
  const y = 200 + q.lines.length * q.size * 0.98 + 50;
  const size = Math.min(H - y - 110, W - 120);
  windowed(g, flatten(still, 1000, 1000), (W - size) / 2, y, size, size, 34, meta.color);
  g.font = `500 30px ${MONO}`; g.fillStyle = MUTED; g.textAlign = 'right';
  g.fillText('swipe →', W - 60, H - 50); g.textAlign = 'left';
  return c;
}

export function slideScene(meta, still, text, n, total) {
  const W = 1080, H = 1350, c = canvas(W, H), g = c.getContext('2d');
  background(g, W, H, meta.color);
  g.font = `500 28px ${MONO}`; g.fillStyle = meta.color;
  g.fillText(`${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 60, 90);
  g.fillStyle = DIM; g.textAlign = 'right'; g.fillText(`${meta.brand.toUpperCase()} No. ${meta.no}`, W - 60, 90); g.textAlign = 'left';
  windowed(g, flatten(still, 960, 860), 60, 130, 960, 860, 34, meta.color);
  const cap = fit(g, text, (s) => `600 ${s}px ${SANS}`, 60, 40, W - 120, 4);
  g.font = `600 ${cap.size}px ${SANS}`; g.fillStyle = TEXT;
  cap.lines.forEach((l, k) => g.fillText(l, 60, 1060 + cap.size * 0.8 + k * cap.size * 1.2));
  return c;
}

export function slideCta(meta) {
  const W = 1080, H = 1350, c = canvas(W, H), g = c.getContext('2d');
  outro(g, W, H, meta, 1);
  return c;
}

export function thumbnail(meta, still) {
  const W = 1280, H = 720, c = canvas(W, H), g = c.getContext('2d');
  // Subject sits on the right so the headline on the left doesn't cover it.
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  g.drawImage(flatten(still, Math.round(W * 0.72), H), Math.round(W * 0.28), 0);
  const shade = g.createLinearGradient(0, 0, W * 0.75, 0);
  shade.addColorStop(0, 'rgba(7,8,12,.94)'); shade.addColorStop(0.55, 'rgba(7,8,12,.7)'); shade.addColorStop(1, 'rgba(7,8,12,0)');
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  const text = (meta.thumbText || meta.title).toUpperCase();
  const f = fit(g, text, (s) => `700 ${s}px ${SANS}`, 118, 64, W * 0.58, 3);
  g.font = `700 ${f.size}px ${SANS}`;
  const lh = f.size * 0.98, y0 = H / 2 - ((f.lines.length - 1) * lh) / 2 + f.size * 0.35;
  f.lines.forEach((l, k) => {
    g.fillStyle = k === f.lines.length - 1 ? meta.color : TEXT;
    g.fillText(l, 56, y0 + k * lh);
  });
  g.fillStyle = meta.color; g.fillRect(56, y0 + (f.lines.length - 1) * lh + 28, 120, 10);
  logo(g, 56, 40, 60, meta.color);
  g.font = `500 30px ${MONO}`; g.fillStyle = TEXT; g.fillText(`No. ${meta.no}`, 132, 80);
  return c;
}

export function shareCover(meta, still) {
  const W = 1200, H = 630, c = canvas(W, H), g = c.getContext('2d');
  background(g, W, H, meta.color);
  windowed(g, flatten(still, 640, 560), W - 640 - 36, 36, 640, 558, 26, meta.color);
  brandRow(g, 48, 88, 500, meta, 24);
  const q = fit(g, meta.question, (s) => `400 ${s}px ${SERIF}`, 72, 44, 440, 4);
  g.font = `400 ${q.size}px ${SERIF}`; g.fillStyle = TEXT;
  q.lines.forEach((l, k) => g.fillText(l, 48, 170 + q.size * 0.8 + k * q.size));
  g.font = `500 22px ${MONO}`; g.fillStyle = meta.color;
  g.fillText(`${meta.domain}/${meta.slug}`, 48, H - 48);
  return c;
}

// ---------------------------------------------------------------- brand kit
export function brandProfile(brand) {
  const W = 1080, c = canvas(W, W), g = c.getContext('2d');
  background(g, W, W, GLOW, { grid: false });
  logo(g, W * 0.2, W * 0.2, W * 0.6, GLOW);
  return c;
}

export function brandBanner(brand) {
  // YouTube: 2560×1440 with the safe area 1546×423 in the middle.
  const W = 2560, H = 1440, c = canvas(W, H), g = c.getContext('2d');
  background(g, W, H, GLOW);
  const cx = W / 2, cy = H / 2;
  logo(g, cx - 700, cy - 120, 220, GLOW);
  g.font = `400 170px ${SERIF}`; g.fillStyle = TEXT; g.fillText(brand.brand, cx - 440, cy + 40);
  g.font = `500 44px ${SANS}`; g.fillStyle = MUTED; g.fillText(brand.tagline + ' A new box every day.', cx - 440, cy + 120);
  return c;
}

export function brandOg(brand) {
  const W = 1200, H = 630, c = canvas(W, H), g = c.getContext('2d');
  background(g, W, H, GLOW);
  logo(g, 72, 80, 96, GLOW);
  g.font = `400 112px ${SERIF}`; g.fillStyle = TEXT;
  g.fillText('See inside', 72, 330);
  g.fillText('how things ', 72, 440);
  const w = g.measureText('how things ').width;
  g.font = `italic 400 112px ${SERIF}`; g.fillStyle = GLOW; g.fillText('work.', 72 + w, 440);
  g.font = `500 30px ${SANS}`; g.fillStyle = MUTED;
  g.fillText('One open-source interactive explainer, every day.', 72, 520);
  g.font = `500 26px ${MONO}`; g.fillStyle = TEXT; g.fillText(brand.domain, 72, 580);
  return c;
}
