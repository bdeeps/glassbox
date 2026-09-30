// Glassbox Admin: pick a box, press Publish. Or switch on auto-publish and do nothing at all.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let data = null, busy = false;
const plan = { on: false, sel: new Set() };
const LABEL = { 'youtube:short': 'YouTube Short', 'youtube:video': 'YouTube video', 'youtube:history-short': 'YouTube history Short', 'instagram:reel': 'Instagram Reel', 'instagram:carousel': 'Instagram carousel', 'instagram:history-reel': 'Instagram history Reel', 'instagram:history-carousel': 'Instagram history carousel', 'linkedin:video': 'LinkedIn video', 'twitter:video': 'X video', 'facebook:video': 'Facebook video', 'tiktok:video': 'TikTok video', 'threads:video': 'Threads video' };
const LINKS_OK = new Set(['facebook', 'linkedin', 'twitter', 'threads']);
let dest = null;
// Options for one post: Hootsuite / SocialPilot accounts on that network, or don't post.
function routeOptions(t) {
  const o = [];
  for (const a of dest.hootsuite.filter((x) => x.service === t.service)) o.push({ v: `hootsuite:${a.id}`, l: `Hootsuite · ${a.name || a.service}` });
  for (const a of dest.socialpilot.filter((x) => x.service === t.service)) {
    const who = `@${a.name || a.handle}`;
    if (!t.video) o.push({ v: `socialpilot:${a.id}`, l: `SocialPilot · ${who}` });
    else if (LINKS_OK.has(t.service)) o.push({ v: `socialpilot:${a.id}`, l: `SocialPilot · ${who} (as a link)` });
    else o.push({ v: '', l: `SocialPilot · ${who} (can't post video)`, off: true });
  }
  o.push({ v: 'skip', l: "Don't post" });
  return o;
}
function defaultRoute(t, opts) {
  const saved = data.settings.routes?.[t.target];
  if (saved) { const v = saved.via === 'skip' ? 'skip' : `${saved.via}:${saved.account}`; if (opts.some((o) => o.v === v && !o.off)) return v; }
  const prefer = t.video ? ['hootsuite', 'socialpilot'] : ['socialpilot', 'hootsuite'];
  for (const via of prefer) { const hit = opts.find((o) => !o.off && o.v.startsWith(via + ':')); if (hit) return hit.v; }
  return 'skip';
}
async function loadRoutes(slug) {
  const box = $('#routes');
  box.innerHTML = '<p class="sub">Loading where each post can go…</p>';
  try {
    const [t, d] = await Promise.all([api('targets/' + encodeURIComponent(slug)).then((r) => r.json()), dest ? dest : api('destinations').then((r) => r.json())]);
    dest = d;
    const note = [d.hootsuiteError && `Hootsuite: ${d.hootsuiteError}`, d.socialpilotError && `SocialPilot: ${d.socialpilotError}`].filter(Boolean).join(' · ');
    box.innerHTML = `<table class="rt"><tbody>${(t.targets || []).map((x) => {
      const opts = routeOptions(x), def = defaultRoute(x, opts);
      return `<tr><th scope="row">${esc(LABEL[x.target] || x.target)}<small>${x.video ? 'video' : 'images'}</small></th><td><select data-route="${esc(x.target)}" aria-label="Where to post the ${esc(LABEL[x.target] || x.target)}">${opts.map((o) => `<option value="${esc(o.v)}"${o.off ? ' disabled' : ''}${o.v === def ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></td></tr>`;
    }).join('')}</tbody></table>${note ? `<p class="sub bad">${esc(note)}</p>` : ''}`;
  } catch (e) { box.innerHTML = `<p class="sub bad">Couldn't load the accounts: ${esc(e.message)}</p>`; }
}
const chosenRoutes = () => Object.fromEntries([...document.querySelectorAll('#routes [data-route]')].map((sel) => {
  const [via, ...rest] = sel.value.split(':');
  return [sel.dataset.route, via === 'skip' ? { via: 'skip' } : { via, account: rest.join(':') }];
}));
const day = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const live = {};   // slug → { text, done, bad } for a publish run in this tab
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(iso);
};
const entry = (l) => `<li class="${l.ok === false ? 'bad' : ''}"><time datetime="${esc(l.at)}" title="${esc(when(l.at))}">${ago(l.at)}</time> ${esc(l.message)}${l.provider ? ` <span class="via">${esc(l.provider)}</span>` : ''}</li>`;

