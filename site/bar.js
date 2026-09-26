// The Glassbox bar: a small pill every box loads with <script src="/bar.js" defer>.
// It links the app back to its explainer and source. Lives in a shadow root so
// it can't clash with the app's own CSS. Hidden when framed or recording.
(() => {
  if (window.top !== window.self || /[?&]reel\b/.test(location.search) || document.getElementById('glassbox-bar')) return;
  const slug = location.pathname.split('/')[1];
  if (!slug) return;
  const KEY = 'glassbox.bar.min';
  let min = false;
  try { min = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }

  fetch('/apps.json').then((r) => (r.ok ? r.json() : null)).then((idx) => {
    const a = idx?.apps?.find((x) => x.slug === slug);
    if (!a) return;
    const host = Object.assign(document.createElement('div'), { id: 'glassbox-bar' });
    const root = host.attachShadow({ mode: 'open' });
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    root.innerHTML = `<style>
      :host { all: initial; position: fixed; left: 12px; bottom: 12px; z-index: 2147483000; font: 500 13px/1 'Geist', ui-sans-serif, system-ui, sans-serif; }
      .bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: rgba(7,8,12,.78); color: #eef0f6;
        border: 1px solid rgba(255,255,255,.16); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 30px rgba(0,0,0,.4); }
      a, button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: inherit; white-space: nowrap; }
      a:hover, button:hover { background: rgba(255,255,255,.1); }
      a:focus-visible, button:focus-visible { outline: 2px solid #8ef0ff; }
      svg { width: 18px; height: 18px; }
      .no { font-family: 'Geist Mono', ui-monospace, monospace; color: ${esc(a.color)}; }
      .min .x { display: none; }
      @media (max-width: 520px) { .x.opt { display: none; } }
    </style>
    <div class="bar ${min ? 'min' : ''}">
      <button class="home" title="${min ? 'Show' : 'Hide'} the Glassbox bar" aria-label="Glassbox"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 56 18v28L32 59 8 46V18Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="31" r="8" fill="${esc(a.color)}"/></svg><span class="x no">No. ${esc(a.no)}</span></button>
      <a class="x" href="/e/${esc(a.slug)}/">How it works</a>
      <a class="x opt" href="${esc(a.repo)}" target="_blank" rel="noopener">Source</a>
      <a class="x opt" href="/">All boxes</a>
    </div>`;
    root.querySelector('.home').addEventListener('click', () => {
      const bar = root.querySelector('.bar');
      bar.classList.toggle('min');
      try { localStorage.setItem(KEY, bar.classList.contains('min') ? '1' : '0'); } catch { /* ignore */ }
    });
    document.body.appendChild(host);
  }).catch(() => {});
})();
