// The first-visit welcome: what Glassbox is, an optional email sign-up and browser
// notifications for new explainers, then the cookie choice. Shown once per browser; reopen it
// from "Get new explainers" in the footer. Never shown to crawlers or while recording.
(() => {
  const SEEN = 'glassbox.welcome', CONSENT = 'glassbox.consent';
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
  const bot = navigator.webdriver || /bot|crawl|spider|lighthouse|headless|preview/i.test(navigator.userAgent);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  // Analytics consent goes through the site's analytics file when it is loaded; otherwise the
  // choice is just remembered for when it is.
  const consent = (v) => (window.glassboxConsent ? window.glassboxConsent(v) : put(CONSENT, v));

  async function pushSubscription() {
    if (!canPush) return null;
    if ((await Notification.requestPermission()) !== 'granted') return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { key } = await (await fetch('/api/push-key')).json();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
    return sub.toJSON();
  }

  function open(startAt = 0) {
    document.getElementById('gb-welcome')?.remove();
    const n = document.querySelectorAll('#grid .case:not([data-sealed])').length || document.querySelector('.chip[data-filter="all"] small')?.textContent || '';
    const d = document.createElement('dialog');
    d.id = 'gb-welcome'; d.className = 'welcome'; d.setAttribute('aria-labelledby', 'gbwTitle');
    d.innerHTML = `
      <button class="w-x" type="button" data-close aria-label="Close">×</button>
      <div class="w-glow" aria-hidden="true"></div>
      <section class="w-step" data-step="0">
        <svg class="w-logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 56 18v28L32 59 8 46V18Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 18l24 13 24-13M32 31v28" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".45"/><circle cx="32" cy="31" r="7" fill="#8ef0ff"/></svg>
        <p class="w-eyebrow">Welcome to Glassbox</p>
        <h2 id="gbwTitle">See inside how things <em>work</em>.</h2>
        <p class="w-lede">Every day we open one glass box: a 3D model you can spin, take apart and play with. A car engine, a cyclone, your heart, the AI behind chatbots.</p>
        <ul class="w-facts"><li><b>${esc(n ? n + '+' : '100+')}</b> explainers</li><li><b>5 min</b> each</li><li><b>Free</b>, no ads</li></ul>
        <form class="w-form" novalidate>
          <label class="w-label" for="gbwEmail">Get new explainers in your inbox</label>
          <div class="w-row"><input id="gbwEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" maxlength="254"><button class="w-go" type="submit">Keep me posted</button></div>
          <input class="w-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${canPush ? '<label class="w-check"><input type="checkbox" id="gbwPush"><span>Also notify me in this browser when a new box opens</span></label>' : ''}
          <p class="w-note" id="gbwNote" aria-live="polite">One note when new explainers are added and a weekly digest. Unsubscribe any time.</p>
        </form>
        <button class="w-skip" type="button" data-next>Not now, just let me explore</button>
      </section>
      <section class="w-step" data-step="1" hidden>
        <p class="w-eyebrow">Your privacy</p>
        <h2>Cookies, your call.</h2>
        <p class="w-lede">Glassbox works without cookies. With your OK we use Google Analytics to count visits and see which explainers help. No ads, nothing sold.</p>
        <div class="w-prefs" hidden>
          <div class="w-pref"><div><b>Essential</b><span>Remembers your choices and keeps bots out.</span></div><span class="w-lock">Always on</span></div>
          <label class="w-pref"><div><b>Analytics</b><span>Google Analytics and Tag Manager: pages viewed, rough location, device type.</span></div><span class="w-switch"><input type="checkbox" id="gbwAnalytics"><i></i></span></label>
        </div>
        <div class="w-actions">
          <button class="w-go" type="button" data-consent="granted">Accept all</button>
          <button class="w-alt" type="button" data-consent="denied">Essential only</button>
          <button class="w-link" type="button" data-custom>Customise</button>
        </div>
        <p class="w-note">Change this any time from “Privacy choices” at the bottom of any page. <a href="/privacy/">Read the privacy page</a>.</p>
      </section>
      <div class="w-dots" aria-hidden="true"><i class="on"></i><i></i></div>`;
    document.body.appendChild(d);
    const $ = (s) => d.querySelector(s);
    const step = (i) => {
      d.querySelectorAll('.w-step').forEach((s) => { s.hidden = +s.dataset.step !== i; });
      d.querySelectorAll('.w-dots i').forEach((x, k) => x.classList.toggle('on', k === i));
      (i === 0 ? $('#gbwEmail') : $('[data-consent="granted"]'))?.focus({ preventScroll: true });
    };
    const finish = () => { put(SEEN, String(Date.now())); d.close(); d.remove(); };
    // If a cookie choice already exists (a returning visitor reopening this), skip that step.
    const next = () => (get(CONSENT) ? finish() : step(1));

    $('.w-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#gbwEmail').value.trim(), wantPush = !!$('#gbwPush')?.checked, note = $('#gbwNote'), btn = $('.w-form .w-go');
      if (!email && !wantPush) { note.textContent = 'Type your email, or tick browser notifications.'; note.className = 'w-note bad'; $('#gbwEmail').focus(); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { note.textContent = 'That email address does not look right.'; note.className = 'w-note bad'; $('#gbwEmail').focus(); return; }
      btn.disabled = true; btn.textContent = 'One moment…';
      try {
        let push = null;
        if (wantPush) { try { push = await pushSubscription(); } catch { push = null; } }
        const res = email
          ? await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, push, website: $('.w-hp').value, source: 'welcome' }) })
          : push ? await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ push }) }) : null;
        const j = res ? await res.json().catch(() => ({})) : {};
        if (res && !res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
        const bits = [];
        if (email) bits.push(j.status === 'active' ? "You're already on the list." : j.confirm === 'sent' ? 'Check your inbox and click the link to confirm.' : "You're on the list. We'll send a link to confirm.");
        if (wantPush) bits.push(push ? 'Browser notifications are on.' : 'Notifications were blocked by the browser.');
        note.textContent = '✓ ' + bits.join(' '); note.className = 'w-note ok';
        put('glassbox.subscribed', '1');
        setTimeout(next, 1600);
      } catch (err) { note.textContent = err.message; note.className = 'w-note bad'; btn.disabled = false; btn.textContent = 'Keep me posted'; }
    });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) return next();
      if (e.target.closest('[data-close]')) return finish();
      if (e.target.closest('[data-custom]')) {
        const p = $('.w-prefs'); p.hidden = false; e.target.closest('[data-custom]').hidden = true;
        $('[data-consent="granted"]').textContent = 'Save my choices'; $('[data-consent="granted"]').dataset.consent = 'custom';
        return;
      }
      const c = e.target.closest('[data-consent]');
      if (c) { consent(c.dataset.consent === 'custom' ? ($('#gbwAnalytics').checked ? 'granted' : 'denied') : c.dataset.consent); finish(); }
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });   // Esc: close, keep defaults
    d.showModal();
    step(startAt);
  }

  window.glassboxWelcome = open;
  document.addEventListener('click', (e) => { if (e.target.closest('[data-welcome]')) { e.preventDefault(); open(0); } });
  if (bot || get(SEEN) || /[?&]reel\b/.test(location.search) || window.top !== window.self) return;
  const start = () => setTimeout(() => { if (!document.querySelector('dialog[open]')) open(0); }, 1400);
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
})();