async function api(path, opts = {}) {
  const res = await fetch('/__admin/api/' + path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) { location.href = '/admin/'; throw new Error('signed out'); }
  return res;
}

function flash(msg, bad = false) {
  const f = $('#flash');
  f.textContent = msg; f.hidden = !msg; f.classList.toggle('bad', bad);
}

async function load() {
  data = await (await api('status')).json();
  const s = data.settings;
  $('#auto').checked = s.auto;
  $('#when').value = s.when;
  $('#autoSub').textContent = s.auto
    ? `On since ${when(s.since)}. New boxes publish as soon as they're ready.`
    : 'Off. When on, each new box publishes as soon as it is ready.';
  $('#autoCard').classList.toggle('on', s.auto);

  const h = data.hootsuite, split = (s.channel || 'split') === 'split';
  const hprof = h.profiles?.length ? ` Profiles: ${h.profiles.map((p) => p.service || p.type).join(', ')}.` : '';
  $('#hootBtn').textContent = h.connected ? 'Disconnect' : 'Connect Hootsuite';
  $('#hootBtn').dataset.connected = h.connected ? '1' : '';
  $('#hootPill').textContent = split ? 'videos' : 'everything';
  $('#hootPill').classList.add('primary');
  $('#hootUse').textContent = split ? 'Use for everything' : 'Split again';
  $('#hootSub').textContent = !h.connected ? 'Not connected: videos have nowhere to go.' : h.error ? `Connected, but: ${h.error}`
    : `${split ? 'YouTube Shorts, YouTube videos and Instagram Reels go here.' : 'Everything goes here.'} YouTube arrives as drafts to schedule in the Planner.${hprof}`;
  const spc = !!data.socialpilot?.connected;
  $('#spBtn').textContent = spc ? 'Disconnect' : 'Connect SocialPilot';
  $('#spBtn').dataset.connected = spc ? '1' : '';
  $('#spPill').textContent = split ? 'images & links' : 'off';
  $('#spPill').classList.toggle('primary', split);
  $('#spSub').textContent = !split ? 'Switched off.' : spc ? 'Carousels and link posts go here (only to @glassbox.how on Instagram).' : 'Not connected yet: click Connect SocialPilot and sign in once.';
  const b = data.buffer;
  $('#bufOn').checked = !!s.buffer;
  $('#buf .pill').textContent = s.buffer ? 'on' : 'off';
  if (!s.buffer) $('#bufSub').textContent = 'Switched off: nothing is sent to Buffer.'; else $('#bufSub').textContent = !b.ok ? `Buffer: ${b.error}` : b.list.length ? `Connected: ${b.list.map((c) => `${c.name} (${c.service})`).join(', ')}` : 'No channels connected in Buffer yet (connect YouTube at buffer.com).';

  const tr = data.tracking || {};
  $('#tagCard').hidden = !tr.gtm && !tr.ga4;
  if (tr.gtm || tr.ga4) {
    $('#tagSub').innerHTML = `${tr.gtm ? `Tag Manager <code>${esc(tr.gtm)}</code>` : ''}${tr.gtm && tr.ga4 ? ' and ' : ''}${tr.ga4 ? `Google Analytics <code>${esc(tr.ga4)}</code>` : ''} are on every page of the site and every box. They load with the same consent rules (after “Allow” in the EU/UK, never with a privacy signal) and never on localhost or while recording.`;
    $('#tagHead').textContent = tr.snippets?.head || ''; $('#tagBody').textContent = tr.snippets?.body || '';
    $('#gaBlock').hidden = !tr.snippets?.ga4; $('#tagGa').textContent = tr.snippets?.ga4 || '';
  }
  renderList();
  const general = data.log.filter((l) => !l.slug).slice(0, 8);
  $('#activity').innerHTML = general.map(entry).join('');
  $('.log-a').hidden = !general.length;
}

