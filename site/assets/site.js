// Progressive enhancements for every hub page. Every page works without this
// file. Nothing here stores or sends anything about the visitor (analytics
// live separately in /assets/analytics.js).
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let toastEl;
  const toast = (msg) => {
    toastEl ||= Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
    document.body.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('on'), 1800);
  };

  // ---------------------------------------------------------------- search palette
  // Searches boxes, their concepts and the site's pages, using /apps.json from
  // this domain. Queries never leave the browser.
  const pal = $('#palette'), input = $('#paletteInput'), list = $('#paletteList');
  let index = null, results = [], sel = 0, lastFocus = null, suggest = '#';
  const PAGES = [
    { kind: 'Pages', title: 'The shelf', sub: 'Every box so far', url: '/#shelf' },
    { kind: 'Pages', title: 'Concepts A–Z', sub: 'Every term we define', url: '/concepts/' },
    { kind: 'Pages', title: 'Calendar', sub: 'One box a day, for a year', url: '/#calendar' },
    { kind: 'Pages', title: 'Every history', sub: 'One timeline for everything we have opened', url: '/history/' },
    { kind: 'Pages', title: 'Privacy', sub: 'What we measure and why', url: '/privacy/' },
    { kind: 'Pages', title: 'Terms and licences', sub: 'MIT code, CC BY 4.0 explanations', url: '/terms/' },
  ];
  async function loadIndex() {
    if (index) return index;
    const [data, hist] = await Promise.all([
      fetch('/apps.json').then((r) => r.json()).catch(() => ({ apps: [] })),
      fetch('/history-index.json').then((r) => r.json()).catch(() => []),
    ]);
    if (data.org) suggest = `https://github.com/${data.org}/${data.hubRepo}/issues/new?template=box-idea.yml&title=${encodeURIComponent('Box idea: ')}`;
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    index = [
      ...data.apps.map((a) => ({ kind: 'Boxes', title: a.question, sub: `No. ${a.no} · ${a.title} · ${a.fieldLabel}`, url: a.pageUrl, c: a.color,
        hay: [a.question, a.title, a.fieldLabel, a.hook, ...(a.tags || []), ...(a.explainer || []).map((b) => b.title)].join(' ').toLowerCase() })),
      ...data.apps.flatMap((a) => (a.concepts || []).map((c) => ({ kind: 'Concepts', title: c.term, sub: `${c.def}`, url: `/concepts/#${slug(c.term)}`, c: a.color,
        hay: (c.term + ' ' + c.def).toLowerCase(), term: c.term.toLowerCase() }))),
      ...data.apps.flatMap((a) => (a.explainer || []).map((b, i) => ({ kind: 'Ideas', title: b.title, sub: `No. ${a.no} · ${a.question}`, url: a.pageUrl, c: a.color,
        hay: (b.title + ' ' + b.text).toLowerCase() }))),
      ...hist.map((h) => ({ kind: 'History', title: `${h.d}: ${h.t}`, sub: [h.w, h.p, h.b].filter(Boolean).join(' · '), url: h.u, c: h.c,
        hay: [h.t, h.d, h.w, h.p, String(h.y)].join(' ').toLowerCase() })),
      ...PAGES.map((p) => ({ ...p, hay: (p.title + ' ' + p.sub).toLowerCase() })),
    ];
    return index;
  }
  function score(item, q, words) {
    if (!q) return item.kind === 'Boxes' ? 3 : item.kind === 'Pages' ? 1 : 0;
    if (!words.every((w) => item.hay.includes(w))) return 0;
    const t = item.title.toLowerCase();
    return (t === q ? 50 : 0) + (t.startsWith(q) ? 20 : 0) + (t.includes(q) ? 10 : 0) + (item.kind === 'Boxes' ? 4 : item.kind === 'Concepts' ? 3 : 1);
  }
  const mark = (s, words) => {
    let out = esc(s);
    for (const w of words.filter((x) => x.length > 1)) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
    return out;
  };
  function render() {
    const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    const seen = new Set();
    results = index.map((it) => ({ it, s: score(it, q, words) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s).map((x) => x.it)
      .filter((it) => { const k = it.kind + it.url + it.title; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 14);
    const order = ['Boxes', 'Concepts', 'History', 'Ideas', 'Pages'];
    results.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    sel = 0;
    if (!results.length) {
      list.innerHTML = `<li class="none">Nothing inside yet for “${esc(input.value)}”.<br><a href="${esc(suggest.replace(/title=[^&]*/, 'title=' + encodeURIComponent('Box idea: ' + input.value)))}" rel="noopener" target="_blank">Suggest it as a future box →</a></li>`;
      return;
    }
    let html = '', grp = '';
    results.forEach((r, i) => {
      if (r.kind !== grp) { grp = r.kind; html += `<li class="grp" role="presentation">${grp}</li>`; }
      html += `<li role="presentation"><a role="option" id="opt-${i}" href="${esc(r.url)}" aria-selected="${i === 0}" style="--c:${esc(r.c || '#8ef0ff')}"><span class="sw"></span><span class="t"><b>${mark(r.title, words)}</b><small>${esc(r.sub)}</small></span></a></li>`;
    });
    list.innerHTML = html;
    input.setAttribute('aria-activedescendant', 'opt-0');
  }
  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    $$('a[role="option"]', list).forEach((a, i) => a.setAttribute('aria-selected', i === sel));
    const a = $(`#opt-${sel}`); a?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `opt-${sel}`);
  }
  async function openSearch(q = '') {
    if (!pal) return;
    lastFocus = document.activeElement;
    pal.hidden = false;
    document.body.style.overflow = 'hidden';
    input.value = q;
    input.focus();
    await loadIndex();
    render();
  }
  function closeSearch() {
    if (!pal || pal.hidden) return;
    pal.hidden = true;
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  }
  if (pal) {
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); location.href = results[sel].url; closeSearch(); }
      else if (e.key === 'Escape') closeSearch();
    });
    pal.addEventListener('click', (e) => { if (e.target === pal) closeSearch(); if (e.target.closest('a')) closeSearch(); });
    $$('[data-open-search]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openSearch(b.dataset.openSearch || ''); }));
    const hero = $('.hero-search input');
    hero?.addEventListener('focus', () => { hero.blur(); openSearch(); });
    const q = new URLSearchParams(location.search).get('q');
    if (q) openSearch(q);
  }

  // ---------------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); pal?.hidden ? openSearch() : closeSearch(); return; }
    if (e.key === 'Escape') closeSearch();
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !pal?.hidden) return;
    const main = $('main[data-prev]');
    if (main && e.key === 'ArrowLeft' && main.dataset.prev) location.href = main.dataset.prev;
    if (main && e.key === 'ArrowRight' && main.dataset.next) location.href = main.dataset.next;
  });

  // ---------------------------------------------------------------- the cube
  // Starts as a black box, turns to glass, and can be dragged around.
  const scene = $('[data-cube]');
  if (scene) {
    const cube = $('.cube', scene), hint = $('.drag-hint');
    let rx = -18, ry = 32, vx = 0, vy = reduce ? 0 : 0.12, drag = null, last = performance.now();
    if (!reduce) { scene.classList.add('black'); setTimeout(() => scene.classList.remove('black'), 900); }
    const apply = () => { scene.style.setProperty('--rx', rx + 'deg'); scene.style.setProperty('--ry', ry + 'deg'); cube.style.setProperty('--rx', rx + 'deg'); cube.style.setProperty('--ry', ry + 'deg'); };
    scene.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx, ry }; scene.setPointerCapture(e.pointerId); hint?.classList.add('gone'); });
    scene.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const nry = drag.ry + (e.clientX - drag.x) * 0.4, nrx = Math.max(-60, Math.min(40, drag.rx - (e.clientY - drag.y) * 0.3));
      vy = (nry - ry) * 0.5; vx = (nrx - rx) * 0.5; ry = nry; rx = nrx; apply();
    });
    const end = () => { drag = null; };
    scene.addEventListener('pointerup', end); scene.addEventListener('pointercancel', end);
    const tick = (now) => {
      const dt = Math.min(50, now - last); last = now;
      if (!drag && !document.hidden) {
        vy += ((reduce ? 0 : 0.12) - vy) * 0.02; vx *= 0.94;
        ry += vy * dt / 16; rx = Math.max(-60, Math.min(40, rx + vx * dt / 16));
        rx += (-18 - rx) * 0.01;
        apply();
      }
      requestAnimationFrame(tick);
    };
    apply();
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- scroll reveals
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.25 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

  // ---------------------------------------------------------------- shelf
  const grid = $('#grid');
  if (grid) {
    const chips = $$('.chip[data-filter]'), search = $('#shelfSearch'), sortBtn = $('#sortBtn'), empty = $('#shelfEmpty');
    const items = () => $$('.card, .case', grid);
    const params = new URLSearchParams(location.search);
    let field = params.get('f') || 'all', newest = true;
    if (!chips.some((c) => c.dataset.filter === field)) field = 'all';
    const apply = () => {
      const q = (search?.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      items().forEach((c) => {
        const sealedCard = c.hasAttribute('data-sealed');
        const ok = sealedCard ? field === 'all' && !q.length : (field === 'all' || c.dataset.field === field) && q.every((w) => c.dataset.hay.includes(w));
        c.hidden = !ok;
        if (ok && !sealedCard) shown++;
      });
      chips.forEach((c) => { const on = c.dataset.filter === field; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      empty.hidden = shown > 0;
      const u = new URL(location.href);
      field === 'all' ? u.searchParams.delete('f') : u.searchParams.set('f', field);
      history.replaceState(null, '', u);
    };
    chips.forEach((c) => c.addEventListener('click', () => { field = c.dataset.filter; apply(); }));
    search?.addEventListener('input', apply);
    sortBtn?.addEventListener('click', () => {
      newest = !newest;
      sortBtn.textContent = newest ? 'Newest first' : 'Oldest first';
      const cards = $$('.card:not([data-sealed])', grid).sort((a, b) => (newest ? b.dataset.box - a.dataset.box : a.dataset.box - b.dataset.box));
      const sealedCards = $$('.card[data-sealed]', grid);
      [...cards, ...sealedCards].forEach((c) => grid.appendChild(c));
    });
    apply();
  }

  // ---------------------------------------------------------------- laws and principles
  // A law opens in a modal first (formula, idea, everyday examples linked to their boxes),
  // then asks whether to open the full principle box.
  const lawJson = $('#lawsData'), dlg = $('#lawModal');
  if (lawJson && dlg && typeof dlg.showModal === 'function') {
    let laws = {};
    try { laws = JSON.parse(lawJson.textContent); } catch { /* no data */ }
    const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const open = (slug) => {
      const L = laws[slug];
      if (!L) return false;
      dlg.style.setProperty('--c', L.color);
      $('#lawBody').innerHTML = `
        <p class="lm-kicker"><span>${e(L.type)} ${e(L.no.slice(1))}</span><span>${e(L.fieldLabel)}</span></p>
        <div class="lm-top">
          <div class="lm-text">
            <h2 id="lawName">${e(L.name)}</h2>
            ${L.formula ? `<p class="lm-formula">${e(L.formula)}</p>` : ''}
            ${L.formulaNote ? `<p class="lm-note">${e(L.formulaNote)}</p>` : ''}
            <p class="lm-idea">${e(L.idea)}</p>
            ${L.discovered ? `<p class="lm-disc">${e(L.discovered)}${L.historyUrl ? ` · <a href="${e(L.historyUrl)}">the history</a>` : ''}</p>` : ''}
          </div>
          <div class="lm-visual">${L.still ? `<img src="${e(L.still)}" alt="">` : `<div class="lm-art">${L.art}</div>`}</div>
        </div>
        ${L.examples.length ? `<h3 class="lm-h">Where you see it</h3><ul class="lm-examples">${L.examples.map((x) => `<li style="--c:${e(x.box?.color || L.color)}"><b>${e(x.title)}</b><span>${e(x.text)}</span>${x.box ? `<a href="${e(x.box.pageUrl)}">See it in ${e(x.box.title)} →</a>` : ''}</li>`).join('')}</ul>` : ''}`;
      $('#lawOpen').href = L.appUrl;
      $('#lawOpen').textContent = `Yes, open ${L.name}`;
      dlg.showModal();
      dlg.scrollTop = 0;
      return true;
    };
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-law]');
      if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
      if (open(a.dataset.law)) ev.preventDefault();
    });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
    // Law filters
    const lchips = $$('.chip[data-lfilter]'), lgrid = $('#lawGrid');
    lchips.forEach((c) => c.addEventListener('click', () => {
      const f = c.dataset.lfilter;
      lchips.forEach((x) => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      $$('.case', lgrid).forEach((k) => { k.hidden = f !== 'all' && k.dataset.field !== f; });
    }));
    if (location.hash.startsWith('#law-')) open(location.hash.slice(5));
  }

  // ---------------------------------------------------------------- cabinet tilt
  // Cases lean towards the pointer and a sheen follows it, like a glass case catching light.
  if (!reduce && matchMedia('(hover: hover)').matches) {
    $$('[data-tilt]').forEach((el) => {
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        const k = el.classList.contains('feature') ? 4 : 7;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.setProperty('--ry', ((x - 0.5) * k).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((0.5 - y) * k).toFixed(2) + 'deg');
          el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  // ---------------------------------------------------------------- history
  // The sticky strip follows the reader: the current moment's dot lights up and
  // the year counter shows its date.
  const hstrip = $('[data-strip]');
  if (hstrip && 'IntersectionObserver' in window) {
    const dots = $$('.h-dot', hstrip), byId = new Map(dots.map((d) => [d.getAttribute('href').slice(1), d]));
    const yearEl = $('[data-now-year]', hstrip), eraEl = $('[data-now-era]', hstrip);
    let current = null;
    const setOn = (el) => {
      if (!el || el === current) return;
      current?.classList.remove('on'); byId.get(current?.id)?.classList.remove('on');
      current = el; el.classList.add('on');
      const d = byId.get(el.id);
      if (d) { d.classList.add('on'); d.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      yearEl.textContent = el.dataset.year; if (eraEl) eraEl.textContent = el.dataset.era;
    };
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setOn(vis[0].target);
    }, { rootMargin: '-35% 0px -55% 0px' });
    $$('.h-event').forEach((el) => io.observe(el));
    dots.forEach((d) => d.addEventListener('mouseenter', () => { yearEl.textContent = d.dataset.year; if (eraEl) eraEl.textContent = d.dataset.era; }));
    hstrip.addEventListener('mouseleave', () => { if (current) { yearEl.textContent = current.dataset.year; if (eraEl) eraEl.textContent = current.dataset.era; } });
  }
  $$('[data-hfilter]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.hfilter;
    $$('[data-hfilter]').forEach((x) => x.classList.toggle('on', x === b));
    $$('.h-wrap').forEach((w) => { w.hidden = f !== 'all' && w.dataset.box !== f; });
    $$('.h-dot').forEach((d) => { d.hidden = f !== 'all' && !d.getAttribute('href').startsWith('#' + f + '-'); });
  }));

  // Concepts page filter.
  const cs = $('#conceptSearch');
  if (cs) cs.addEventListener('input', () => {
    const q = cs.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    $$('.concept').forEach((c) => { const ok = q.every((w) => c.dataset.hay.includes(w)); c.hidden = !ok; if (ok) n++; });
    $$('.az-group').forEach((g) => { g.hidden = !$$('.concept', g).some((c) => !c.hidden); });
    $('#conceptEmpty').hidden = n > 0;
  });

  // ---------------------------------------------------------------- media & sharing
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const data = { title: b.dataset.title, url: b.dataset.url };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(data.url); toast('Link copied'); } catch { prompt('Copy this link', data.url); }
  }));
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1500); } catch { /* ignore */ }
  }));
  // The live app loads only when asked, so the page itself stays light.
  const frame = (src) => Object.assign(document.createElement('iframe'), { src, className: 'live', title: 'Interactive box', allow: 'fullscreen' });
  $$('.try').forEach((t) => $('.btn', t).addEventListener('click', () => t.replaceWith(frame(t.dataset.src))));
  $$('.try-inline').forEach((b) => b.addEventListener('click', () => {
    const v = b.parentElement.querySelector('video');
    (v || b).replaceWith(frame(b.dataset.src));
    if (v) b.remove();
  }));
  // YouTube connects only after a click, and through the no-cookie domain.
  $$('.yt[data-yt]').forEach((y) => $('.btn', y).addEventListener('click', () => {
    y.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(y.dataset.yt)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`;
  }));
  $$('[data-sound]').forEach((b) => b.addEventListener('click', () => {
    const v = b.parentElement.querySelector('video');
    v.muted = !v.muted; if (!v.muted) v.play();
    b.textContent = v.muted ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-label', v.muted ? 'Unmute' : 'Mute');
  }));
  // Reels play (muted) while on screen, and only then download.
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.35 });
    $$('video.reel').forEach((v) => io.observe(v));
  }
})();
