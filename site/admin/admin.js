// Glassbox Admin: pick a box, press Publish. Or switch on auto-publish and do nothing at all.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let data = null, busy = false;
const plan = { on: false, sel: new Set() };
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

  const h = data.hootsuite;
  $('#hootBtn').textContent = h.connected ? 'Disconnect' : 'Connect Hootsuite';
  $('#hootBtn').dataset.connected = h.connected ? '1' : '';
  $('#hootSub').textContent = !h.connected ? 'Not connected. Connect to publish to every network you have in Hootsuite.'
    : h.error ? `Connected, but: ${h.error}`
    : h.profiles.length ? `YouTube posts arrive as drafts in your Hootsuite Planner (press Schedule); the rest publish automatically. Profiles: ${h.profiles.map((p) => `${p.service || p.type}${p.name && p.name !== p.service ? ' (' + p.name + ')' : ''}${p.reauth ? ' (reconnect it in Hootsuite)' : ''}`).join(', ')}. Add Instagram, LinkedIn and the rest in Hootsuite and they appear here.` : 'Connected, but no social profiles in your Hootsuite account yet.';
  const b = data.buffer;
  $('#bufOn').checked = !!s.buffer;
  $('#buf .pill').textContent = s.buffer ? 'on' : 'off';
  if (!s.buffer) $('#bufSub').textContent = 'Off: Hootsuite only. Switch on to send networks Hootsuite lacks to Buffer.'; else $('#bufSub').textContent = !b.ok ? `Buffer: ${b.error}` : b.list.length ? `Connected: ${b.list.map((c) => `${c.name} (${c.service})`).join(', ')}` : 'No channels connected in Buffer yet (connect YouTube at buffer.com).';

  const tr = data.tracking || {};
  $('#tagCard').hidden = !tr.gtm;
  if (tr.gtm) {
    $('#tagSub').innerHTML = `Container <code>${esc(tr.gtm)}</code> is on every page of the site and every box. It loads with the same consent rules as Google Analytics (after “Allow” in the EU/UK, never with a privacy signal) and never on localhost or while recording.`;
    $('#tagHead').textContent = tr.snippets.head; $('#tagBody').textContent = tr.snippets.body;
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
    const S = x.scheduled, pickable = plan.on && x.ready && !x.posted && (!S || S.state === 'error');
    const sched = S ? `<span class="sch ${esc(S.state)}">${S.state === 'queued' ? `Draft queued for ${esc(day(S.at))}` : S.state === 'running' ? `Making the draft for ${esc(day(S.at))}…` : S.state === 'done' ? `Draft ready for ${esc(day(S.at))}` : `Draft failed: ${esc(S.error || 'unknown error')}`}${S.state === 'queued' || S.state === 'error' ? ` <button type="button" class="unq" data-unqueue="${esc(x.slug)}" aria-label="Remove from the schedule">×</button>` : ''}</span>`
      : x.posted?.draftFor ? `<span class="sch done">Draft for ${esc(day(x.posted.draftFor))}</span>` : '';
    return `<li style="--c:${esc(x.color)}" class="${L && !L.done ? 'busy' : ''}${plan.sel.has(x.slug) ? ' sel' : ''}${pickable ? ' pickable' : ''}" data-box="${esc(x.slug)}">${pickable ? `<label class="pick"><input type="checkbox" data-pick-box="${esc(x.slug)}"${plan.sel.has(x.slug) ? ' checked' : ''} aria-label="Choose ${esc(x.question)}"></label>` : ''}<span class="no">${x.kind === 'principle' ? '' : 'No. '}${esc(x.no)}</span>
      <span class="t"><b>${esc(x.question)}</b>${state}${sched}${act}</span>
      <span class="acts">${!x.posted
        ? `<button class="btn small primary" data-slug="${esc(x.slug)}" data-mode="new" ${x.ready ? '' : 'disabled'}>Publish</button>`
        : `${x.posted.ok < x.posted.total ? `<button class="btn small primary" data-slug="${esc(x.slug)}" data-mode="retry" ${x.ready ? '' : 'disabled'}>Retry the rest</button>` : ''}<button class="btn small ghost" data-slug="${esc(x.slug)}" data-mode="again" ${x.ready ? '' : 'disabled'}>Publish again</button>`}</span></li>`;
  }).join('') || '<li class="empty-a">No box matches.</li>';
}

async function publish(slug, { dry, force, all }) {
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
    const res = await api(`publish/${encodeURIComponent(slug)}?${new URLSearchParams({ dry: dry ? '1' : '0', force: force ? '1' : '0', all: all ? '1' : '0', when: $('#when').value })}`, { method: 'POST' });
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
  const targets = [data.hootsuite.connected && 'Hootsuite', data.settings.buffer && data.buffer.list.length && 'Buffer'].filter(Boolean).join(' and ') || 'your channels';
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
  dlg.onclose = () => {
    if (dlg.returnValue === 'go') publish(box.slug, { dry: false, force: mode !== 'new', all: mode === 'again' });
    if (dlg.returnValue === 'dry') publish(box.slug, { dry: true, force: true, all: mode === 'again' });
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
    if (!confirm('Disconnect Hootsuite? Posts will go to Buffer only.')) return;
    await api('hootsuite/disconnect', { method: 'POST' }); return load();
  }
  const r = await (await api('hootsuite/connect', { method: 'POST' })).json();
  if (r.url) location.href = r.url; else flash(r.error || 'Could not reach Hootsuite.', true);
});
$('#q').addEventListener('input', renderList);
$('#bufOn').addEventListener('change', async (e) => {
  await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buffer: e.target.checked }) });
  flash(e.target.checked ? 'Buffer is on for networks Hootsuite lacks.' : 'Hootsuite only.'); load();
});

const qs = new URLSearchParams(location.search);
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
const pickableBoxes = () => [...data.boxes].reverse().filter((x) => x.ready && !x.posted && (!x.scheduled || x.scheduled.state === 'error'));
function paintPlan() {
  $('#planBar').hidden = !plan.on;
  $('#planBtn').setAttribute('aria-pressed', String(plan.on));
  $('#planBtn').textContent = plan.on ? 'Choosing boxes…' : 'Schedule drafts…';
  $('#pbCount').textContent = `${plan.sel.size} selected`;
  $('#pbReview').disabled = !plan.sel.size;
  document.body.classList.toggle('planning', plan.on);
  renderList();
}
$('#planBtn').addEventListener('click', () => {
  plan.on = !plan.on;
  if (plan.on && !$('#pbStart').value) { const t = new Date(); t.setDate(t.getDate() + 1); $('#pbStart').value = ymd(t); }
  paintPlan();
});
$('#pbClose').addEventListener('click', () => { plan.on = false; plan.sel.clear(); paintPlan(); });
$('#planBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  const all = pickableBoxes().map((x) => x.slug);
  if (b.dataset.pick === 'none') plan.sel.clear();
  else if (b.dataset.pick === 'all') all.forEach((s) => plan.sel.add(s));
  else all.filter((s) => !plan.sel.has(s)).slice(0, +b.dataset.pick).forEach((s) => plan.sel.add(s));
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