function renderList() {
  const opened = new Set([...document.querySelectorAll('#list li[data-box] details.act[open]')].map((d) => d.closest('li').dataset.box));
  const q = $('#q').value.trim().toLowerCase();
  const rows = data.boxes.filter((x) => !q || `${x.no} ${x.title} ${x.question} ${x.slug}`.toLowerCase().includes(q));
  $('#list').innerHTML = rows.map((x) => {
    const state = x.posted ? `<span class="st ok">Published ${when(x.posted.at)}${x.posted.by === 'auto' ? ' (auto)' : ''} · ${x.posted.ok}/${x.posted.total}</span>`
      : x.ready ? '<span class="st ready">Ready</span>' : `<span class="st no">${esc(x.why)}</span>`;
    const L = live[x.slug], mine = data.log.filter((l) => l.slug === x.slug);
    const act = L
      ? `<details class="act live${L.done ? '' : ' run'}${L.bad ? ' bad' : ''}"${L.open || opened.has(x.slug) ? ' open' : ''}><summary>${esc(L.last || 'Starting…')}</summary><pre>${esc(L.text)}</pre></details>`
      : mine.length ? `<details class="act${mine[0].ok === false ? ' bad' : ''}"${opened.has(x.slug) ? ' open' : ''}><summary>${mine.length > 1 ? `<span class="more">+${mine.length - 1}</span> ` : ''}${ago(mine[0].at)} · ${esc(mine[0].message)}</summary>${mine.length > 1 ? `<ul>${mine.slice(1, 8).map(entry).join('')}</ul>` : ''}</details>` : '';
    const S = x.scheduled, pickable = plan.on && x.ready && (!S || S.state === 'error' || S.state === 'done');
    const what = S && (S.drafts ? `the draft for ${day(S.at)}` : S.at ? `for ${day(S.at)}` : '');
    const sched = S ? `<span class="sch ${esc(S.state)}">${S.state === 'queued' ? (S.drafts ? `Draft queued for ${esc(day(S.at))}` : `In the publish queue${S.at ? ' ' + esc(what) : ''}`)
      : S.state === 'running' ? `${S.drafts ? 'Making ' + esc(what) : 'Publishing'}…${S.last ? ` <small>${esc(S.last)}</small>` : ''}`
      : S.state === 'done' ? (S.drafts ? `Draft ready for ${esc(day(S.at))}` : 'Published from the queue')
      : `${S.drafts ? 'Draft' : 'Publishing'} failed: ${esc(S.error || 'unknown error')}`}${S.state === 'queued' || S.state === 'error' ? ` <button type="button" class="unq" data-unqueue="${esc(x.slug)}" aria-label="Remove from the schedule">×</button>` : ''}</span>`
      : x.posted?.draftFor ? `<span class="sch done">Draft for ${esc(day(x.posted.draftFor))}</span>` : '';
    return `<li style="--c:${esc(x.color)}" class="${L && !L.done ? 'busy' : ''}${plan.sel.has(x.slug) ? ' sel' : ''}${pickable ? ' pickable' : ''}" data-box="${esc(x.slug)}">${pickable ? `<label class="pick"><input type="checkbox" data-pick-box="${esc(x.slug)}"${plan.sel.has(x.slug) ? ' checked' : ''} aria-label="Choose ${esc(x.question)}"></label>` : ''}<span class="no">${x.kind === 'principle' ? '' : 'No. '}${esc(x.no)}</span>
      <span class="t"><b>${esc(x.question)}</b>${state}${sched}${act}</span>
      <span class="acts">${!x.posted
        ? `<button class="btn small primary" data-slug="${esc(x.slug)}" data-mode="new" ${x.ready ? '' : 'disabled'}>Publish</button>`
        : `${x.posted.ok < x.posted.total ? `<button class="btn small primary" data-slug="${esc(x.slug)}" data-mode="retry" ${x.ready ? '' : 'disabled'}>Retry the rest</button>` : ''}<button class="btn small ghost" data-slug="${esc(x.slug)}" data-mode="again" ${x.ready ? '' : 'disabled'}>Publish again</button>`}</span></li>`;
  }).join('') || '<li class="empty-a">No box matches.</li>';
}

