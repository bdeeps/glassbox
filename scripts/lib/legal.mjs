// Privacy policy and terms. Written to be exactly true of how the site is built:
// if the build changes (a new host, a new embed), these pages must change with it.
import { config, SITE, esc } from './apps.mjs';
import { head, nav, footer, fmtDate } from './render.mjs';
import { CONSENT_KEY } from './analytics.mjs';

const REPO = `https://github.com/${config.org}/${config.hubRepo}`;
const HISTORY = (file) => `${REPO}/commits/main/scripts/lib/${file}`;
const contact = () => [
  `open an issue at <a href="${REPO}/issues" rel="noopener" target="_blank">github.com/${esc(config.org)}/${esc(config.hubRepo)}/issues</a>`,
  config.contactEmail ? `email <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>` : '',
].filter(Boolean).join(', or ');

function doc({ title, description, url, eyebrow, lede, summary, sections, historyFile }) {
  const toc = sections.map(([id, h]) => `<li><a href="#${id}">${h}</a></li>`).join('');
  return `${head({ title: `${title} · ${config.brand}`, description, url, cls: 'page legal' })}
${nav()}
<main id="main" class="doc">
  <p class="eyebrow">${eyebrow}</p>
  <h1>${title}</h1>
  <p class="lede">${lede}</p>
  <p class="effective">Effective ${fmtDate(config.policyDate, { day: 'numeric', month: 'long', year: 'numeric' })} · <a href="${HISTORY(historyFile)}" rel="noopener" target="_blank">Every change to this page is public</a></p>
  <aside class="summary">${summary}</aside>
  <nav class="toc" aria-label="On this page"><p>On this page</p><ol>${toc}</ol></nav>
  ${sections.map(([id, h, body]) => `<section id="${id}"><h2>${h}</h2>${body}</section>`).join('')}
</main>
${footer()}`;
}

