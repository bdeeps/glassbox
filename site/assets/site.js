// Small progressive enhancements. Every page works without this file.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let toastEl;
  const toast = (msg) => {
    toastEl ||= Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
    document.body.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('on'), 1800);
  };

  // Shelf filter by field.
  const chips = $$('.chip[data-filter]');
  const apply = (f) => {
    chips.forEach((c) => c.classList.toggle('on', c.dataset.filter === f));
    $$('.grid .card').forEach((card) => { card.hidden = f !== 'all' && card.dataset.field !== f; });
  };
  chips.forEach((c) => c.addEventListener('click', () => apply(c.dataset.filter)));

  // Share: native sheet where it exists, else copy the link.
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const data = { title: b.dataset.title, url: b.dataset.url };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(data.url); toast('Link copied'); } catch { prompt('Copy this link', data.url); }
  }));
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1500); } catch { /* ignore */ }
  }));

  // Load the live app only when asked, so the page itself stays light.
  const frame = (src) => Object.assign(document.createElement('iframe'), { src, className: 'live', title: 'Interactive box', allow: 'fullscreen; autoplay', loading: 'eager' });
  $$('.try').forEach((t) => t.querySelector('.btn').addEventListener('click', () => t.replaceWith(frame(t.dataset.src))));
  $$('.try-inline').forEach((b) => b.addEventListener('click', () => {
    const v = b.parentElement.querySelector('video');
    (v || b).replaceWith(frame(b.dataset.src));
    if (v) b.remove();
  }));
  $$('.yt[data-yt]').forEach((y) => {
    y.style.backgroundImage = `url(https://i.ytimg.com/vi/${y.dataset.yt}/hqdefault.jpg)`;
    y.querySelector('.btn').addEventListener('click', () => {
      y.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${y.dataset.yt}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`;
    });
  });

  // Reels autoplay (muted) while on screen.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.4 });
    $$('video.reel').forEach((v) => io.observe(v));
  }
})();