async function enqueue(items) {
  const r = await api('schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { flash(j.error || 'Could not queue that.', true); return false; }
  return true;
}
async function publish(slug, { dry, force, all, routes }) {
  if (busy) return;
  busy = true;
  const L = live[slug] = { text: '', last: dry ? 'Previewing…' : 'Publishing…', done: false, bad: false };
  const paint = () => {
    const card = document.querySelector(`#list li[data-box="${CSS.escape(slug)}"]`);
    if (!card) return;
    const d = card.querySelector('details.act.live');
    if (d) { L.open = d.open; d.querySelector('summary').textContent = L.last; d.querySelector('pre').textContent = L.text; d.classList.toggle('run', !L.done); d.classList.toggle('bad', L.bad); }
    else renderList();
  };
  renderList();
  document.querySelectorAll('#list button').forEach((b) => { b.disabled = true; });
  try {
    const res = await api(`publish/${encodeURIComponent(slug)}?${new URLSearchParams({ dry: dry ? '1' : '0', force: force ? '1' : '0', all: all ? '1' : '0', when: $('#when').value, ...(routes ? { routes: JSON.stringify(routes) } : {}) })}`, { method: 'POST' });
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      L.text += dec.decode(value, { stream: true });
      L.last = L.text.trim().split('\n').filter(Boolean).pop()?.replace(/^\s*[•✓–]\s*/, '') || L.last;
      paint();
    }
    L.bad = /\n?✗ /.test(L.text) && !/done:/.test(L.text);
    L.last = dry ? 'Preview only: nothing was sent.' : L.bad ? L.last : /draft/.test(L.text) ? 'Done. YouTube drafts are in your Hootsuite Planner: press Schedule.' : 'Published.';
    flash(L.bad ? 'Publishing failed: open the box\'s activity for details.' : '', L.bad);
  } catch (e) { L.bad = true; L.last = e.message; }
  L.done = true;
  busy = false;
  await load();
}

$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-slug]');
  if (!btn) return;
  const box = data.boxes.find((x) => x.slug === btn.dataset.slug), mode = btn.dataset.mode;
  const targets = (data.settings.channel || 'split') === 'split' ? 'the accounts you pick below' : 'Hootsuite';
  const timing = ({ auto: 'at its planned time', queue: 'in the next free slot', now: 'right away' })[$('#when').value];
  $('#cTitle').textContent = `${({ new: 'Publish', retry: 'Retry', again: 'Publish again' })[mode]}: ${box.question}`;
  $('#cText').textContent = mode === 'retry'
    ? `${box.posted.ok} of ${box.posted.total} parts went out last time. This sends only the rest to ${targets}, ${timing}. Nothing is posted twice.`
    : mode === 'again'
      ? `This sends the video, reel and carousel to ${targets} once more, ${timing}, including the parts that are already out, so they will appear twice.`
      : `This posts the video, reel and carousel to ${targets}, ${timing}.`;
  $('#againRow').hidden = mode !== 'again'; $('#again').checked = false;
  $('#cGo').textContent = mode === 'retry' ? 'Retry' : mode === 'again' ? 'Publish again' : 'Publish';
  const dlg = $('#confirm');
  const split = (data.settings.channel || 'split') === 'split';
  $('#routes').hidden = !split; $('#remember').parentElement.hidden = !split;
  if (split) loadRoutes(box.slug);
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'go' && dlg.returnValue !== 'dry') return;
    const routes = split ? chosenRoutes() : null;
    if (routes && $('#remember').checked && dlg.returnValue === 'go') {
      await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: { ...(data.settings.routes || {}), ...routes } }) }).catch(() => {});
    }
    if (dlg.returnValue === 'go') {
      // Real publishing runs on the server, one box at a time, so you can queue more meanwhile.
      if (await enqueue([{ slug: box.slug, mode, when: $('#when').value, routes }])) { flash('Queued. It publishes in the background; the card shows progress.'); load(); }
    }
    if (dlg.returnValue === 'dry') publish(box.slug, { dry: true, force: true, all: mode === 'again', routes });
  };
  dlg.showModal();
});
$('#cGo').addEventListener('click', (e) => { if (!$('#againRow').hidden && !$('#again').checked) { e.preventDefault(); $('#again').focus(); $('#againRow').classList.add('need'); } });

