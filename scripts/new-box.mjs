// Starts tomorrow's box: a new sibling repo from templates/box, numbered and
// dated after the latest box, and registered in apps.local.json.
//   npm run new -- <slug> "How does X work?" --field physics [--title "Name"]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, config, localApps } from './lib/apps.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const field = opt('field') || 'physics';
const titleArg = opt('title');
const [slug, question] = args;

if (!slug || !question) {
  console.error('usage: npm run new -- <slug> "How does X work?" --field <field> [--title "Name"]');
  console.error('fields: ' + Object.keys(config.fields).join(', '));
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) { console.error('slug: lowercase letters, digits and dashes'); process.exit(2); }
if (!config.fields[field]) { console.error(`unknown field "${field}". Pick one of: ${Object.keys(config.fields).join(', ')}`); process.exit(2); }

const apps = localApps();
if (apps.some((a) => a.slug === slug)) { console.error(`${slug} already exists`); process.exit(1); }
const latest = apps.sort((a, b) => b.box - a.box)[0];
const box = latest ? latest.box + 1 : 1;
const date = latest
  ? new Date(new Date(latest.date + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10)
  : config.startDate;
const title = titleArg || slug.replace(/(^|-)(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());
const color = config.fields[field].color;
const dir = path.resolve(ROOT, '..', slug);
if (fs.existsSync(dir)) { console.error(`${dir} already exists`); process.exit(1); }

const vars = {
  SLUG: slug, TITLE: title, TITLE_LOWER: title.toLowerCase(), QUESTION: question, NO: String(box).padStart(3, '0'), COLOR: color, COLOR_URL: encodeURIComponent(color),
  DOMAIN: config.domain, ORG: config.org, HUB_REPO: config.hubRepo,
};
const fill = (s) => s.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => vars[k] ?? m);

fs.cpSync(path.join(ROOT, 'templates', 'box'), dir, { recursive: true });
for (const f of ['index.html', 'style.css', 'app.js', 'README.md', 'history.json', '.github/workflows/notify-hub.yml']) {
  const p = path.join(dir, f);
  fs.writeFileSync(p, fill(fs.readFileSync(p, 'utf8')));
}
fs.writeFileSync(path.join(dir, 'glassbox.json'), JSON.stringify({
  slug, box, date, title, question,
  hook: 'One or two sentences that make someone want to press play.',
  thumbText: title.toUpperCase(),
  field, minutes: 5, tags: [],
  explainer: [
    { title: 'The one-line idea', text: 'Say what is really going on, in plain words.' },
    { title: 'The part people get wrong', text: 'The misconception, and why it feels right.' },
    { title: 'What the model shows', text: 'Which dial to turn and what to watch for.' },
  ],
  concepts: [{ term: 'Key term', def: 'A one-sentence definition.' }],
  links: {},
  storage: [],
  credits: [{ name: 'Geist, Instrument Serif', license: 'SIL OFL 1.1', url: 'https://openfontlicense.org' }],
}, null, 2) + '\n');

const localFile = path.join(ROOT, 'apps.local.json');
const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : { apps: [] };
local.apps.push(path.relative(ROOT, dir));
fs.writeFileSync(localFile, JSON.stringify(local, null, 2) + '\n');

try {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
} catch { /* git missing: fine */ }
execFileSync('node', [path.join(ROOT, 'scripts', 'readme.mjs'), slug], { cwd: ROOT, stdio: 'inherit' });

console.log(`Box No. ${vars.NO} → ${dir}`);
console.log(`  opens ${date} · ${config.fields[field].label}`);
console.log('Next:');
console.log(`  1. Build the model in ${slug}/app.js, fill in ${slug}/glassbox.json and research ${slug}/history.json (docs/HISTORY.md)`);
console.log(`  2. npm run dev → http://localhost:5210/${slug}/  and  /studio/?box=${slug}`);
console.log(`  3. scripts/github-setup.sh ${slug}   (creates the public repo + Pages)`);
