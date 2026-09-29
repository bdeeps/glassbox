// One-click publishing for a box, and the auto-publisher.
// Hootsuite is the primary channel: every target it can post (Instagram, Facebook, LinkedIn,
// X, TikTok) goes there when it's connected and has that profile. Everything else, notably
// YouTube, goes to Buffer. What was published is recorded in the admin store, so a box is
// never posted twice by accident, even with several replicas running.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './apps.mjs';
import * as store from './store.mjs';
import * as hoot from './hootsuite.mjs';
import * as sp from './socialpilot.mjs';
import { channels, buildPosts, createPost, checkLive, mediaUrl, niceName } from './buffer.mjs';

// `channel`: 'split' (default) sends videos through Hootsuite and everything else through
// SocialPilot; 'hootsuite' sends everything through Hootsuite.
const DEFAULTS = { auto: false, when: 'auto', baseline: [], since: null, buffer: false, channel: 'split' };
export const settings = async () => { const s = { ...DEFAULTS, ...((await store.get('settings')) || {}) }; if (s.channel === 'socialpilot') s.channel = 'split'; return s; };

export async function saveSettings(next, apps) {
  const cur = await settings();
  const s = { ...cur };
  if (typeof next.auto === 'boolean' && next.auto !== cur.auto) {
    s.auto = next.auto;
    // Turning auto on only covers boxes that become ready from now on; older ones stay
    // for you to publish (or not) by hand.
    if (next.auto) { s.since = new Date().toISOString(); s.baseline = apps.filter((a) => readiness(a).ready).map((a) => a.slug); }
    await store.log(`auto-publish turned ${next.auto ? 'on' : 'off'}`);
  }
  if (['auto', 'queue', 'now'].includes(next.when)) s.when = next.when;
  if (typeof next.buffer === 'boolean') s.buffer = next.buffer;
  if (['split', 'hootsuite'].includes(next.channel) && next.channel !== cur.channel) { s.channel = next.channel; await store.log(next.channel === 'split' ? 'videos through Hootsuite, the rest through SocialPilot' : 'everything through Hootsuite'); }
  await store.set('settings', s);
  return s;
}

const planOf = (box) => { try { return JSON.parse(fs.readFileSync(path.join(box.dir, 'glassbox', 'post.json'), 'utf8')); } catch { return null; } };

// Ready = recorded, with every media file its plan names published in the box repo.
export function readiness(box) {
  const plan = planOf(box);
  if (!plan) return { ready: false, why: 'not recorded yet' };
  const files = Object.values(plan.assets || {}).flat().filter((f) => typeof f === 'string');
  const missing = files.filter((f) => !fs.existsSync(path.join(box.dir, 'glassbox', f)));
  return missing.length ? { ready: false, why: `missing ${missing.join(', ')}` } : { ready: true, plan };
}

// Provider-neutral posts: one per enabled target, with its words, media and time.
function targetsOf(plan, when, dir, at) {
  const A = plan.assets || {}, c = plan.captions || {};
  const start = at ? Date.parse(at) : plan.schedule?.at ? Date.parse(plan.schedule.at) : NaN;
  const out = [];
  for (const t of plan.targets || config.post.targets) {
    if (t.enabled === false) continue;
    const off = start + (t.offsetHours || 0) * 3600e3;
    const at = (when === 'auto' || when === 'at') && off > Date.now() + 10 * 60e3 ? new Date(off).toISOString() : null;
    const reel = A.reel && [A.reel], video = A.video && [A.video], hist = A.historyReel && [A.historyReel];
    const yt = (cap, files) => cap && files && { title: (cap.title || '').slice(0, 100), text: cap.description, files };
    const map = {
      'instagram:reel': reel && { text: c.instagram, files: reel },
      'instagram:carousel': A.slides?.length && { text: c.carousel || c.instagram, files: A.slides.slice(0, 10) },
      'instagram:history-reel': hist && c.history && { text: c.history.instagram, files: hist },
      'instagram:history-carousel': A.historySlides?.length && c.history && { text: c.history.instagram, files: A.historySlides.slice(0, 10) },
      'youtube:short': yt(c.youtube, reel),
      'youtube:video': yt(c.youtubeLong, video),
      'youtube:history-short': yt(c.history?.youtube, hist),
      'linkedin:video': video && { text: c.linkedin, files: video },
      'twitter:video': video && { text: (c.short || '').slice(0, 280), files: video },
      'facebook:video': reel && { text: c.linkedin, files: reel },
      'tiktok:video': reel && { text: c.linkedin, files: reel },
      'threads:video': reel && { text: c.linkedin, files: reel },
    };
    const key = `${t.service}:${t.kind}`;
    const m = map[key] || {};
    const names = m.files || [];
    out.push({ target: key, service: t.service, kind: t.kind, at, title: m.title, text: m.text,
      media: names.length ? names.map((f) => mediaUrl(plan, f)) : undefined,
      files: names.map((f) => ({ path: path.join(dir, 'glassbox', f), name: niceName(plan, f) })), raw: t });
  }
  return out;
}

