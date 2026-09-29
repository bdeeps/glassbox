// The Glassbox bar: a small pill every box loads with <script src="/bar.js" defer>.
// It links the app back to its explainer and source, and loads the site's
// analytics. Lives in a shadow root so it can't clash with the app's own CSS.
// Does nothing when framed or recording.
(() => {
  if (window.top !== window.self || /[?&]reel\b/.test(location.search) || document.getElementById('glassbox-bar')) return;
  // The same analytics as the rest of glassbox.how (see /privacy/). Boxes don't load it themselves.
  const a = document.createElement('script');
  a.src = '/assets/analytics.js'; a.defer = true;
  document.head.appendChild(a);
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
    // WhatsApp: a plain wa.me link with an invitation to try it and pass it on.
    const wa = 'https://wa.me/?text=' + encodeURIComponent(`🔍 ${a.question}\n\n${a.hook ? a.hook + '\n\n' : ''}Don't just read about it: play with it. This free 3D explainer from Glassbox lets you take it apart and watch it work. No sign-up, no ads.\n\n👧🧒 Share it with a kid, a student or a curious friend who'd love this 👇\n${location.origin}${a.pageUrl || '/e/' + a.slug + '/'}`);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    root.innerHTML = `<style>
      :host { all: initial; position: fixed; left: 12px; bottom: 12px; z-index: 2147483000; font: 500 13px/1 'Geist', ui-sans-serif, system-ui, sans-serif; }
      .bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: rgba(7,8,12,.78); color: #eef0f6;
        border: 1px solid rgba(255,255,255,.16); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 30px rgba(0,0,0,.4); }
      a, button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: inherit; white-space: nowrap; }
      a:hover, button:hover { background: rgba(255,255,255,.1); }
      a:focus-visible, button:focus-visible { outline: 2px solid #8ef0ff; }
      svg { width: 18px; height: 18px; }
      .hist svg { width: 15px; height: 15px; }
      .no { font-family: 'Geist Mono', ui-monospace, monospace; color: ${esc(a.color)}; }
      .min .x { display: none; }
      @media (max-width: 520px) { .x.opt { display: none; } }
    </style>
    <div class="bar ${min ? 'min' : ''}">
      <button class="home" title="${min ? 'Show' : 'Hide'} the Glassbox bar" aria-label="Glassbox"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 56 18v28L32 59 8 46V18Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="31" r="8" fill="${esc(a.color)}"/></svg><span class="x no">No. ${esc(a.no)}</span></button>
      <a class="x" href="/e/${esc(a.slug)}/">How it works</a>
      ${a.historyUrl ? `<a class="x hist" href="${esc(a.historyUrl)}" title="${esc(a.history?.title || 'History')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="${esc(a.color)}" stroke-width="2" stroke-linecap="round"/></svg>History</a>` : ''}
      <a class="x wa" href="${esc(wa)}" target="_blank" rel="noopener" title="Share on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25d366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z"/></svg>Share</a>
      <a class="x opt" href="${esc(a.repo)}" target="_blank" rel="noopener">Source</a>
      <a class="x opt" href="/">All boxes</a>
      <a class="x opt" href="/privacy/" data-choices>Privacy</a>
    </div>`;
    root.querySelector('[data-choices]').addEventListener('click', (e) => {
      if (window.glassboxPrivacyChoices) { e.preventDefault(); window.glassboxPrivacyChoices(); }
    });
    root.querySelector('.home').addEventListener('click', () => {
      const bar = root.querySelector('.bar');
      bar.classList.toggle('min');
      try { localStorage.setItem(KEY, bar.classList.contains('min') ? '1' : '0'); } catch { /* ignore */ }
    });
    document.body.appendChild(host);
  }).catch(() => {});
})();
