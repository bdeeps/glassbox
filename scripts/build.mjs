// Builds the hub into dist/: static assets from site/ plus generated pages.
//   node scripts/build.mjs               # local manifests (apps.local.json)
//   node scripts/build.mjs --github      # every repo in the org with the box topic (used in CI)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, loadApps } from './lib/apps.mjs';
import * as R from './lib/render.mjs';

export function pages(apps) {
  const out = {
    'index.html': R.home(apps),
    '404.html': R.notFound(),
    'feed.xml': R.feed(apps),
    'sitemap.xml': R.sitemap(apps),
    'apps.json': R.appsJson(apps),
    'robots.txt': `User-agent: *\nDisallow: /studio/\nSitemap: https://${config.domain}/sitemap.xml\n`,
  };
  for (const a of apps) out[`e/${a.slug}/index.html`] = R.explainer(a, apps);
  return out;
}

async function main() {
  const source = process.argv.includes('--github') ? 'github' : undefined;
  const apps = await loadApps({ source });
  const dist = path.join(ROOT, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'site'), dist, { recursive: true });
  for (const [file, body] of Object.entries(pages(apps))) {
    const p = path.join(dist, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  fs.writeFileSync(path.join(dist, 'CNAME'), config.domain + '\n');
  fs.writeFileSync(path.join(dist, '.nojekyll'), '');
  console.log(`built ${apps.length} box(es) → dist/  [${apps.map((a) => a.slug).join(', ') || 'none yet'}]`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
