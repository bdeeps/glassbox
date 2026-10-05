// The swipe feed's extras. The page scrolls and snaps without this file; this adds the
// counter, slide dots, arrow keys, the short video, sharing, and coming back to where you
// were. Nothing about the visitor is stored except the last box seen, in this tab only.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const feed = $('.sw-feed'), cards = $$('.sw-card:not(.sw-end)'), count = $('#swCount');
  if (!feed || !cards.length) return;
  const get = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } };
  const jump = (el, smooth) => el && feed.scrollTo({ top: el.offsetTop, behavior: smooth ? 'smooth' : 'auto' });

  // Open on the box in the address, or where this tab left off.
  const want = decodeURIComponent(location.hash.slice(1)) || get('glassbox.swipe');
  const first = want && document.getElementById(want);
  if (first) jump(first, false);

  // Pictures: only the card on screen and its neighbours hold real images. A full-size slide
  // takes about 6 MB of memory once decoded, and a phone reloads the page when a tab holds
  // hundreds of them, so everything further away is emptied again.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const all = $$('.sw-card');
  const slideAt = new Map();                       // card → index of the slide showing
  const fill = (im) => { if (im && im.dataset.src && im.getAttribute('src') !== im.dataset.src) im.src = im.dataset.src; };
  const empty = (im) => { if (im.dataset.src && im.getAttribute('src') !== BLANK) im.src = BLANK; };
  function hold() {
    const at = all.indexOf(current);
    all.forEach((c, k) => {
      const ims = $$('.sw-strip img', c), far = Math.abs(k - at);
      if (far > 1) return ims.forEach(empty);
      const on = slideAt.get(c) || 0;
      // The card on screen keeps the slide showing and one each side; its neighbours just the one they will open on.
      ims.forEach((im, n) => (Math.abs(n - on) <= (far ? 0 : 1) ? fill(im) : empty(im)));
    });
  }

  // Which card is on screen: the counter, the Boxes/Laws tabs, the address, and the video.
  let current = null;
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || e.intersectionRatio < 0.6) continue;
      current = e.target;
      hold();
      const i = cards.indexOf(current);
      if (i >= 0) {
        // The active tab counts within its own kind: "Boxes 12/145".
        const kin = cards.filter((c) => c.dataset.kind === current.dataset.kind), tab = $(`.sw-top nav a[data-jump="${current.dataset.kind}"] small`);
        $$('.sw-top nav a small').forEach((sm) => { sm.textContent = sm.dataset.n ||= sm.textContent; });
        if (tab) tab.textContent = `${kin.indexOf(current) + 1}/${kin.length}`;
        count.textContent = `${current.getAttribute('aria-label')}: ${i + 1} of ${cards.length}`;
        clearTimeout(seen.t); seen.t = setTimeout(() => { try { history.replaceState(null, '', '#' + current.id); } catch { /* some browsers limit how often */ } }, 400);
        put('glassbox.swipe', current.id);
        $$('.sw-top nav a').forEach((a) => a.classList.toggle('on', a.dataset.jump === current.dataset.kind));
      }
    }
  }, { root: feed, threshold: [0.6] });
  $$('.sw-card').forEach((c) => seen.observe(c));
  // Fill the opening card straight away, without waiting for the observer's first report.
  current = first || cards[0]; hold();

  // Slide dots follow the sideways scroll.
  for (const c of cards) {
    const strip = $('.sw-strip', c), dots = $$('.sw-dots i', c);
    if (!strip || !dots.length) continue;
    let raf = 0;
    strip.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = strip.scrollLeft + strip.clientWidth / 2;
        let best = 0, d = Infinity;
        $$('img', strip).forEach((im, k) => { const x = Math.abs(im.offsetLeft + im.offsetWidth / 2 - mid); if (x < d) { d = x; best = k; } });
        dots.forEach((dot, k) => dot.classList.toggle('on', k === best));
        if (slideAt.get(c) !== best) { slideAt.set(c, best); if (c === current) hold(); }
      });
    }, { passive: true });
    // Tap the right or left third of a picture to move one slide (as on Instagram stories).
    strip.addEventListener('click', (e) => {
      const r = strip.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (x > 0.66 || x < 0.34) strip.scrollBy({ left: (x > 0.5 ? 1 : -1) * strip.clientWidth * 0.8, behavior: 'smooth' });
    });
  }

  // Arrow keys: up and down between boxes, left and right through slides.
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, dialog[open]')) return;
    const all = $$('.sw-card'), i = all.indexOf(current);
    if (['ArrowDown', 'PageDown', ' ', 'j'].includes(e.key)) { e.preventDefault(); jump(all[Math.min(all.length - 1, i + 1)], true); }
    else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); jump(all[Math.max(0, i - 1)], true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const s = current && $('.sw-strip', current); if (s) { e.preventDefault(); s.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * s.clientWidth * 0.8, behavior: 'smooth' }); } }
    else if (e.key === 'Home') jump(all[0], true);
  });
  $$('.sw-top nav a, .sw-end a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) { e.preventDefault(); jump(t, true); } }));

  // The short video opens over the feed and stops when closed.
  const dlg = $('#swVideo'), video = dlg && $('video', dlg);
  const shut = () => { if (!video) return; video.pause(); video.removeAttribute('src'); video.load(); if (dlg.open) dlg.close(); };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reel]');
    if (b && dlg) { video.poster = b.dataset.poster || ''; video.src = b.dataset.reel; dlg.showModal(); video.play().catch(() => {}); return; }
    if (e.target.closest('.sw-vx') || e.target === dlg) shut();
    const s = e.target.closest('.sw-share');
    if (s && navigator.share) { e.preventDefault(); navigator.share({ title: s.dataset.shareTitle, url: new URL(s.dataset.shareUrl, location.origin).href }).catch(() => {}); }
  });
  dlg?.addEventListener('close', shut);
  dlg?.addEventListener('cancel', shut);

  // A one-time pointer for how to move.
  const hint = $('#swHint');
  let hinted = null; try { hinted = localStorage.getItem('glassbox.swipe.hint'); } catch { /* storage blocked */ }
  if (hint && !hinted) {
    hint.hidden = false;
    try { localStorage.setItem('glassbox.swipe.hint', '1'); } catch { /* storage blocked */ }
    const off = () => { hint.hidden = true; };
    setTimeout(off, 4700);
    feed.addEventListener('scroll', off, { once: true, passive: true });
  }
})();