$('#auto').addEventListener('change', async (e) => {
  const on = e.target.checked;
  if (on && !confirm('Turn on auto-publish?\n\nFrom now on, every new box is posted to your channels as soon as it is ready. Boxes that are already ready stay for you to publish by hand.')) { e.target.checked = false; return; }
  await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: on }) });
  flash(on ? 'Auto-publish is on.' : 'Auto-publish is off.');
  load();
});
$('#when').addEventListener('change', async (e) => {
  await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ when: e.target.value }) });
  flash('Saved.');
});
$('#hootBtn').addEventListener('click', async (e) => {
  if (e.target.dataset.connected) {
    if (!confirm('Disconnect Hootsuite?')) return;
    await api('hootsuite/disconnect', { method: 'POST' }); return load();
  }
  const r = await (await api('hootsuite/connect', { method: 'POST' })).json();
  if (r.url) location.href = r.url; else flash(r.error || 'Could not reach Hootsuite.', true);
});
$('#spBtn').addEventListener('click', async (e) => {
  if (e.target.dataset.connected) {
    if (!confirm('Disconnect SocialPilot?')) return;
    await api('socialpilot/disconnect', { method: 'POST' }); return load();
  }
  const r = await (await api('socialpilot/connect', { method: 'POST' })).json();
  if (r.url) location.href = r.url; else flash(r.error || 'Could not reach SocialPilot.', true);
});
$('#hootUse').addEventListener('click', async () => {
  const to = (data.settings.channel || 'split') === 'split' ? 'hootsuite' : 'split';
  if (!confirm(to === 'hootsuite' ? 'Send everything through Hootsuite (SocialPilot off)?' : 'Videos through Hootsuite and the rest through SocialPilot?')) return;
  await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: to }) });
  flash(to === 'hootsuite' ? 'Everything goes through Hootsuite.' : 'Videos through Hootsuite, the rest through SocialPilot.'); load();
});
$('#q').addEventListener('input', renderList);
$('#bufOn').addEventListener('change', async (e) => {
  await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buffer: e.target.checked }) });
  flash(e.target.checked ? 'Buffer is on for networks Hootsuite lacks.' : 'Hootsuite only.'); load();
});

const qs = new URLSearchParams(location.search);
if (qs.get('socialpilot')) {
  flash(qs.get('socialpilot') === 'connected' ? 'SocialPilot is connected.' : `SocialPilot: ${qs.get('socialpilot')}`, qs.get('socialpilot') !== 'connected');
  history.replaceState(null, '', '/admin/');
}
if (qs.get('hootsuite')) {
  flash(qs.get('hootsuite') === 'connected' ? 'Hootsuite is connected.' : `Hootsuite: ${qs.get('hootsuite')}`, qs.get('hootsuite') !== 'connected');
  history.replaceState(null, '', '/admin/');
}
load().catch((e) => flash(e.message, true));
setInterval(() => { if (!busy && document.visibilityState === 'visible') load().catch(() => {}); }, 60e3);

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1600);
});

