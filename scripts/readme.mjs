// Fills in a box repo's GitHub-facing files from its glassbox.json and media:
// the README header block (between glassbox markers), LICENSE-CONTENT.md, and
// the package.json metadata. With --meta it prints the repo description,
// homepage and topics for scripts/github-setup.sh instead.
//   node scripts/readme.mjs <slug> [--meta]
import fs from 'node:fs';
import path from 'node:path';
import { config, SITE, localApps } from './lib/apps.mjs';

const START = '<!-- glassbox:start -->', END = '<!-- glassbox:end -->';
const [slug] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const a = localApps().find((x) => x.slug === slug);
if (!a) { console.error(`unknown box "${slug}" (is it in apps.local.json?)`); process.exit(1); }
const year = new Date(a.date + 'T12:00:00Z').getUTCFullYear();
const page = `${SITE}${a.pageUrl}`, app = `${SITE}${a.appUrl}`, media = (f) => `${SITE}/${a.slug}/glassbox/${f}`;
const has = (f) => fs.existsSync(path.join(a.dir, 'glassbox', f));
const topic = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

const topics = [...new Set([config.topic, 'glassbox', a.field, 'interactive', 'explainer', 'education', 'html5', 'open-source', 'no-tracking', ...a.tags.map(topic)])]
  .filter(Boolean).slice(0, 20);
const description = `${a.question} An interactive, open-source explainer. ${config.brand} No. ${a.no}.`.slice(0, 350);

if (process.argv.includes('--meta')) {
  console.log(JSON.stringify({ description, homepage: app, topics }));
  process.exit(0);
}

const badge = (label, msg, color) => `https://img.shields.io/badge/${encodeURIComponent(label).replace(/-/g, '--')}-${encodeURIComponent(msg).replace(/-/g, '--')}-${color}`;
const slides = fs.existsSync(path.join(a.dir, 'glassbox')) ? fs.readdirSync(path.join(a.dir, 'glassbox')).filter((f) => /^slide-\d+\.jpg$/.test(f)).sort((x, y) => parseInt(x.slice(6)) - parseInt(y.slice(6))) : [];

