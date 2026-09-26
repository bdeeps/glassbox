// Glassbox Studio: records a box's storyboard into a YouTube video and a
// Reel/Short, renders the carousel, thumbnail and share cover, drafts the post
// copy, and (on the local dev server) saves it all to the box repo and ships
// it to Buffer.
import * as D from './draw.js';
import { canEncode, createEncoder, soundtrack, toBlob, zip } from './encode.js';
import { captions as draft, LIMITS } from './captions.js';
import * as HX from './history.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FPS = 30, OUTRO_MS = 3500;
const TARGET_LABEL = {
  'instagram:reel': 'Instagram Reel', 'instagram:carousel': 'Instagram carousel', 'youtube:short': 'YouTube Short', 'youtube:video': 'YouTube video (16:9)',
  'linkedin:video': 'LinkedIn video', 'twitter:video': 'X video', 'threads:video': 'Threads video', 'tiktok:video': 'TikTok video',
  'facebook:video': 'Facebook video', 'bluesky:video': 'Bluesky video', 'mastodon:video': 'Mastodon video',
  'instagram:history-reel': 'Instagram history Reel', 'instagram:history-carousel': 'Instagram history carousel', 'youtube:history-short': 'YouTube history Short',
};

let idx, dev = null, box = null, scenes = [], stopFlag = false;
let outputs = {};  // name → { blob?, url, kind, fresh }
let stills = { square: [], land: [] };
let caps = null;
let hist = null;  // the box's history.json, when it has one

// ---------------------------------------------------------------- boot
async function boot() {
  idx = await fetch('/apps.json').then((r) => r.json());
  dev = await fetch('/__studio/status').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  $('#mode').textContent = dev ? 'local dev: saving + shipping on' : 'hosted: download only';
  $('#mode').classList.toggle('dev', !!dev);
  if (!dev) ['#btnSave', '#btnDry', '#btnShip', '#tabSettings'].forEach((s) => ($(s).hidden = true));
  $('#box').innerHTML = idx.apps.map((a) => `<option value="${a.slug}">No. ${a.no} · ${esc(a.title)}: ${esc(a.question)}</option>`).join('');
  const want = new URLSearchParams(location.search).get('box');
  if (want && idx.apps.some((a) => a.slug === want)) $('#box').value = want;
  $('#box').addEventListener('change', () => selectBox($('#box').value));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('on', x === t));
    $$('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === t.dataset.tab));
    if (t.dataset.tab === 'brand') renderBrand();
    if (t.dataset.tab === 'settings') loadSettings();
  }));
  $('#btnRecord').addEventListener('click', record);
  $('#btnHistory').addEventListener('click', recordHistory);
  $('#btnStop').addEventListener('click', () => { stopFlag = true; });
  $('#btnRedraft').addEventListener('click', () => { caps = draft(box, idx, scenes, hist); renderWords(); });
  $('#btnSave').addEventListener('click', () => guard($('#btnSave'), save));
  $('#btnDry').addEventListener('click', () => guard($('#btnDry'), () => ship(true)));
  $('#btnShip').addEventListener('click', () => guard($('#btnShip'), () => ship(false)));
  $('#btnZip').addEventListener('click', () => guard($('#btnZip'), downloadZip));
  if (dev) wireSettings();
  await D.loadFonts();
  if (!canEncode()) $('#noDirector').hidden = false, ($('#noDirector').textContent = 'This browser cannot encode video. Use a recent Chrome or Edge.');
  if (idx.apps.length) await selectBox($('#box').value);
}

async function guard(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { log('✗ ' + (e.message || e)); console.error(e); } finally { btn.disabled = false; }
}
const log = (s, reset = false) => { const l = $('#log'); l.textContent = (reset ? '' : l.textContent) + s + '\n'; l.scrollTop = l.scrollHeight; };

