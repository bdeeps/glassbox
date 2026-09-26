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
  return { ga4: /^G-[A-Z0-9]+$/.test(a.ga4 || '') ? a.ga4 : '', ct, clicktrust: !!(ct.srcs.length || ct.code.length) };
}

export function csp({ scriptHashes = [], frames = [] } = {}) {
  const { ga4, ct } = active();
  const s = [...(ga4 ? GA_HOSTS.script : []), ...ct.hosts];
  const c = [...(ga4 ? GA_HOSTS.connect : []), ...ct.hosts];
  const i = [...(ga4 ? GA_HOSTS.img : []), ...ct.hosts];
  return [
    "default-src 'self'", ['script-src', "'self'", ...scriptHashes.map((h) => `'sha256-${h}'`), ...s].join(' '),
    "style-src 'self' 'unsafe-inline'", ['img-src', "'self' data: blob:", ...i].join(' '), "media-src 'self' blob:", "font-src 'self'",
    ['connect-src', "'self'", ...c].join(' '), ['frame-src', "'self'", ...frames].join(' '),
    "object-src 'none'", "base-uri 'self'", "form-action 'none'",
  ].join('; ');
}

// The file that actually loads the tags. Never runs on localhost, so development
// and studio recordings don't pollute the numbers.
export function analyticsJs() {
  const { ga4, ct } = active();
  return `// Generated from glassbox.config.json "analytics". What this does is explained at /privacy/.
(() => {
  if (window.__gbAnalytics || /^(localhost|127\\.|\\[::1\\]|.*\\.local$)/.test(location.hostname) || /[?&]reel\\b/.test(location.search)) return;
  window.__gbAnalytics = true;
  const add = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };
${ga4 ? `  // Google Analytics 4: visitor analytics. Skipped when the browser sends
  // Global Privacy Control or Do Not Track.
  const optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  if (!optOut) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(ga4)}, { allow_google_signals: false, allow_ad_personalization_signals: false });
  add('https://www.googletagmanager.com/gtag/js?id=' + ${JSON.stringify(ga4)});
  }
` : '  // Google Analytics: not configured.\n'}${ct.srcs.length || ct.code.length ? `  // ClickTrust: bot and invalid-traffic analytics.
${ct.srcs.map((u) => `  add(${JSON.stringify(u)});`).join('\n')}
${ct.code.map((c) => `  try {\n${c.split('\n').map((l) => '    ' + l).join('\n')}\n  } catch (e) { /* never break the page */ }`).join('\n')}
` : '  // ClickTrust: not configured.\n'}})();
`;
}