// Publishes one box. Streams progress through log(). Returns the stored record.
export async function publishBox(box, { dry = false, force = false, all: everything = false, when, at = null, drafts = false, log = () => {}, by = 'you' } = {}) {
  const s = await settings();
  when ||= s.when;
  const r = readiness(box);
  if (!r.ready) throw new Error(`${box.slug} isn't ready: ${r.why}`);
  const prev = await store.get('posted:' + box.slug);
  if (prev && !force && !dry) throw new Error(`${box.slug} was already published on ${new Date(prev.at).toUTCString()}. Tick "publish again" to post it a second time.`);
  if (!dry && !(await store.claim('publishing:' + box.slug, { by }))) throw new Error(`${box.slug} is being published right now.`);
  try {
    const plan = { ...r.plan, slug: box.slug };
    if (at) when = 'at';
    let all = targetsOf(plan, when, box.dir, at);
    // "Publish again" retries only what didn't go out last time, so nothing is posted twice.
    // "Publish again" with all=true sends everything once more, on purpose.
    const doneBefore = new Set(everything ? [] : (prev?.results || []).filter((x) => !x.error && !x.skipped && !x.dry).map((x) => x.target));
    if (prev && force && doneBefore.size) { all = all.filter((p) => !doneBefore.has(p.target)); log(`already out: ${[...doneBefore].join(', ')} (not posted again)`); }
    // Records what went out (whichever service sent it) and reports.
    const finish = async (results) => {
      results.filter((x) => x.skipped).forEach((x) => log(`  – ${x.target}: ${x.skipped}`));

      const posted = results.filter((x) => !x.error && !x.skipped && !x.dry);
      if (dry) { log('dry run: nothing was sent'); return { dry: true, results }; }
      if (!posted.length) { const why = results.find((x) => x.error || x.skipped); throw new Error(doneBefore.size ? 'nothing new was published' : `nothing was published${why ? ': ' + (why.error || why.skipped) : ''}`); }
      const kept = (prev?.results || []).filter((x) => doneBefore.has(x.target));
      const rec = { at: new Date().toISOString(), when, by, ...(drafts && at ? { draftFor: at } : {}), results: [...kept, ...results] };
      await store.set('posted:' + box.slug, rec);
      await store.log(`published ${posted.length} of ${results.length} target(s)`, { slug: box.slug, provider: [...new Set(posted.map((x) => x.provider))].join('+'), ok: posted.length === results.length });
      log(`done: ${posted.length} of ${results.length} target(s) published`);
      return rec;
    };
    if (s.channel === 'split') {
      const isVideo = (p) => (p.media || []).some((u) => /\.mp4(\?|$)/i.test(u));
      const vids = all.filter((p) => p.media && isVideo(p)), rest = all.filter((p) => p.media && !isVideo(p));
      log(`${box.slug}: ${vids.length} video(s) through Hootsuite, ${rest.length} other post(s) through SocialPilot${drafts ? ' · as drafts' : ''}`);
      const media = [...new Set(all.flatMap((p) => p.media || []))];
      if (media.length) await checkLive(media, log);
      const results = [];
      if (vids.length) {
        if (!(await hoot.connected().catch(() => false))) vids.forEach((p) => results.push({ provider: 'hootsuite', target: p.target, skipped: 'Hootsuite is not connected' }));
        else {
          try { results.push(...(await hoot.publish(vids, { dry, drafts, log })).map((x) => ({ provider: 'hootsuite', ...x }))); }
          catch (e) { log(`✗ Hootsuite: ${e.message}`); vids.forEach((p) => results.push({ provider: 'hootsuite', target: p.target, error: e.message })); }
        }
      }
      if (rest.length) results.push(...(await sp.publish(rest, { dry, drafts, log })).map((x) => ({ provider: 'socialpilot', ...x })));
      all.filter((p) => !p.media).forEach((p) => results.push({ provider: 'socialpilot', target: p.target, skipped: 'nothing to post' }));
      return finish(results);
    }
    const useHoot = await hoot.connected().catch(() => false);
    let hootProfiles = [];
    if (useHoot) { try { hootProfiles = await hoot.profiles(); } catch (e) { log(`⚠ Hootsuite: ${e.message} (using Buffer instead)`); } }
    const viaHoot = all.filter((p) => p.media && hoot.SERVICES.includes(p.service) && hootProfiles.some((x) => x.service === p.service));
    const viaBuffer = all.filter((p) => !viaHoot.includes(p));
    log(`${box.slug}: ${all.length} target(s) · ${when === 'now' ? 'posting now' : when === 'queue' ? 'next free slot' : when === 'at' ? 'for ' + new Date(at).toUTCString() : 'at its scheduled time'}${drafts ? ' · as drafts' : ''}`);
    log(`Hootsuite: ${viaHoot.length ? viaHoot.map((p) => p.target).join(', ') : useHoot ? 'none (no matching profiles)' : 'not connected'}`);

    const media = [...new Set(all.flatMap((p) => p.media || []))];
    if (media.length) await checkLive(media, log);

    const results = [];
    if (viaHoot.length) results.push(...(await hoot.publish(viaHoot, { dry, drafts, log })).map((x) => ({ provider: 'hootsuite', ...x })));

    if (viaBuffer.length && !s.buffer) viaBuffer.forEach((p) => results.push({ provider: 'hootsuite', target: p.target, skipped: `no ${p.service} profile in Hootsuite` }));
    else if (viaBuffer.length) {
      if (!process.env.BUFFER_API_KEY) { log('Buffer: no API key, skipped ' + viaBuffer.map((p) => p.target).join(', ')); }
      else {
        const chans = await channels();
        const bufPlan = { ...plan, targets: viaBuffer.map((p) => p.raw) };
        const mode = when === 'now' ? 'now' : when === 'queue' ? 'queue' : (viaBuffer.some((p) => p.at) ? 'schedule' : 'queue');
        const { posts } = buildPosts(bufPlan, chans, { mode });
        const covered = new Set(posts.map((p) => p.target));
        viaBuffer.filter((p) => !covered.has(p.target)).forEach((p) => results.push({ provider: 'buffer', target: p.target, skipped: `no ${p.service} channel connected` }));
        for (const p of posts) {
          if (dry) { log(`  • ${p.target.padEnd(20)} → Buffer ${p.channel.displayName || p.channel.name} ${p.input.mode}`); results.push({ provider: 'buffer', target: p.target, dry: true }); continue; }
          try {
            const post = await createPost(p.input);
            results.push({ provider: 'buffer', target: p.target, channel: p.channel.name, id: post.id, dueAt: post.dueAt });
            log(`  ✓ ${p.target} → Buffer (${p.channel.displayName || p.channel.name})`);
          } catch (e) {
            results.push({ provider: 'buffer', target: p.target, error: e.message });
            log(`  ✗ ${p.target} (Buffer): ${e.message}`);
          }
        }
      }
    }
    return finish(results);
  } catch (e) {
    if (!dry) await store.log(e.message, { slug: box.slug, ok: false });
    throw e;
  } finally {
    if (!dry) await store.del('publishing:' + box.slug).catch(() => {});
  }
}

