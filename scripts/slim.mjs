// Frees disk after publishing: swaps a box folder for a partial clone of its GitHub repo
// that leaves out the videos (glassbox/*.mp4). Code, images and history stay local; the
// videos stay on GitHub and the live site. Only runs when the folder is clean and pushed.
//   node scripts/slim.mjs <slug> [<slug> …]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync as x } from 'node:child_process';
import { ROOT, config } from './lib/apps.mjs';

const git = (dir, ...a) => x('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
for (const slug of process.argv.slice(2)) {
  const dir = path.resolve(ROOT, '..', slug), tmp = path.resolve(ROOT, '..', `.${slug}-slim`);
  try {
    git(dir, 'fetch', '-q', 'origin');
    if (git(dir, 'status', '--porcelain')) throw new Error('has uncommitted changes');
    if (git(dir, 'rev-list', '--count', 'origin/main..HEAD') !== '0') throw new Error('has commits not on GitHub');
    fs.rmSync(tmp, { recursive: true, force: true });
    x('git', ['clone', '-q', '--filter=blob:limit=1m', '--sparse', '--no-checkout', `https://github.com/${config.org}/${slug}`, tmp]);
    git(tmp, 'sparse-checkout', 'set', '--no-cone', '/*', '!/glassbox/*.mp4');
    git(tmp, 'checkout', '-q', 'main');
    git(tmp, 'config', 'http.postBuffer', '524288000');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    console.log(`✓ ${slug} slimmed`);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); console.log(`✗ ${slug}: ${e.message.split('\n')[0]}`); }
}