// ---- Schedule drafts: pick boxes, choose dates, and the server makes Hootsuite drafts for them.
const pickableBoxes = () => [...data.boxes].reverse().filter((x) => x.ready && (!x.scheduled || ['error', 'done'].includes(x.scheduled.state)));
const unpublished = () => pickableBoxes().filter((x) => !x.posted);
function paintPlan() {
  $('#planBar').hidden = !plan.on;
  $('#planBtn').setAttribute('aria-pressed', String(plan.on));
  $('#planBtn').textContent = plan.on ? 'Choosing boxes…' : 'Select boxes…';
  $('#pbCount').textContent = `${plan.sel.size} selected`;
  $('#pbReview').disabled = !plan.sel.size; $('#pbPublish').disabled = !plan.sel.size;
  document.body.classList.toggle('planning', plan.on);
  renderList();
}
$('#planBtn').addEventListener('click', () => {
  plan.on = !plan.on;
  if (plan.on && !$('#pbStart').value) { const t = new Date(); t.setDate(t.getDate() + 1); $('#pbStart').value = ymd(t); }
  paintPlan();
});
$('#pbClose').addEventListener('click', () => { plan.on = false; plan.sel.clear(); paintPlan(); });
$('#pbPublish').addEventListener('click', async () => {
  const order = pickableBoxes().filter((x) => plan.sel.has(x.slug));   // oldest box first
  if (!order.length) return;
  if (!confirm(`Publish ${order.length} box${order.length > 1 ? 'es' : ''} using your saved choices of where each post goes? They go out one by one in the background.`)) return;
  if (await enqueue(order.map((x) => ({ slug: x.slug, mode: x.posted ? 'retry' : 'new', when: $('#when').value })))) {
    flash(`${order.length} queued to publish. Each card shows its progress.`);
    plan.on = false; plan.sel.clear(); paintPlan(); load();
  }
});
$('#planBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
    if (b.dataset.pick === 'none') plan.sel.clear();
  else if (b.dataset.pick === 'all') unpublished().forEach((x) => plan.sel.add(x.slug));
  else unpublished().map((x) => x.slug).filter((s) => !plan.sel.has(s)).slice(0, +b.dataset.pick).forEach((s) => plan.sel.add(s));
  paintPlan();
});
$('#list').addEventListener('change', (e) => {
  const c = e.target.closest('[data-pick-box]'); if (!c) return;
  c.checked ? plan.sel.add(c.dataset.pickBox) : plan.sel.delete(c.dataset.pickBox);
  paintPlan();
});
$('#list').addEventListener('click', async (e) => {
  const u = e.target.closest('[data-unqueue]'); if (!u) return;
  await api('schedule/' + encodeURIComponent(u.dataset.unqueue), { method: 'DELETE' });
  load();
});
$('#pbReview').addEventListener('click', () => {
  const [y, m, d] = $('#pbStart').value.split('-').map(Number);
  const [hh, mm] = ($('#pbTime').value || '18:30').split(':').map(Number);
  const every = +$('#pbEvery').value;
  const order = pickableBoxes().filter((x) => plan.sel.has(x.slug));   // oldest box first
  $('#planList').innerHTML = order.map((x, i) => {
    const t = new Date(y, m - 1, d + i * every, hh, mm);
    return `<li style="--c:${esc(x.color)}"><span class="no">${x.kind === 'principle' ? '' : 'No. '}${esc(x.no)}</span><span class="q">${esc(x.question)}</span><input type="datetime-local" data-at="${esc(x.slug)}" value="${ymd(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}"></li>`;
  }).join('');
  $('#planGo').textContent = `Make ${order.length} draft${order.length > 1 ? 's' : ''}`;
  const dlg = $('#planDlg');
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'go') return;
    const items = [...document.querySelectorAll('#planList [data-at]')].map((i) => ({ slug: i.dataset.at, at: new Date(i.value).toISOString() }));
    const r = await api('schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return flash(j.error || 'Could not schedule those.', true);
    flash(`${items.length} draft${items.length > 1 ? 's are' : ' is'} queued. They're made one by one; each card shows its progress.`);
    plan.on = false; plan.sel.clear(); paintPlan(); load();
  };
  dlg.showModal();
});
// Check more often while drafts are being made.
setInterval(() => { if (!busy && document.visibilityState === 'visible' && data?.boxes.some((x) => x.scheduled && (x.scheduled.state === 'queued' || x.scheduled.state === 'running'))) load().catch(() => {}); }, 10e3);