// ---------------------------------------------------------------- box selection
async function selectBox(slug) {
  box = idx.apps.find((a) => a.slug === slug);
  document.body.style.setProperty('--c', box.color);
  outputs = {}; stills = { square: [], land: [] };
  const st = dev?.apps.find((a) => a.slug === slug);
  $('#status').innerHTML = [
    dev ? `<span class="pill ${st?.git?.remote ? 'ok' : 'no'}">${st?.git?.remote ? 'git remote ✓' : 'no git remote yet'}</span>` : '',
    dev ? `<span class="pill ${dev.buffer ? 'ok' : 'no'}">${dev.buffer ? 'Buffer key ✓' : 'no BUFFER_API_KEY'}</span>` : '',
  ].join('');
  $('#savePath').textContent = st ? `${st.dir}/glassbox/` : `${slug}/glassbox/`;

  // Read the storyboard by loading the box once.
  scenes = [];
  $('#scenes').innerHTML = '<li>Loading the box…</li>';
  try {
    const h = await openBox(slug, 320, 320, false);
    scenes = h.director.scenes.map((s) => ({ caption: s.caption, ms: s.ms }));
    h.frame.remove();
    $('#noDirector').hidden = canEncode();
  } catch (e) {
    $('#noDirector').hidden = false;
    $('#noDirector').innerHTML = `${esc(e.message)} Without a director the studio can't record video, but you can still write the copy. See <code>docs/CONTRACT.md</code>.`;
    scenes = box.explainer.map((b) => ({ caption: b.title, ms: 5000 }));
  }
  const total = scenes.reduce((a, s) => a + s.ms, 0) + OUTRO_MS;
  $('#scenes').innerHTML = scenes.map((s) => `<li>${esc(s.caption)}<small>${(s.ms / 1000).toFixed(1)}s</small></li>`).join('') + `<li>End card<small>${OUTRO_MS / 1000}s · total ${(total / 1000).toFixed(1)}s</small></li>`;

  // The box's history, if it has one.
  hist = await fetch(`/${slug}/history.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  $('#btnHistory').disabled = !hist || !canEncode();
  $('#historyHint').innerHTML = hist
    ? `Records a 45-second “${esc(hist.title)} in 10 moments” Reel and a 10-slide carousel from <code>history.json</code> (${hist.events.length} moments).`
    : 'This box has no <code>history.json</code> yet. See docs/HISTORY.md.';

  // Anything already saved for this box.
  const base = `/${slug}/glassbox/`;
  const prev = await fetch(base + 'post.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (prev) {
    for (const f of [prev.assets.video, prev.assets.reel, prev.assets.thumb, prev.assets.cover, prev.assets.still, ...(prev.assets.slides || []), prev.assets.historyReel, ...(prev.assets.historySlides || [])].filter(Boolean)) {
      outputs[f] = { url: base + f, kind: f.endsWith('.mp4') ? 'video' : 'image', fresh: false };
    }
  }
  const fresh = draft(box, idx, scenes, hist);
  caps = prev?.captions ? { ...fresh, ...prev.captions, history: prev.captions.history || fresh.history } : fresh;
  renderOutputs(); renderWords(); renderShip(prev); renderHistory();
}

// Loads a box in an off-screen iframe (same origin) and waits for its director.
async function openBox(slug, w, h, setup = true) {
  const f = document.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', left: '-30000px', top: '0', width: w + 'px', height: h + 'px', border: '0' });
  f.setAttribute('aria-hidden', 'true');
  f.src = `/${slug}/?reel=1`;
  document.body.appendChild(f);
  await new Promise((r, j) => { f.onload = r; setTimeout(() => j(new Error('The box took too long to load.')), 30000); });
  const t0 = Date.now();
  while (!f.contentWindow.glassbox?.director) {
    if (Date.now() - t0 > 20000) { f.remove(); throw new Error('This box has no window.glassbox.director.'); }
    await sleep(100);
  }
  const director = f.contentWindow.glassbox.director;
  if (setup) { await director.setup({ width: w, height: h }); await sleep(500); }
  return { frame: f, director };
}

// ---------------------------------------------------------------- recording
const meta = () => ({
  brand: idx.brand, domain: idx.domain, slug: box.slug, no: box.no, color: box.color, question: box.question, title: box.title,
  thumbText: box.thumbText, follow: idx.handles.instagram ? `Follow @${idx.handles.instagram}` : '',
});

function copy(src) {
  if (!src) return null;
  const c = D.canvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

async function run(fmt, file, stillKey, compose, audio) {
  const m = meta();
  const h = await openBox(box.slug, fmt.app.w, fmt.app.h);
  const out = D.canvas(fmt.W, fmt.H), g = out.getContext('2d');
  const pv = $('#preview'), pg = pv.getContext('2d');
  pv.width = fmt.W > fmt.H ? 960 : 540; pv.height = fmt.W > fmt.H ? 540 : 960;
  $('#previewEmpty').hidden = true;
  const enc = await createEncoder({ W: fmt.W, H: fmt.H, fps: FPS, audio });
  const counts = scenes.map((s) => Math.round((s.ms / 1000) * FPS));
  const outroN = Math.round((OUTRO_MS / 1000) * FPS);
  const total = counts.reduce((a, b) => a + b, 0) + outroN;
  let done = 0;
  const tick = (label) => {
    done++;
    if (done % 3 === 0 || done === total) {
      pg.drawImage(out, 0, 0, pv.width, pv.height);
      $('#prog').style.width = ((done / total) * 100).toFixed(1) + '%';
      $('#progText').textContent = `${label} · frame ${done} / ${total}`;
    }
  };
  stills[stillKey] = [];
  try {
    for (let i = 0; i < scenes.length; i++) {
      const n = counts[i], at = Math.floor(n * 0.8);
      for (let f = 0; f < n; f++) {
        if (stopFlag) throw new Error('Stopped.');
        const t = f / n;
        const shot = h.director.frame(i, t, 1000 / FPS);
        if (f === at) stills[stillKey][i] = { main: copy(shot.main), inset: copy(shot.inset) };
        compose(g, shot, m, scenes, i, t);
        await enc.add(out);
        tick(`${file}: scene ${i + 1}`);
      }
    }
    const last = copy(out);
    for (let f = 0; f < outroN; f++) {
      if (stopFlag) throw new Error('Stopped.');
      g.drawImage(last, 0, 0);
      D.outro(g, fmt.W, fmt.H, m, f / outroN);
      await enc.add(out);
      tick(`${file}: end card`);
    }
    $('#progText').textContent = `${file}: finishing the MP4…`;
    const blob = await enc.finish();
    setOutput(file, blob, 'video');
    return enc.withAudio;
  } finally {
    h.frame.remove();
  }
}

async function record() {
  if (!canEncode()) return;
  stopFlag = false;
  $('#btnRecord').disabled = true; $('#btnStop').hidden = false;
  try {
    const audio = $('#optAudio').checked ? await soundtrack(scenes.map((s) => s.ms), OUTRO_MS) : null;
    let sound = null;
    if ($('#optVideo').checked) sound = await run(D.VIDEO, 'video.mp4', 'land', D.videoFrame, audio);
    if ($('#optReel').checked) sound = await run(D.REEL, 'reel.mp4', 'square', D.reelFrame, audio);
    await makeStills();
    $('#progText').textContent = `Done. ${audio && sound === false ? 'This browser has no AAC encoder, so the videos are silent. ' : ''}Check the outputs, then the Words and Ship tabs.`;
  } catch (e) {
    $('#progText').textContent = e.message;
    console.error(e);
  } finally {
    $('#btnRecord').disabled = false; $('#btnStop').hidden = true;
  }
}

async function makeStills() {
  const m = meta();
  const sq = stills.square.filter(Boolean), la = stills.land.filter(Boolean);
  const any = sq.length ? sq : la;
  if (!any.length) return;
  const ti = Math.min(box.thumbScene ?? 3, (la.length || any.length) - 1);
  const landStill = la[ti] || any[ti];
  const slides = [D.slideCover(m, sq[0] || any[0])];
  const body = scenes.slice(0, 8);
  body.forEach((s, i) => { const st = sq[i] || la[i]; if (st) slides.push(D.slideScene(m, st, s.caption, i + 2, body.length + 2)); });
  slides.push(D.slideCta(m));
  Object.keys(outputs).filter((k) => k.startsWith('slide-')).forEach((k) => delete outputs[k]);
  for (let i = 0; i < slides.length; i++) setOutput(`slide-${i + 1}.jpg`, await toBlob(slides[i]), 'image');
  setOutput('thumb.jpg', await toBlob(D.thumbnail(m, landStill)), 'image');
  setOutput('cover.jpg', await toBlob(D.shareCover(m, landStill)), 'image');
  // A clean frame with no text, for shelf cards and the home page cube.
  setOutput('still.jpg', await toBlob(D.flatten(landStill, 1200, 630), 'image/jpeg', 0.88), 'image');
}

function setOutput(name, blob, kind) {
  if (outputs[name]?.fresh) URL.revokeObjectURL(outputs[name].url);
  outputs[name] = { blob, url: URL.createObjectURL(blob), kind, fresh: true };
  renderOutputs();
}

function renderOutputs() {
  const order = (n) => (n === 'video.mp4' ? 0 : n === 'reel.mp4' ? 1 : n === 'thumb.jpg' ? 2 : n === 'cover.jpg' ? 3 : n === 'still.jpg' ? 4 : n === 'history-reel.mp4' ? 20 : n.startsWith('history-slide-') ? 20 + parseInt(n.split('-')[2]) : 5 + parseInt(n.split('-')[1] || 0));
  const names = Object.keys(outputs).sort((a, b) => order(a) - order(b));
  $('#outputs').innerHTML = names.length ? names.map((n) => {
    const o = outputs[n];
    const size = o.blob ? ` · ${(o.blob.size / 1e6).toFixed(1)} MB` : ' · saved';
    const media = o.kind === 'video' ? `<video src="${o.url}" controls playsinline muted loop preload="metadata"></video>` : `<img src="${o.url}" alt="${n}" loading="lazy">`;
    return `<div class="out ${n === 'video.mp4' || n === 'cover.jpg' || n === 'thumb.jpg' ? 'wide' : ''}"><div class="media">${media}</div><div class="cap"><span>${n}${size}</span><a href="${o.url}" download="${box.slug}-${n}">Download</a></div></div>`;
  }).join('') : '<p class="hint">Nothing recorded yet.</p>';
}

// ---------------------------------------------------------------- history reel
async function recordHistory() {
  if (!hist || !canEncode()) return;
  stopFlag = false;
  $('#btnHistory').disabled = true; $('#btnRecord').disabled = true; $('#btnStop').hidden = false;
  try {
    const m = meta();
    const ctx = await HX.prepare(hist, box);
    const T = HX.historyTiming(ctx.events);
    const audio = $('#optAudio').checked ? await soundtrack([T.intro, ...ctx.events.map(() => T.each)], T.outro) : null;
    const { W, H } = HX.HREEL;
    const out = D.canvas(W, H), g = out.getContext('2d');
    const pv = $('#preview'), pg = pv.getContext('2d');
    pv.width = 540; pv.height = 960; $('#previewEmpty').hidden = true;
    const enc = await createEncoder({ W, H, fps: FPS, audio });
    const total = Math.round((T.total / 1000) * FPS);
    for (let f = 0; f < total; f++) {
      if (stopFlag) throw new Error('Stopped.');
      HX.historyFrame(g, (f * 1000) / FPS, { ...ctx, meta: m });
      await enc.add(out);
      if (f % 3 === 0) { pg.drawImage(out, 0, 0, pv.width, pv.height); $('#prog').style.width = ((f / total) * 100).toFixed(1) + '%'; $('#progText').textContent = `history-reel.mp4 · frame ${f} / ${total}`; }
    }
    $('#progText').textContent = 'history-reel.mp4: finishing the MP4…';
    setOutput('history-reel.mp4', await enc.finish(), 'video');
    Object.keys(outputs).filter((k) => k.startsWith('history-slide-')).forEach((k) => delete outputs[k]);
    const slides = HX.historySlides(ctx, m);
    for (let i = 0; i < slides.length; i++) setOutput(`history-slide-${i + 1}.jpg`, await toBlob(slides[i]), 'image');
    $('#progText').textContent = 'History reel and carousel done. Save them from the Ship tab.';
  } catch (e) {
    $('#progText').textContent = e.message; console.error(e);
  } finally {
    $('#btnHistory').disabled = false; $('#btnRecord').disabled = false; $('#btnStop').hidden = true;
  }
}

// ---------------------------------------------------------------- words
const FIELDS = [
  ['instagram', 'Instagram Reel caption'], ['carousel', 'Instagram carousel caption'],
  ['youtube.title', 'YouTube Short title'], ['youtube.description', 'YouTube Short description'],
  ['youtubeLong.title', 'YouTube video title'], ['youtubeLong.description', 'YouTube video description'],
  ['short', 'X / Bluesky'], ['linkedin', 'LinkedIn / Threads / TikTok'],
  ['history.instagram', 'History Reel and carousel caption'], ['history.youtube.title', 'History Short title'], ['history.youtube.description', 'History Short description'],
];
const getc = (k) => k.split('.').reduce((o, p) => o?.[p], caps) ?? '';
const setc = (k, v) => { const ps = k.split('.'); const last = ps.pop(); ps.reduce((o, p) => (o[p] ||= {}), caps)[last] = v; };

function renderWords() {
  $('#words').innerHTML = FIELDS.map(([k, label]) => {
    const v = getc(k), lim = LIMITS[k], single = k.endsWith('.title');
    return `<div class="w"><label class="lbl" for="w-${k}"><span>${label}</span><span class="count" data-for="${k}"></span></label>
      ${single ? `<input type="text" id="w-${k}" data-k="${k}" value="${esc(v)}">` : `<textarea id="w-${k}" data-k="${k}">${esc(v)}</textarea>`}</div>`;
  }).join('');
  const count = (el) => {
    const k = el.dataset.k, n = [...el.value].length, lim = LIMITS[k];
    const c = $(`.count[data-for="${k}"]`); c.textContent = `${n} / ${lim}`; c.classList.toggle('over', n > lim);
  };
  $$('#words [data-k]').forEach((el) => { count(el); el.addEventListener('input', () => { setc(el.dataset.k, el.value); count(el); }); });
}

// ---------------------------------------------------------------- ship
function defaultWhen() {
  const [hh, mm] = (idx.post.time || '18:30').split(':').map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  if (d.getTime() < Date.now() + 30 * 60e3) d.setDate(d.getDate() + 1);
  return d;
}
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

function renderShip(prev) {
  const when = prev?.schedule?.at && new Date(prev.schedule.at) > new Date() ? new Date(prev.schedule.at) : defaultWhen();
  $('#when').value = toLocalInput(when);
  const saved = new Map((prev?.targets || []).map((t) => [`${t.service}:${t.kind}`, t.enabled !== false]));
  $('#targets').innerHTML = idx.post.targets.map((t) => {
    const k = `${t.service}:${t.kind}`, on = saved.has(k) ? saved.get(k) : t.enabled !== false;
    return `<label class="check"><input type="checkbox" data-t="${k}" ${on ? 'checked' : ''}> ${TARGET_LABEL[k] || k}${t.offsetHours ? ` <span class="hint">(+${t.offsetHours}h)</span>` : ''}</label>`;
  }).join('');
}

function plan() {
  const has = (n) => !!outputs[n];
  const slides = Object.keys(outputs).filter((n) => n.startsWith('slide-')).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
  const hslides = Object.keys(outputs).filter((n) => n.startsWith('history-slide-')).sort((a, b) => parseInt(a.split('-')[2]) - parseInt(b.split('-')[2]));
  const on = new Map($$('#targets [data-t]').map((c) => [c.dataset.t, c.checked]));
  return {
    slug: box.slug, box: box.box, question: box.question,
    url: `https://${idx.domain}/e/${box.slug}/`, app: `https://${idx.domain}/${box.slug}/`,
    assets: {
      ...(has('reel.mp4') ? { reel: 'reel.mp4' } : {}), ...(has('video.mp4') ? { video: 'video.mp4' } : {}),
      ...(has('cover.jpg') ? { cover: 'cover.jpg' } : {}), ...(has('thumb.jpg') ? { thumb: 'thumb.jpg' } : {}),
      ...(has('still.jpg') ? { still: 'still.jpg' } : {}),
      ...(has('history-reel.mp4') ? { historyReel: 'history-reel.mp4' } : {}),
      ...(hslides.length ? { historySlides: hslides } : {}),
      ...(slides.length ? { slides } : {}),
    },
    captions: caps,
    schedule: { at: new Date($('#when').value).toISOString() },
    targets: idx.post.targets.map((t) => ({ ...t, enabled: on.get(`${t.service}:${t.kind}`) !== false })),
    thumbnailOffsetMs: 1200,
    updatedAt: new Date().toISOString(),
  };
}

