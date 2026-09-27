// Keeps the calendar current: the newest published box is dated today, and every earlier box
// takes the day before, filling back through September, August and so on. Box numbers never
// change (they're in the videos), so dates rise with the numbers. Boxes not recorded yet are
// dated after today; they move back when they're published and this runs again.
// Writes dates.json in the hub (read by scripts/lib/apps.mjs). No box repo changes.
//   node scripts/redate.mjs            # today in the config time zone
//   node scripts/redate.mjs 2026-09-27 # as of a given day
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, localApps } from './lib/apps.mjs';

const tz = config.post?.timezone || 'Asia/Kolkata';
const today = process.argv[2] || new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const day = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);

const boxes = localApps().filter((a) => a.kind !== 'principle').sort((a, b) => a.box - b.box);
const ready = boxes.filter((a) => a.media['post.json']);
const waiting = boxes.filter((a) => !a.media['post.json']);
const out = { startDate: null, boxes: {} };
ready.forEach((a, i) => { out.boxes[a.slug] = day(today, i - (ready.length - 1)); });
waiting.forEach((a, i) => { out.boxes[a.slug] = day(today, i + 1); });
out.startDate = ready.length ? out.boxes[ready[0].slug] : today;

const file = path.join(ROOT, 'dates.json');
const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const text = JSON.stringify(out, null, 2) + '\n';
if (text !== before) fs.writeFileSync(file, text);
for (const a of boxes) console.log(`No. ${a.no}  ${out.boxes[a.slug]}  ${a.slug}${a.media['post.json'] ? '' : '  (not published yet)'}`);
console.log(`start ${out.startDate} · newest published ${ready.length ? out.boxes[ready.at(-1).slug] : '—'} · ${text === before ? 'unchanged' : 'dates.json updated'}`);