// Called after every sync: publishes boxes that became ready since auto was switched on.
let running = false;
export async function autoPublish(apps, logFn = console.log) {
  if (running) return;
  running = true;
  try {
    const s = await settings();
    if (!s.auto) return;
    const done = await store.list('posted:');
    for (const box of apps) {
      if (s.baseline.includes(box.slug) || done['posted:' + box.slug]) continue;
      if (!readiness(box).ready) continue;
      if (!(await store.claim('auto:' + box.slug, {}, 6 * 3600e3))) continue;   // another replica has it
      logFn(`auto-publishing ${box.slug}`);
      await publishBox(box, { by: 'auto', log: logFn }).catch((e) => logFn(`auto-publish ${box.slug} failed: ${e.message}`));
    }
  } catch (e) {
    logFn('auto-publish: ' + e.message);
  } finally { running = false; }
}

// ---- Scheduled drafts
// A list of { slug, at } that becomes Hootsuite drafts dated `at`, worked through in the
// background one box at a time. It lives in the shared store, so progress survives page
// reloads and restarts, and only one replica works on it at once.
const QUEUE = 'schedule:items';
export const scheduleItems = async () => (await store.get(QUEUE)) || [];

export async function addToSchedule(items) {
  const cur = await scheduleItems();
  const slugs = new Set(items.map((x) => x.slug));
  const next = [...cur.filter((x) => !slugs.has(x.slug) || x.state === 'running'),
    ...items.filter((x) => !cur.some((y) => y.slug === x.slug && y.state === 'running'))
      .map((x) => ({ slug: x.slug, at: new Date(x.at).toISOString(), state: 'queued', added: new Date().toISOString() }))];
  next.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  await store.set(QUEUE, next);
  await store.log(`${items.length} box(es) scheduled as drafts`, { provider: 'hootsuite' });
  return next;
}

