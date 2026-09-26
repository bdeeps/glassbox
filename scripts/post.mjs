// Posts a box to every connected Buffer channel.
//   npm run post -- cameraclear --dry     preview the posts and check media is live
//   npm run post -- cameraclear           schedule at post.json's time (or queue)
//   npm run post -- cameraclear --queue   add to each channel's Buffer queue
//   npm run post -- cameraclear --now     publish immediately
//   npm run post -- --channels            list connected Buffer channels
import { ship, channels, loadEnv } from './lib/buffer.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const slug = args.find((a) => !a.startsWith('--'));

(async () => {
  if (flag('--channels')) {
    loadEnv();
    for (const c of await channels()) console.log(`${c.service.padEnd(12)} ${c.displayName || c.name}  (${c.id})${c.isQueuePaused ? '  [queue paused]' : ''}`);
    return;
  }
  if (!slug) { console.error('usage: npm run post -- <slug> [--dry] [--queue|--now] [--force]'); process.exit(2); }
  const mode = flag('--now') ? 'now' : flag('--queue') ? 'queue' : 'schedule';
  const r = await ship(slug, { dry: flag('--dry'), mode, force: flag('--force') });
  if (r.results?.some((x) => x.error)) process.exit(1);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