export function privacy(apps) {
  const stored = apps.filter((a) => a.storage.length);
  const ctUrl = config.analytics?.clicktrust?.policyUrl || 'https://clicktrust.cc';
  const storageRows = [
    `<tr><td><code>_ga</code></td><td>Cookie · Google Analytics</td><td>A random ID that lets Google Analytics tell one visitor from another. Expires after 2 years.</td></tr>`,
    `<tr><td><code>_ga_&lt;ID&gt;</code></td><td>Cookie · Google Analytics</td><td>Keeps track of the current visit (session). Expires after 2 years.</td></tr>`,
    `<tr><td>ClickTrust identifiers</td><td>ClickTrust</td><td>ClickTrust may store a small identifier to recognise automated traffic across page views. See <a href="${esc(ctUrl)}" rel="noopener" target="_blank">ClickTrust's policy</a>.</td></tr>`,
    `<tr><td><code>${CONSENT_KEY}</code></td><td>Local storage · whole site</td><td>Your answer to “Can we count your visit?”: “granted” or “denied”. It's kept so we don't ask again, and it never leaves your device.</td></tr>`,
    `<tr><td><code>glassbox_admin</code></td><td>Cookie · admin pages only</td><td>Set only for the site's owner, after signing in to the admin with an access code. It keeps them signed in for 12 hours. Visitors never get it.</td></tr>`,
    `<tr><td><code>glassbox.bar.min</code></td><td>Local storage · every box</td><td>Whether you collapsed the small Glassbox bar. Holds only “1” or “0”. Never leaves your device.</td></tr>`,
    ...stored.flatMap((a) => a.storage.map((s) => `<tr><td><code>${esc(s.key)}</code></td><td>Local storage · <a href="${a.pageUrl}">No. ${a.no} ${esc(a.title)}</a></td><td>${esc(s.what)} Never leaves your device.</td></tr>`)),
  ].join('');
  return doc({
    title: 'Privacy',
    description: `What ${config.brand} measures and why: Google Analytics for visits, ClickTrust for bot detection, and nothing else. No accounts, no ads, nothing sold.`,
    url: '/privacy/', eyebrow: 'The small print, in plain words', historyFile: 'legal.mjs',
    lede: `A glass box shouldn't hide what it measures. ${config.brand} uses exactly two analytics services, <b>Google Analytics</b> to understand visits and <b>ClickTrust</b> to detect bots. This page explains what each one sees, why we use it, and how to opt out.`,
    summary: `<h2>The short version</h2><ul class="checks">
      <li><b>No accounts, no forms, no ads.</b> There's nothing to sign up for, and we never sell or share data for advertising.</li>
      <li><b>Google Analytics counts visits.</b> It tells us which boxes people use, roughly where from, on what kind of device, and how they found us. It sets two cookies. <a href="#analytics">Details</a></li>
      <li><b>ClickTrust detects bots.</b> It looks at technical signals from each visit to tell real people from automated traffic, so our numbers stay honest and the site stays safe. <a href="#bots">Details</a></li>
      <li><b>You choose.</b> In the EU, the UK and Switzerland, Google Analytics only runs after you press “Allow”. Everywhere, you can switch it off from “Privacy choices”, and a Global Privacy Control or Do Not Track signal switches it off automatically. <a href="#choices">Your choices</a></li>
      <li><b>Nothing else talks to other sites.</b> Fonts, scripts, images and videos come from ${esc(config.domain)}. A YouTube player loads only if you press play on one.</li>
      <li><b>Your progress stays on your device.</b> Quiz scores and similar things are kept in your own browser and never sent anywhere.</li>
    </ul>`,
    sections: [
      ['who', 'Who we are', `<p>${esc(config.brand)} (${esc(config.domain)}) is a personal, non-commercial project by ${esc(config.owner)}. It publishes one interactive explainer (“box”) a day, with its source code. When this page says “we”, it means ${esc(config.owner)}, who decides how the data described here is used.</p>`],
      ['summary-table', 'Everything, in one table', `<div class="table-wrap"><table><thead><tr><th>Who</th><th>What they receive</th><th>Why</th><th>How long</th></tr></thead><tbody>
          <tr><td><b>Google Analytics</b> (Google)</td><td>Pages viewed, clicks, scrolling and time on page; the site that referred you; approximate location (country and city, worked out from your IP address); device type, browser, operating system, screen size and language; a random visitor ID stored in a cookie.</td><td>To learn which explainers people find useful, so we can make better ones.</td><td>Up to 14 months, then deleted.</td></tr>
          <tr><td><b>ClickTrust</b></td><td>Your IP address, browser and device characteristics (user agent, screen, settings), the page and referrer, and the timing of interactions.</td><td>To tell people from bots, scrapers and fake traffic. This keeps the numbers honest and protects the site.</td><td>As set out in <a href="${esc(ctUrl)}" rel="noopener" target="_blank">ClickTrust's policy</a>.</td></tr>
          <tr><td><b>GitHub Pages</b> (our host)</td><td>Your IP address, logged by the server with every request.</td><td>To deliver the site and keep it secure.</td><td>Controlled by GitHub. We can't see these logs.</td></tr>
          <tr><td><b>Us</b></td><td>Only the aggregated reports above. No names, no emails, no accounts, and nothing we could use to identify you.</td><td></td><td></td></tr>
        </tbody></table></div>`],
      ['analytics', 'Google Analytics: understanding visits', `<p>We use <b>Google Analytics 4</b>, a service from Google, to count visits and see how people use the site: which boxes they open, how long they stay, where they came from (a search, YouTube, Instagram, another site), and roughly where in the world they are.</p>
        <p><b>When it runs.</b> If your device is set to a time zone in the EU/EEA, the UK or Switzerland, Google Analytics doesn't load until you press “Allow” on the banner. We work this out from your device's time zone, not your IP address. Elsewhere, it loads unless you opt out. Either way, you can change your mind at any time with “Privacy choices” at the bottom of every page, or the “Privacy” link in each box. Choosing “No thanks” deletes the Google Analytics cookies.</p>
        <p>We've switched off Google signals and ad personalisation, so this data isn't linked to Google accounts or used for advertising. Google Analytics 4 works out an approximate location from your IP address; Google states that GA4 doesn't log or store IP addresses. We never send Google your name, email or anything you type. Reports reach us as totals and trends, like “a thousand people opened CameraClear yesterday”, and don't identify individuals. We keep analytics data for 14 months.</p>
        <p>Google processes this data for us. See <a href="https://support.google.com/analytics/answer/6004245" rel="noopener" target="_blank">how Google safeguards Analytics data</a> and the <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">Google Privacy Policy</a>.</p>`],
      ['bots', 'ClickTrust: detecting bots', `<p>A lot of web traffic isn't people. It's crawlers, scrapers and bots, some of them harmful. We use <b>ClickTrust</b> (<a href="${esc(ctUrl)}" rel="noopener" target="_blank">${esc(ctUrl.replace(/^https?:\/\//, ''))}</a>), an invalid-traffic detection service, to spot them.</p>
        <p>To do that, ClickTrust looks at technical signals from each visit: your IP address, how your browser and device present themselves, and how the page is used (for example, whether interactions look human). It uses them only to judge whether a visit is genuine, which keeps our visitor numbers honest and helps protect the site from abuse. It isn't used for advertising, to build a profile of you, or to identify who you are.</p>
        <p>Because this protects the site itself, ClickTrust runs even when your browser asks not to be tracked.</p>`],
      ['cookies', "Cookies and what's stored on your device", `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type · set by</th><th>What it does</th></tr></thead><tbody>${storageRows}</tbody></table></div>
        <p>To clear them, use your browser's “clear site data” option for ${esc(config.domain)}. Private or incognito windows forget them automatically.</p>`],
      ['choices', 'Your choices', `<ul>
          <li><b>Use “Privacy choices”</b> at the bottom of any page (or “Privacy” in a box's bar) to allow or refuse Google Analytics. Your answer is remembered on your device.</li>
          <li><b>Send a privacy signal.</b> If your browser sends <a href="https://globalprivacycontrol.org" rel="noopener" target="_blank">Global Privacy Control</a> or Do Not Track, Google Analytics doesn't load at all.</li>
          <li><b>Opt out of Google Analytics everywhere</b> with <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google's opt-out browser add-on</a>.</li>
          <li><b>Block or delete cookies</b> in your browser settings, or use a content blocker. The site works fully without them.</li>
          <li><b>Use the boxes offline.</b> Every box is open source. Clone it and run it on your own computer, and no analytics run at all.</li>
        </ul>`],
      ['basis', "Why we're allowed to (legal basis)", `<p>If you're in the European Economic Area or the United Kingdom, the law asks us to say why we process this data. For bot detection it's our <b>legitimate interest</b> in keeping the site secure and its statistics accurate. For Google Analytics it's your <b>consent</b>: we ask before loading it, and you can withdraw consent at any time from “Privacy choices”. Outside those regions, we rely on our legitimate interest in understanding which explainers are useful, with the opt-outs above always available.</p>
        <p>You have the right to ask about, correct, delete or object to the processing of your personal data, and to complain to your data protection authority. Because we only see aggregated reports, we usually can't tell which data is yours. Tell us what you need and we'll help, including with deletion requests to Google and ClickTrust.</p>`],
      ['sharing', 'Who else gets data', `<p>Only the three services above: Google, ClickTrust and GitHub. They process data on our behalf or to deliver the site, and may do so outside your country. We never sell personal data, never share it for advertising, and never combine it with other sources to identify you.</p>`],
      ['video', 'Videos and YouTube', `<p>Our own videos (the 40-second clips on each page) are MP4 files served from ${esc(config.domain)}. Some pages also offer the video on YouTube. That player is <b>not loaded</b> until you press its play button. Only then does your browser connect to <code>youtube-nocookie.com</code>, Google's privacy-enhanced embed, and Google's <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">privacy policy</a> applies to that player.</p>`],
      ['security', 'How we keep this in check', `<p>Every page carries a Content Security Policy: a rule that tells your browser to refuse connections to anything except ${esc(config.domain)}, Google Analytics and ClickTrust (plus the YouTube player once you press play). You can check it yourself: open your browser's developer tools, look at the Network tab, and you'll see only those. Fonts and libraries are hosted on our own domain, so nobody else learns you visited just because a page needed a font. Pages send no “referrer”, so the sites we link to aren't told you came from us.</p>
        <p>The site is served only over HTTPS. If you find a security problem, please ${contact()}.</p>`],
      ['social', 'Our social media accounts', `<p>We publish short videos on platforms such as YouTube and Instagram, and schedule them with a tool called Buffer. No data about visitors to this website passes to those platforms or to Buffer. If you follow, like or comment on our posts there, that's governed by the platform's own privacy policy. Platforms show us aggregated statistics such as view counts.</p>`],
      ['contact-you', 'If you contact us', `<p>If you ${contact()}, we'll see whatever you choose to send, such as your GitHub username or email address. We use it only to reply, and we never add you to a list. GitHub issues are public, so don't put anything private in one.</p>`],
      ['children', 'Children', `<p>${esc(config.brand)} is a general-audience site. It isn't directed at children under 13, and we don't knowingly collect personal information from them. Parents and teachers are welcome to use the boxes with children. A box cloned and run locally sends no data at all.</p>`],
      ['changes', 'Changes to this policy', `<p>If what we measure changes, we'll update this page before the change goes live and change the date at the top. Because the site's source is public, <a href="${HISTORY('legal.mjs')}" rel="noopener" target="_blank">every past version of this policy</a> is visible, word for word. We'll never add a tracker without listing it here first.</p>`],
      ['contact', 'Contact', `<p>Questions about privacy, or a request about your data? Please ${contact()}.</p>`],
    ],
  });
}

