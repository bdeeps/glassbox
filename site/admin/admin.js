// Glassbox Admin: pick a box, press Publish. Or switch on auto-publish and do nothing at all.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let data = null, busy = false;

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
  $('#hootSub').textContent = !h.connected ? 'Not connected. Instagram, Facebook, LinkedIn, X and TikTok posts become ready-to-go drafts in your Hootsuite Planner.'
    : h.needWorkspace ? 'Connected. Pick the workspace to use:'
    : h.error ? `Connected (${h.workspace || 'no workspace'}), but: ${h.error}`
    : h.profiles.length ? `${h.workspace}: ${h.profiles.map((p) => `${p.name} (${p.service || p.type})`).join(', ')}. Posts arrive as drafts in your Planner.` : `${h.workspace}: no social profiles in this workspace yet.`;
  const ws = $('#hootWs');
  ws.hidden = !h.needWorkspace;
  if (h.needWorkspace) ws.innerHTML = `<select id="wsSel">${h.workspaces.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select><button class="btn small primary" type="button" id="wsGo">Use this workspace</button>`;
  const b = data.buffer;
  $('#bufSub').textContent = !b.ok ? `Buffer: ${b.error}` : b.list.length ? `Connected: ${b.list.map((c) => `${c.name} (${c.service})`).join(', ')}` : 'No channels connected in Buffer yet (connect YouTube at buffer.com).';

  renderList();
  $('#activity').innerHTML = data.log.map((l) => `<li class="${l.ok === false ? 'bad' : ''}"><time>${when(l.at)}</time> ${l.slug ? `<b>${esc(l.slug)}</b> ` : ''}${esc(l.message)}${l.provider ? ` <span class="pill">${esc(l.provider)}</span>` : ''}</li>`).join('') || '<li class="empty-a">Nothing yet.</li>';
}

function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  const rows = data.boxes.filter((x) => !q || `${x.no} ${x.title} ${x.question} ${x.slug}`.toLowerCase().includes(q));
  $('#list').innerHTML = rows.map((x) => {
    const state = x.posted ? `<span class="st ok">Published ${when(x.posted.at)}${x.posted.by === 'auto' ? ' (auto)' : ''} · ${x.posted.ok}/${x.posted.total}</span>`
      : x.ready ? '<span class="st ready">Ready</span>' : `<span class="st no">${esc(x.why)}</span>`;
    return `<li style="--c:${esc(x.color)}"><span class="no">${x.kind === 'principle' ? '' : 'No. '}${esc(x.no)}</span>
      <span class="t"><b>${esc(x.question)}</b>${state}</span>
      <button class="btn small ${x.posted ? 'ghost' : 'primary'}" data-slug="${esc(x.slug)}" ${x.ready ? '' : 'disabled'}>${x.posted ? 'Publish again' : 'Publish'}</button></li>`;
  }).join('') || '<li class="empty-a">No box matches.</li>';
}

async function publish(slug, { dry, force }) {
  if (busy) return;
  busy = true;
  const out = $('#out');
  out.hidden = false; out.textContent = '';
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.querySelectorAll('#list button').forEach((b) => { b.disabled = true; });
  try {
    const res = await api(`publish/${encodeURIComponent(slug)}?${new URLSearchParams({ dry: dry ? '1' : '0', force: force ? '1' : '0', when: $('#when').value })}`, { method: 'POST' });
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; out.textContent += dec.decode(value, { stream: true }); out.scrollTop = out.scrollHeight; }
    const failed = /\n?✗ /.test(out.textContent) && !/done:/.test(out.textContent);
    flash(dry ? 'Preview only: nothing was sent.' : failed ? 'Publishing failed: see the log below.' : 'Published.', failed);
  } catch (e) { flash(e.message, true); }
  busy = false;
  await load();
}

$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-slug]');
  if (!btn) return;
  const box = data.boxes.find((x) => x.slug === btn.dataset.slug);
  const targets = [data.hootsuite.connected && 'Hootsuite', data.buffer.list.length && 'Buffer'].filter(Boolean).join(' and ') || 'your channels';
  $('#cTitle').textContent = `Publish ${box.question}`;
  $('#cText').textContent = `This posts the video, reel and carousel to ${targets}, ${({ auto: 'at its planned time', queue: 'in the next free slot', now: 'right away' })[$('#when').value]}.`;
  $('#againRow').hidden = !box.posted; $('#again').checked = false;
  const dlg = $('#confirm');
  dlg.onclose = () => {
    if (dlg.returnValue === 'go') publish(box.slug, { dry: false, force: box.posted && $('#again').checked });
    if (dlg.returnValue === 'dry') publish(box.slug, { dry: true, force: true });
  };
  dlg.showModal();
});
$('#cGo').addEventListener('click', (e) => { if (!$('#againRow').hidden && !$('#again').checked) { e.preventDefault(); $('#again').focus(); flash('Tick "Publish again" to post this box a second time.', true); } });

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
$('#hootWs').addEventListener('click', async (e) => {
  if (e.target.id !== 'wsGo') return;
  const r = await (await api('hootsuite/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: $('#wsSel').value }) })).json();
  flash(r.ok ? 'Workspace saved.' : r.error, !r.ok); load();
});

const qs = new URLSearchParams(location.search);
if (qs.get('hootsuite')) {
  flash(qs.get('hootsuite') === 'connected' ? 'Hootsuite is connected.' : `Hootsuite: ${qs.get('hootsuite')}`, qs.get('hootsuite') !== 'connected');
  history.replaceState(null, '', '/admin/');
}
load().catch((e) => flash(e.message, true));
setInterval(() => { if (!busy && document.visibilityState === 'visible') load().catch(() => {}); }, 60e3);