async function put(slug, name, blob) {
  const r = await fetch(`/__studio/save/${slug}/${name}`, { method: 'POST', body: blob });
  if (!r.ok) throw new Error(`saving ${name} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function save() {
  log(`Saving to ${$('#savePath').textContent}`, true);
  for (const [name, o] of Object.entries(outputs)) {
    if (!o.fresh) continue;
    const r = await put(box.slug, name, o.blob);
    log(`  ✓ ${name}  ${(r.bytes / 1e6).toFixed(2)} MB`);
    o.fresh = false; o.blob = null;
  }
  await put(box.slug, 'post.json', new Blob([JSON.stringify(plan(), null, 2) + '\n'], { type: 'application/json' }));
  log('  ✓ post.json');
  const tooBig = Object.entries(outputs).filter(([, o]) => o.blob?.size > 90e6);
  if (tooBig.length) log('⚠ GitHub rejects files over 100 MB: ' + tooBig.map(([n]) => n).join(', '));
  log('Saved. Next: Dry run, then Ship it.');
}

async function ship(dry) {
  if (!dry && !confirm(`Commit and push ${box.slug}/glassbox, then schedule every checked post in Buffer for ${new Date($('#when').value).toLocaleString()}?`)) return;
  const unsaved = Object.entries(outputs).some(([, o]) => o.fresh);
  if (unsaved) { await save(); log(''); } else {
    await put(box.slug, 'post.json', new Blob([JSON.stringify(plan(), null, 2) + '\n'], { type: 'application/json' }));
  }
  log(dry ? '— dry run —' : '— shipping —', !unsaved);
  const r = await fetch(`/__studio/ship/${box.slug}?dry=${dry ? 1 : 0}&mode=schedule`, { method: 'POST' });
  const reader = r.body.getReader(), dec = new TextDecoder();
  for (;;) { const { done, value } = await reader.read(); if (done) break; $('#log').textContent += dec.decode(value, { stream: true }); $('#log').scrollTop = 1e9; }
  if (!dry) renderHistory();
}

async function downloadZip() {
  const files = [];
  for (const [name, o] of Object.entries(outputs)) files.push({ name: `${box.slug}/${name}`, blob: o.blob || (await fetch(o.url).then((r) => r.blob())) });
  files.push({ name: `${box.slug}/post.json`, blob: new Blob([JSON.stringify(plan(), null, 2)], { type: 'application/json' }) });
  const z = await zip(files);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(z), download: `${box.slug}-glassbox.zip` });
  a.click();
  log(`Downloaded ${files.length} files.`);
}

async function renderHistory() {
  if (!dev) return;
  const h = await fetch(`/__studio/posted/${box.slug}`).then((r) => r.json()).catch(() => null);
  $('#history').innerHTML = h?.results?.length
    ? `<p class="hint">Sent to Buffer ${new Date(h.at).toLocaleString()} (${esc(h.mode)})</p>` + h.results.map((x) => `<div class="h"><span>${esc(TARGET_LABEL[x.target] || x.target)} → ${esc(x.channel)}</span>${x.error ? `<span class="err">✗ ${esc(x.error)}</span>` : `<span class="ok">✓ ${esc(x.status || 'queued')}${x.dueAt ? ' · ' + new Date(x.dueAt).toLocaleString() : ''}</span>`}</div>`).join('')
    : '<p class="hint">Not posted yet.</p>';
}

// ---------------------------------------------------------------- settings (local dev only)
async function loadSettings() {
  if (!dev) return;
  const st = await fetch('/__studio/settings').then((r) => r.json());
  $('#keyState').textContent = st.buffer.hasKey ? `key saved · ${st.buffer.hint}` : 'no key saved';
  $('#keyState').className = 'pill ' + (st.buffer.hasKey ? 'ok' : 'no');
  $('#postTime').value = st.post.time || '18:30';
  $('#postTz').value = st.post.timezone || '';
  $('#targetRows').innerHTML = st.post.targets.map((t, i) => `<tr data-i="${i}" data-service="${esc(t.service)}" data-kind="${esc(t.kind)}">
    <td><input type="checkbox" ${t.enabled === false ? '' : 'checked'} aria-label="Post ${esc(TARGET_LABEL[`${t.service}:${t.kind}`] || t.service)}"></td>
    <td>${esc(TARGET_LABEL[`${t.service}:${t.kind}`] || `${t.service} ${t.kind}`)}</td>
    <td><input type="number" min="0" max="72" step="1" value="${t.offsetHours || 0}"></td></tr>`).join('');
  $('#ga4').value = st.analytics.ga4 || '';
  $('#ctSnippet').value = st.analytics.clicktrust?.snippet || '';
  $('#ctPolicy').value = st.analytics.clicktrust?.policyUrl || '';
  showActive(st.active);
}
function showActive(a) {
  $('#analyticsOut').textContent = [
    `Google Analytics: ${a.ga4 ? 'on (' + a.ga4 + ')' : 'off'}`,
    `ClickTrust: ${a.clicktrust ? 'on' : 'off'}${a.ct.hosts.length ? ' · talks to ' + a.ct.hosts.join(', ') : ''}`,
    'Runs on the published site only, never on localhost.',
  ].join('\n');
}
async function saveSettings(body) {
  const r = await fetch('/__studio/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  const out = await r.json();
  idx = await fetch('/apps.json').then((x) => x.json());
  dev = await fetch('/__studio/status').then((x) => x.json());
  return out;
}
function wireSettings() {
  $('#btnSaveKey').addEventListener('click', () => guardS($('#btnSaveKey'), async () => {
    const k = $('#bufferKey').value.trim();
    if (!k) throw new Error('Paste a key first.');
    await saveSettings({ bufferKey: k }); $('#bufferKey').value = ''; await loadSettings(); await listChannels();
  }));
  $('#btnRemoveKey').addEventListener('click', () => guardS($('#btnRemoveKey'), async () => {
    if (!confirm('Remove the saved Buffer key from .env?')) return;
    await saveSettings({ bufferKey: '' }); $('#channels').innerHTML = ''; await loadSettings();
  }));
  $('#btnChannels').addEventListener('click', () => guardS($('#btnChannels'), listChannels));
  $('#btnSavePost').addEventListener('click', () => guardS($('#btnSavePost'), async () => {
    const targets = $$('#targetRows tr').map((tr) => ({ service: tr.dataset.service, kind: tr.dataset.kind, enabled: tr.querySelector('[type=checkbox]').checked, offsetHours: +tr.querySelector('[type=number]').value || 0 }));
    await saveSettings({ post: { time: $('#postTime').value, timezone: $('#postTz').value.trim(), targets } });
    renderShip(null); flash($('#btnSavePost'), 'Saved ✓');
  }));
  $('#btnSaveAnalytics').addEventListener('click', () => guardS($('#btnSaveAnalytics'), async () => {
    const out = await saveSettings({ analytics: { ga4: $('#ga4').value.trim(), clicktrust: { snippet: $('#ctSnippet').value, policyUrl: $('#ctPolicy').value.trim() } } });
    showActive(out.active);
    $('#analyticsOut').textContent += `\nUpdated the Content Security Policy in: ${out.synced.join(', ') || 'no local boxes'}.\nTo publish: commit and push the hub and each box repo.`;
  }));
}
async function listChannels() {
  $('#channels').innerHTML = '<p class="hint">Asking Buffer…</p>';
  const r = await fetch('/__studio/buffer/channels').then((x) => x.json());
  if (r.error) { $('#channels').innerHTML = `<p class="warn">${esc(r.error)}</p>`; return; }
  const wanted = new Set(idx.post.targets.map((t) => t.service));
  $('#channels').innerHTML = r.channels.length
    ? r.channels.map((c) => `<div class="ch"><b>${esc(c.service)}</b> ${esc(c.displayName || c.name)}<small>${c.isQueuePaused ? 'queue paused' : wanted.has(c.service) ? 'will post' : 'not a target'}</small></div>`).join('')
      + (() => { const miss = [...wanted].filter((s) => !r.channels.some((c) => c.service === s)); return miss.length ? `<p class="hint">Not connected in Buffer: ${miss.join(', ')}. Those targets are skipped.</p>` : ''; })()
    : '<p class="warn">The key works, but no channels are connected in Buffer yet.</p>';
}
async function guardS(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { alert(e.message || e); } finally { btn.disabled = false; }
}
function flash(btn, msg) { const t = btn.textContent; btn.textContent = msg; setTimeout(() => (btn.textContent = t), 1600); }

// ---------------------------------------------------------------- brand kit
let brandDone = false;
async function renderBrand() {
  if (brandDone) return;
  brandDone = true;
  const b = { brand: idx.brand, domain: idx.domain, tagline: 'See inside how things work.' };
  const items = [
    ['profile.png', D.brandProfile(b), 'Profile picture · 1080×1080'],
    ['banner.png', D.brandBanner(b), 'YouTube banner · 2560×1440'],
    ['og.png', D.brandOg(b), 'Home page share card · 1200×630'],
  ];
  $('#brandOut').innerHTML = '';
  for (const [name, c, label] of items) {
    const blob = await toBlob(c, 'image/png');
    const url = URL.createObjectURL(blob);
    const el = document.createElement('div');
    el.className = 'out' + (name === 'profile.png' ? '' : ' wide');
    el.innerHTML = `<div class="media"><img src="${url}" alt="${label}"></div><div class="cap"><span>${label}</span><span><a href="${url}" download="glassbox-${name}">Download</a>${dev && name === 'og.png' ? ` · <a href="#" data-hub>Save to hub</a>` : ''}</span></div>`;
    el.querySelector('[data-hub]')?.addEventListener('click', async (e) => { e.preventDefault(); await put('_hub', name, blob); e.target.textContent = 'Saved ✓'; });
    $('#brandOut').appendChild(el);
  }
}

boot();