export function terms() {
  const L = config.licenses;
  return doc({
    title: 'Terms',
    description: `The terms for using ${config.brand}: free to use, code under ${L.code}, explanations and media under ${L.content}, no warranty.`,
    url: '/terms/', eyebrow: 'The small print, in plain words', historyFile: 'legal.mjs',
    lede: `${config.brand} is free to use, and almost everything on it is free to reuse. These terms explain the few rules and limits.`,
    summary: `<h2>The short version</h2><ul class="checks">
      <li><b>It's free.</b> No account, no payment, no ads. What we measure is in the <a href="/privacy/">privacy policy</a>.</li>
      <li><b>Reuse the code</b> under the ${esc(L.code)} licence.</li>
      <li><b>Reuse the explanations, images and videos</b> under ${esc(L.content)}. Just credit ${esc(config.brand)}.</li>
      <li><b>Explainers simplify.</b> They're for learning, not professional advice.</li>
      <li><b>Provided as is</b>, without warranty.</li>
    </ul>`,
    sections: [
      ['agreement', 'Using the site', `<p>These terms cover ${esc(config.domain)}, including every box served under it, and the ${esc(config.brand)} repositories at <a href="https://github.com/${esc(config.org)}" rel="noopener" target="_blank">github.com/${esc(config.org)}</a>. Using the site means you accept them. If you don't, please don't use it. ${esc(config.brand)} is run by ${esc(config.owner)} as a personal, non-commercial project.</p>
        <p>You can use the site freely, at any age, without an account. What we measure, and why, is in the <a href="/privacy/">privacy policy</a>.</p>`],
      ['licences', 'Licences: what you may reuse', `<p>We want these explainers to spread, so they're openly licensed.</p>
        <div class="table-wrap"><table><thead><tr><th>What</th><th>Licence</th><th>What that means</th></tr></thead><tbody>
          <tr><td>Source code of every box and of this site</td><td><a href="https://opensource.org/licenses/MIT" rel="noopener" target="_blank">${esc(L.code)}</a></td><td>Use, copy, change and share it, commercially too. Keep the copyright and licence notice. Each repository's <code>LICENSE</code> file is the binding text.</td></tr>
          <tr><td>Explanations, text, diagrams, images and videos</td><td><a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener" target="_blank">${esc(L.content)}</a></td><td>Share and adapt them for any purpose, commercial included. Credit “${esc(config.brand)}, ${esc(config.domain)}”, link to the licence, and say if you changed anything.</td></tr>
          <tr><td>Third-party parts (e.g. three.js, fonts, mp4-muxer)</td><td>Their own licences</td><td>Listed on each box's page and in each repository, next to their licence files (MIT, SIL Open Font License 1.1).</td></tr>
          <tr><td>The ${esc(config.brand)} name and cube logo</td><td>Not licensed</td><td>Forks are welcome, but don't present them as the official ${esc(config.brand)} or suggest we endorse them.</td></tr>
        </tbody></table></div>
        <p>A good credit line looks like this: <i>“Based on ‘How does a camera actually see?’ by ${esc(config.brand)} (${esc(config.domain)}), ${esc(L.content)}.”</i></p>`],
      ['education', 'Explainers simplify on purpose', `<p>Each box is a teaching model. To make one idea clear, it leaves others out, exaggerates some effects so you can see them, and uses round numbers. That is on purpose, and it means a box is <b>not</b> an engineering, scientific, medical, financial, legal or safety reference.</p>
        <p>Don't rely on a box for decisions where accuracy matters, such as your health, money, safety or work. Check with a qualified professional and primary sources. Boxes about the body, money or security are general education, not advice about your situation.</p>`],
      ['corrections', 'Mistakes and corrections', `<p>We try hard to be right, and we still get things wrong. If you spot an error, please open an issue on the box's repository or at <a href="${REPO}/issues" rel="noopener" target="_blank">the hub</a>. Corrections are made in public, in the repository's history.</p>`],
      ['conduct', 'Fair use of the site', `<p>Please don't try to disrupt the site or its host: no attacking, overloading, or bypassing security measures. Don't use ${esc(config.brand)}'s name or logo to mislead people, for example by passing off a changed copy as the original. Reading, linking, embedding and (within the licences above) copying are all welcome.</p>`],
      ['third', 'Other sites and platforms', `<p>We link to and post on services we don't control, such as GitHub, YouTube and Instagram. Their terms and policies apply when you use them, and we're not responsible for their content or practices.</p>`],
      ['warranty', 'No warranty', `<p>The site, the boxes, the code and the media are provided <b>“as is”</b> and <b>“as available”</b>, without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy and non-infringement. The code licence says the same. Boxes may change, move or be removed without notice.</p>`],
      ['liability', 'Limits of liability', `<p>As far as the law allows, ${esc(config.owner)} and contributors are not liable for any loss or damage arising from using, or being unable to use, ${esc(config.brand)} or anything published through it. That includes indirect or consequential loss, and loss from relying on a simplified explanation. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer.</p>`],
      ['changes', 'Changes to these terms', `<p>We may update these terms. The date at the top shows when they last changed, and <a href="${HISTORY('legal.mjs')}" rel="noopener" target="_blank">every earlier version is public</a>. Continuing to use the site after a change means you accept the new version. Licences already granted for something we published don't get taken back.</p>`],
      ['contact', 'Contact', `<p>Questions about these terms? Please ${contact()}.</p>`],
    ],
  });
}
