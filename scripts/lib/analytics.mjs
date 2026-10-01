// Visitor analytics (Google Analytics 4) and bot analytics (ClickTrust), plus
// the Content Security Policy that allows exactly those services and nothing else.
// Both load from one file on our own domain, /assets/analytics.js, which every
// hub page includes and every box gets through /bar.js.
import { config } from './apps.mjs';

const GA_HOSTS = {
  script: ['https://www.googletagmanager.com'],
  connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
};

// A pasted ClickTrust snippet: its <script src> URLs, any inline code, and every host it talks to.
export function parseSnippet(snippet = '') {
  const srcs = [...snippet.matchAll(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const inline = [...snippet.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).filter(Boolean);
  const bare = !/<script/i.test(snippet) && snippet.trim() ? [snippet.trim()] : [];
  const code = [...inline, ...bare];
  const hosts = [...new Set([...srcs, ...code.join('\n').match(/https:\/\/[a-z0-9.-]+/gi) || []].map((u) => {
    try { return new URL(u.startsWith('//') ? 'https:' + u : u).origin; } catch { return null; }
  }).filter(Boolean))];
  return { srcs, code, hosts };
}

export function active() {
  const a = config.analytics || {};
  const ct = parseSnippet(a.clicktrust?.snippet);
  return { ga4: /^G-[A-Z0-9]+$/.test(a.ga4 || '') ? a.ga4 : '', gtm: /^GTM-[A-Z0-9]+$/.test(a.gtm || '') ? a.gtm : '', ct, clicktrust: !!(ct.srcs.length || ct.code.length) };
}

// Google's own install snippets for the configured container, shown in the admin exactly as
// Google gives them. The site loads the same thing from /assets/analytics.js, after consent.
export function gtmSnippets(id = active().gtm) {
  if (!id) return null;
  return {
    head: `<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\nnew Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\nj=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n})(window,document,'script','dataLayer','${id}');</script>\n<!-- End Google Tag Manager -->`,
    body: `<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"\nheight="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n<!-- End Google Tag Manager (noscript) -->`,
  };
}
// Google's own gtag.js snippet for the GA4 property, shown in the admin as Google gives it.
export function ga4Snippet(id = active().ga4) {
  if (!id) return '';
  return `<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n\n  gtag('config', '${id}');\n</script>`;
}
export const gtmNoscript = () => { const id = active().gtm; return id ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>` : ''; };

export function csp({ scriptHashes = [], frames: framesIn = [] } = {}) {
  let frames = framesIn;
  const { ga4, gtm, ct } = active();
  const g = ga4 || gtm;
  const s = [...(g ? GA_HOSTS.script : []), ...ct.hosts];
  const c = [...(g ? GA_HOSTS.connect : []), ...ct.hosts];
  const i = [...(g ? GA_HOSTS.img : []), ...ct.hosts];
  if (gtm) frames = [...frames, 'https://www.googletagmanager.com'];
  return [
    "default-src 'self'", ['script-src', "'self'", ...scriptHashes.map((h) => `'sha256-${h}'`), ...s].join(' '),
    "style-src 'self' 'unsafe-inline'", ['img-src', "'self' data: blob:", ...i].join(' '), "media-src 'self' blob:", "font-src 'self'",
    ['connect-src', "'self'", ...c].join(' '), ['frame-src', "'self'", ...frames].join(' '),
    "object-src 'none'", "base-uri 'self'", "form-action 'none'",
  ].join('; ');
}

// The file that actually loads the tags, with the consent banner. Never runs on
// localhost or while the studio records, so development doesn't pollute the numbers.
//  - ClickTrust (bot detection) protects the site and always runs.
//  - Google Analytics needs a choice first where the law asks for consent: the EU/EEA,
//    the UK and Switzerland, recognised from the device's time zone (never from IP).
//    Elsewhere it runs unless the visitor opts out. GPC / Do Not Track always mean no.
//  - Anyone can change their mind with any [data-privacy-choices] button.
export const CONSENT_KEY = 'glassbox.consent';
export function analyticsJs() {
  const { ga4, gtm, ct } = active();
  const tags = ga4 || gtm;
  const ctCode = ct.srcs.map((u) => `    add(${JSON.stringify(u)});`).concat(ct.code.map((c) => `    try {\n${c.split('\n').map((l) => '      ' + l).join('\n')}\n    } catch (e) { /* never break the page */ }`)).join('\n');
  return `// Generated from glassbox.config.json "analytics". Explained at /privacy/.
(() => {
  if (window.__gbAnalytics || /^(localhost|127\\.|\\[::1\\]|.*\\.local$)/.test(location.hostname) || /[?&]reel\\b/.test(location.search)) return;
  window.__gbAnalytics = true;
  const add = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };
${ctCode ? `  // ClickTrust: bot and invalid-traffic detection.\n  (() => {\n${ctCode}\n  })();\n` : '  // ClickTrust: not configured.\n'}${tags ? `
  // Google Tag Manager${ga4 ? ' and Google Analytics 4' : ''}, with consent.
  const GA = ${JSON.stringify(ga4)}, GTM = ${JSON.stringify(gtm)}, KEY = ${JSON.stringify(CONSENT_KEY)};
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  const consentRegion = /^Europe\\//.test(tz) || /^Atlantic\\/(Canary|Madeira|Azores|Faroe|Reykjavik)$/.test(tz) || tz === 'Arctic/Longyearbyen';
  const signal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const put = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: choice lasts this page */ } };
  let started = false;
  const startGA = () => {
    if (started) return; started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    if (GTM) {   // Google Tag Manager's own loader, as in its install snippet
      dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      add('https://www.googletagmanager.com/gtm.js?id=' + GTM);
    }
    if (GA) {
      gtag('js', new Date());
      gtag('config', GA, { allow_google_signals: false, allow_ad_personalization_signals: false });
      add('https://www.googletagmanager.com/gtag/js?id=' + GA);
    }
  };
  const clearGA = () => {
    for (const c of document.cookie.split(';')) {
      const n = c.split('=')[0].trim();
      if (/^_ga/.test(n)) for (const d of ['', location.hostname, '.' + location.hostname.split('.').slice(-2).join('.')]) document.cookie = n + '=; Max-Age=0; Path=/' + (d ? '; Domain=' + d : '');
    }
  };
  const choice = get();
  if (!signal && (choice === 'granted' || (!consentRegion && choice !== 'denied'))) startGA();

  function banner(reopened) {
    document.getElementById('gb-consent')?.remove();
    const now = signal ? 'off (your browser sent a privacy signal)' : started ? 'on' : 'off';
    const el = document.createElement('div');
    el.id = 'gb-consent';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Privacy choices'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<style>#gb-consent{position:fixed;z-index:2147483600;right:16px;bottom:16px;max-width:420px;padding:18px 18px 16px;border-radius:18px;background:#10131b;color:#eef0f6;border:1px solid rgba(255,255,255,.18);box-shadow:0 20px 60px rgba(0,0,0,.6);font:400 14.5px/1.5 Geist,ui-sans-serif,system-ui,sans-serif}#gb-consent b{font-weight:600}#gb-consent p{margin:0 0 12px}#gb-consent .r{display:flex;gap:8px;flex-wrap:wrap}#gb-consent button{flex:1;min-height:42px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#eef0f6;font:600 14px Geist,system-ui,sans-serif;cursor:pointer}#gb-consent button:hover{background:rgba(255,255,255,.12)}#gb-consent button:focus-visible{outline:2px solid #8ef0ff;outline-offset:2px}#gb-consent a{color:#8ef0ff}#gb-consent small{display:block;margin-top:10px;color:#a8aebf;font-size:12.5px}@media (max-width:520px){#gb-consent{left:12px;right:12px;bottom:12px;max-width:none}}</style>'
      + '<p><b>Can we count your visit?</b> We use Google Analytics (through Google Tag Manager) to see which explainers help people, and nothing else. No ads, nothing sold.' + (reopened ? ' It is currently <b>' + now + '</b>.' : '') + '</p>'
      + '<div class="r"><button type="button" data-v="granted">Allow</button><button type="button" data-v="denied">No thanks</button></div>'
      + '<small>Bot detection (ClickTrust) always runs to protect the site. <a href="/privacy/">Privacy</a> · change this any time from “Privacy choices” at the bottom of every page.</small>';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      put(b.dataset.v); el.remove();
      if (b.dataset.v === 'granted' && !signal) startGA();
      if (b.dataset.v === 'denied' && started) { clearGA(); location.reload(); }
    });
    document.body.appendChild(el);
    el.querySelector('button').focus({ preventScroll: true });
  }
  const ready = (fn) => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn));
  // The first-visit welcome asks the cookie question itself, so the banner stays out of its way.
  const welcomeAsks = !!document.querySelector('script[src*="/assets/welcome.js"]') && !(() => { try { return localStorage.getItem('glassbox.welcome'); } catch { return 1; } })();
  if (consentRegion && !choice && !signal && !welcomeAsks) ready(() => banner(false));
  window.glassboxConsent = (v) => {
    put(v); document.getElementById('gb-consent')?.remove();
    if (v === 'granted' && !signal) startGA();
    if (v === 'denied' && started) { clearGA(); location.reload(); }
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-privacy-choices]')) { e.preventDefault(); banner(true); } });
  window.glassboxPrivacyChoices = () => banner(true);
` : '  // Google Analytics / Tag Manager: not configured, so no consent banner is needed.\n'}})();
`;
}