const block = [
  START,
  '<!-- Generated from glassbox.json by the Glassbox hub (npm run readme -- ' + a.slug + '). Edit glassbox.json, not this block. -->',
  has('cover.jpg') ? `<p align="center"><a href="${page}"><img src="glassbox/cover.jpg" alt="${a.question}" width="100%"></a></p>\n` : '',
  `<h1 align="center">${a.title}</h1>`,
  '',
  `<p align="center"><b>${a.question}</b><br>${a.hook}</p>`,
  '',
  `<p align="center"><a href="${app}"><b>▶ Play with it</b></a> &nbsp;·&nbsp; <a href="${page}">Read the 60-second explainer</a>${has('reel.mp4') ? ` &nbsp;·&nbsp; <a href="${media('reel.mp4')}">Watch the ${a.explainer.length ? '40-second ' : ''}video</a>` : ''}</p>`,
  '',
  `<p align="center">`,
  `  <a href="${page}"><img alt="Glassbox No. ${a.no}" src="${badge('Glassbox', 'No. ' + a.no, '8ef0ff')}"></a>`,
  `  <a href="${page}"><img alt="${a.fieldLabel}" src="${badge('field', a.fieldLabel, a.color.slice(1))}"></a>`,
  `  <a href="LICENSE"><img alt="Code: ${config.licenses.code}" src="${badge('code', config.licenses.code, '3fb950')}"></a>`,
  `  <a href="LICENSE-CONTENT.md"><img alt="Content: ${config.licenses.content}" src="${badge('content', config.licenses.content, 'ef9421')}"></a>`,
  `  <a href="#privacy"><img alt="No tracking" src="${badge('tracking', 'none', '555')}"></a>`,
  `</p>`,
  '',
  a.explainer.length ? `## In 60 seconds\n\n${a.explainer.map((b, i) => `${i + 1}. **${b.title}.** ${b.text}`).join('\n')}\n` : '',
  a.concepts.length ? `## Words worth knowing\n\n| Term | Meaning |\n|---|---|\n${a.concepts.map((c) => `| **${c.term}** | ${c.def.replace(/\|/g, '\\|')} |`).join('\n')}\n` : '',
  has('reel.mp4') || has('thumb.jpg') ? [
    '## Video and slides',
    '',
    `Made with the Glassbox studio from this box's storyboard (\`window.glassbox.director\`). Free to reuse under ${config.licenses.content}.`,
    '',
    has('thumb.jpg') ? `<a href="${media('video.mp4')}"><img src="glassbox/thumb.jpg" alt="Video: ${a.question}" width="100%"></a>\n` : '',
    slides.length ? `<p>${slides.slice(0, 4).map((f) => `<a href="glassbox/${f}"><img src="glassbox/${f}" alt="Carousel ${f.replace('.jpg', '')}" width="24%"></a>`).join(' ')}</p>\n` : '',
    '| File | What | Size |',
    '|---|---|---|',
    has('reel.mp4') ? `| [\`glassbox/reel.mp4\`](${media('reel.mp4')}) | Reel / Short, with captions and soundtrack | 1080×1920 |` : '',
    has('video.mp4') ? `| [\`glassbox/video.mp4\`](${media('video.mp4')}) | YouTube video, with captions and soundtrack | 1920×1080 |` : '',
    slides.length ? `| \`glassbox/slide-1…${slides.length}.jpg\` | Instagram carousel | 1080×1350 |` : '',
    has('thumb.jpg') ? '| `glassbox/thumb.jpg` | YouTube thumbnail | 1280×720 |' : '',
    has('cover.jpg') ? '| `glassbox/cover.jpg` | Share card and repo social preview | 1200×630 |' : '',
    has('post.json') ? '| `glassbox/post.json` | Post copy and schedule used by the publish kit | |' : '',
  ].filter((l, i, arr) => l !== '' || (arr[i - 1] && !arr[i - 1].startsWith('|'))).join('\n') + '\n' : '',
  '## Privacy',
  '',
  `This box collects **nothing**: no accounts, no cookies, no analytics, no tracking, and no requests to other websites. Every file, including fonts and libraries, is served from ${config.domain}.`,
  '',
  a.storage.length ? `It remembers a few things **in your own browser only**, and never sends them anywhere:\n\n| Browser storage key | What it holds |\n|---|---|\n${a.storage.map((s) => `| \`${s.key}\` | ${s.what} |`).join('\n')}\n` : 'It stores nothing, not even in your browser.\n',
  `The full policy is at [${config.domain}/privacy](${SITE}/privacy/).`,
  '',
  '## Licences',
  '',
  `- **Code:** [${config.licenses.code}](LICENSE). Use it, change it, ship it.`,
  `- **Explanations, text, images and videos** (\`glassbox.json\`, \`glassbox/\`): [${config.licenses.content}](LICENSE-CONTENT.md). Credit “${config.brand}, ${config.domain}/e/${a.slug}”.`,
  a.credits.length ? `- **Third-party parts** keep their own licences: ${a.credits.map((c) => `[${c.name}](${c.url}) (${c.license})`).join(', ')}.` : '',
  `- The ${config.brand} name and logo aren't covered by either licence. See the [terms](${SITE}/terms/).`,
  '',
  `Found a mistake? [Open an issue](https://github.com/${config.org}/${a.slug}/issues). Corrections happen in public.`,
  END,
].join('\n').replace(/\n{3,}/g, '\n\n');

const readmePath = path.join(a.dir, 'README.md');
const cur = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
const next = cur.includes(START) && cur.includes(END)
  ? cur.slice(0, cur.indexOf(START)) + block + cur.slice(cur.indexOf(END) + END.length)
  : block + '\n\n' + cur;
fs.writeFileSync(readmePath, next.replace(/\n{3,}/g, '\n\n'));

fs.writeFileSync(path.join(a.dir, 'LICENSE-CONTENT.md'), `# Content licence

The explanations, text, diagrams, images and videos in this repository, meaning
\`glassbox.json\` and everything in \`glassbox/\`, are © ${year} ${config.owner} and
licensed under the **Creative Commons Attribution 4.0 International licence
(CC BY 4.0)**: https://creativecommons.org/licenses/by/4.0/

You are free to share and adapt them for any purpose, even commercially, as long
as you give appropriate credit, link to the licence, and say if you made changes.
Suggested credit:

> “${a.question}” by ${config.brand} (${config.domain}/e/${a.slug}), CC BY 4.0

The source code is licensed separately under the ${config.licenses.code} licence (see \`LICENSE\`).
Third-party components keep their own licences, next to their files.
The ${config.brand} name and logo are not covered by either licence.
`);

const pkgPath = path.join(a.dir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  Object.assign(pkg, {
    description: `${a.question} ${a.hook}`.slice(0, 300),
    homepage: app,
    repository: { type: 'git', url: `git+https://github.com/${config.org}/${a.slug}.git` },
    bugs: { url: `https://github.com/${config.org}/${a.slug}/issues` },
    license: config.licenses.code,
    author: config.owner,
    keywords: topics,
  });
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`✓ ${a.slug}: README.md, LICENSE-CONTENT.md${fs.existsSync(pkgPath) ? ', package.json' : ''}`);
