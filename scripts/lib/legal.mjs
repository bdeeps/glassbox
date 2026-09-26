// Privacy policy and terms. Written to be exactly true of how the site is built:
// if the build changes (a new host, a new embed), these pages must change with it.
import { config, SITE, esc } from './apps.mjs';
import { head, nav, footer, fmtDate } from './render.mjs';

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
  const storageRows = [
    `<tr><td><code>glassbox.bar.min</code></td><td>Every box</td><td>Whether you collapsed the small Glassbox bar. Holds only “1” or “0”.</td></tr>`,
    ...stored.flatMap((a) => a.storage.map((s) => `<tr><td><code>${esc(s.key)}</code></td><td><a href="${a.pageUrl}">No. ${a.no} · ${esc(a.title)}</a></td><td>${esc(s.what)}</td></tr>`)),
  ].join('');
  return doc({
    title: 'Privacy',
    description: `${config.brand} collects no personal data: no accounts, cookies, analytics, ads or tracking. Here is exactly what happens when you visit.`,
    url: '/privacy/', eyebrow: 'The small print, in plain words', historyFile: 'legal.mjs',
    lede: `${config.brand} does not collect, store, sell or share any information about you. This page explains exactly what happens when you visit, so you don't have to take our word for it.`,
    summary: `<h2>The short version</h2><ul class="checks">
      <li><b>No accounts, no forms.</b> There is nothing to sign up for and nowhere to type your details.</li>
      <li><b>No cookies.</b> We set none, and no one else sets any through this site.</li>
      <li><b>No analytics or tracking.</b> No Google Analytics, no pixels, no fingerprinting, no ad networks, no session recording.</li>
      <li><b>No third-party requests.</b> Pages, fonts, scripts, images and videos all come from ${esc(config.domain)}. A YouTube player loads only if you press play on one.</li>
      <li><b>Your progress stays on your device.</b> Some boxes save things like quiz scores in your own browser. They never leave it.</li>
      <li><b>Our host keeps standard server logs</b>, which we cannot see (<a href="#hosting">details</a>).</li>
    </ul>`,
    sections: [
      ['who', 'Who we are', `<p>${esc(config.brand)} (${esc(config.domain)}) is a personal, non-commercial project by ${esc(config.owner)}. It publishes one interactive explainer (“box”) a day, with its source code. When this page says “we”, it means ${esc(config.owner)}.</p>`],
      ['collect', 'What we collect', `<p><b>Nothing.</b> The site is a set of static files: HTML, CSS, JavaScript, images, fonts and videos. There is no server of ours, no database, no login and no form. We never receive your name, email, IP address, location, device details or what you click.</p>
        <p>Because we hold no personal data, there is nothing for us to access, correct, export or delete on your behalf. Rights under laws such as the GDPR, the UK GDPR, India's DPDP Act or the CCPA/CPRA still protect you. They just have nothing of yours to act on here.</p>`],
      ['hosting', 'Our host: GitHub Pages', `<p>The site is served by <b>GitHub Pages</b>, a service of GitHub, Inc. Like every web server, GitHub has to receive your IP address to send you a page. GitHub states that when a Pages site is visited, the visitor's IP address is logged and stored for security purposes. Those logs belong to GitHub. We have no access to them and receive no reports from them.</p>
        <p>See <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection" rel="noopener" target="_blank">GitHub Pages: data collection</a> and the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener" target="_blank">GitHub General Privacy Statement</a>.</p>`],
      ['third-parties', 'No third-party requests', `<p>Most websites quietly load fonts, scripts and trackers from other companies, and each of those learns you visited. We don't. Our fonts (Geist, Instrument Serif and each box's own fonts) and libraries (such as three.js) are copied onto ${esc(config.domain)} and served from it.</p>
        <p>We also enforce this technically. Every page carries a Content Security Policy that tells your browser to refuse connections to any other domain, except the YouTube player described below. You can check it yourself: open your browser's developer tools, look at the Network tab, and you will see only ${esc(config.domain)}.</p>
        <p>Pages also send no “referrer”. When you follow a link from here to another site, your browser doesn't tell that site you came from ${esc(config.brand)}.</p>`],
      ['storage', 'What stays on your device', `<p>A few features remember things <b>in your own browser</b> (its “local storage”) so they're still there next time. This data never leaves your device: nothing sends it to us or anyone else. It's not a cookie and it can't be read by other websites.</p>
        <div class="table-wrap"><table><thead><tr><th>Key</th><th>Where</th><th>What it holds</th></tr></thead><tbody>${storageRows}</tbody></table></div>
        <p>To clear it, use your browser's “clear site data” option for ${esc(config.domain)}. Private or incognito windows forget it automatically.</p>`],
      ['video', 'Videos and YouTube', `<p>Our own videos (the 40-second clips on each page) are plain MP4 files served from ${esc(config.domain)}. Watching them tells no one anything.</p>
        <p>Some pages may also offer the same video on YouTube. That player is <b>not loaded</b> until you press its play button. Only then does your browser connect to <code>youtube-nocookie.com</code>, Google's privacy-enhanced embed, and Google's <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">privacy policy</a> applies to that player.</p>`],
      ['links', 'Links to other sites', `<p>We link to YouTube, Instagram, GitHub and the original sources we learned from. Those sites have their own privacy policies, which apply once you're there. Following a link from us sends them no referrer.</p>`],
      ['social', 'Our social media accounts', `<p>We publish short videos on platforms such as YouTube and Instagram, and schedule them with a tool called Buffer. No information about visitors to this website passes to those platforms or to Buffer. If you follow, like or comment on our posts there, that activity is public on that platform and governed by its privacy policy. Platforms show account owners (us) aggregated statistics such as view counts. We use those only to see which explainers people find useful.</p>`],
      ['contact-you', 'If you contact us', `<p>If you ${contact()}, we'll see whatever you choose to send, such as your GitHub username or email address. We use it only to reply, and we never add you to a list. GitHub issues are public, so don't put anything private in one.</p>`],
      ['children', 'Children', `<p>${esc(config.brand)} is made to be safe for curious people of any age. Because we collect no personal data from anyone, we collect none from children either. No account, consent screen or age check is needed to use it.</p>`],
      ['security', 'Security', `<p>The site is served only over HTTPS. It runs no server code of ours that could be breached, and it holds no data about you that could leak. If you find a security problem, please ${contact()}.</p>`],
      ['changes', 'Changes to this policy', `<p>If how the site works ever changes in a way that affects privacy, we'll update this page before the change goes live and change its date at the top. Because the site's source is public, <a href="${HISTORY('legal.mjs')}" rel="noopener" target="_blank">every past version of this policy</a> is visible, word for word. We will never quietly start collecting data. If we ever wanted to, this page would say so first, clearly.</p>`],
      ['contact', 'Contact', `<p>Questions about privacy? Please ${contact()}.</p>`],
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
      <li><b>It's free.</b> No account, no payment, no ads.</li>
      <li><b>Reuse the code</b> under the ${esc(L.code)} licence.</li>
      <li><b>Reuse the explanations, images and videos</b> under ${esc(L.content)}. Just credit ${esc(config.brand)}.</li>
      <li><b>Explainers simplify.</b> They're for learning, not professional advice.</li>
      <li><b>Provided as is</b>, without warranty.</li>
    </ul>`,
    sections: [
      ['agreement', 'Using the site', `<p>These terms cover ${esc(config.domain)}, including every box served under it, and the ${esc(config.brand)} repositories at <a href="https://github.com/${esc(config.org)}" rel="noopener" target="_blank">github.com/${esc(config.org)}</a>. Using the site means you accept them. If you don't, please don't use it. ${esc(config.brand)} is run by ${esc(config.owner)} as a personal, non-commercial project.</p>
        <p>You can use the site freely, at any age, without an account. How we handle (or rather, don't handle) data is in the <a href="/privacy/">privacy policy</a>.</p>`],
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