export async function removeFromSchedule(slug) {
  const cur = await scheduleItems();
  const next = cur.filter((x) => (slug ? !(x.slug === slug && x.state !== 'running') : x.state === 'running' || x.state === 'done'));
  await store.set(QUEUE, next);
  return next;
}

let scheduling = false;
export async function runSchedule(getApps, logFn = console.log) {
  if (scheduling) return;
  scheduling = true;
  try {
    for (;;) {
      let items = await scheduleItems();
      // A box left "running" for 30 minutes belonged to a replica that stopped: try it again.
      items = items.map((x) => (x.state === 'running' && Date.now() - Date.parse(x.startedAt || 0) > 30 * 60e3 ? { ...x, state: 'queued' } : x));
      const item = items.find((x) => x.state === 'queued');
      if (!item) break;
      if (!(await store.claim('schedule:runner', {}, 30 * 60e3))) break;   // another replica is on it
      const box = getApps().find((a) => a.slug === item.slug);
      const mark = async (patch) => {
        const now = await scheduleItems();
        await store.set(QUEUE, now.map((x) => (x.slug === item.slug ? { ...x, ...patch } : x)));
      };
      await mark({ state: 'running', startedAt: new Date().toISOString(), error: null });
      const lines = [];
      try {
        if (!box) throw new Error('box not found on this server');
        await publishBox(box, { at: item.at, drafts: true, force: true, by: 'schedule', log: (m) => { lines.push(m); logFn(`[schedule ${item.slug}] ${m}`); } });
        await mark({ state: 'done', doneAt: new Date().toISOString() });
      } catch (e) {
        await mark({ state: 'error', error: e.message.slice(0, 300) });
      }
      await store.del('schedule:runner').catch(() => {});
    }
  } catch (e) {
    logFn('schedule: ' + e.message);
  } finally { scheduling = false; }
}
