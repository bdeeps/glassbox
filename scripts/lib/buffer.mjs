// Turns a box's glassbox/post.json into Buffer createPost calls.
// Buffer's API takes media by public URL only, so every asset must already be
// live at https://<domain>/<slug>/glassbox/… before we post.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, config } from './apps.mjs';

const API = 'https://api.buffer.com';

export function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

async function gql(query, variables) {
  const key = process.env.BUFFER_API_KEY;
  if (!key) throw new Error('BUFFER_API_KEY is not set (put it in .env locally, or a repo secret in CI)');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) throw new Error(`Buffer ${res.status}: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

export async function channels() {
  const { account } = await gql('query { account { organizations { id name } } }');
  const out = [];
  for (const org of account.organizations) {
    // Inlined as a literal so we don't depend on the input type's schema name.
    const { channels } = await gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service isQueuePaused } }`);
    out.push(...channels.map((c) => ({ ...c, org: org.name })));
  }
  return out;
}

export const assetBase = (slug) => `${SITE}/${slug}/glassbox/`;

export async function fetchPlan(slug) {
  const res = await fetch(assetBase(slug) + 'post.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`post.json is not live yet at ${assetBase(slug)}post.json (${res.status}). Push the box repo and wait for Pages.`);
  return res.json();
}

// Checks every media URL the posts reference answers 200 from the public site.
export async function checkLive(urls, log = console.log) {
  const bad = [];
  await Promise.all(urls.map(async (u) => {
    const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) bad.push(`${u} → ${r ? r.status : 'network error'}`);
  }));
  if (bad.length) throw new Error(`not live yet:\n  ${bad.join('\n  ')}`);
  log(`all ${urls.length} media URLs are live`);
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Builds one createPost input per (target × matching channel).
export function buildPosts(plan, chans, { mode = 'schedule' } = {}) {
  const base = assetBase(plan.slug);
  const A = plan.assets || {};
  const u = (f) => base + f;
  const c = plan.captions;
  const video = (f, extra = {}) => ({ video: { url: u(f), ...extra } });
  const at = plan.schedule?.at ? new Date(plan.schedule.at) : null;
  const posts = [];
  const media = new Set();

  for (const t of plan.targets || config.post.targets) {
    if (t.enabled === false) continue;
    const input = { schedulingType: 'automatic', assets: [] };
    switch (`${t.service}:${t.kind}`) {
      case 'instagram:reel':
        if (!A.reel) continue;
        input.text = c.instagram;
        input.assets = [video(A.reel, { metadata: { thumbnailOffset: plan.thumbnailOffsetMs ?? 1200 } })];
        input.metadata = { instagram: { type: 'reel', shouldShareToFeed: true } };
        break;
      case 'instagram:carousel':
        if (!A.slides?.length) continue;
        input.text = c.carousel || c.instagram;
        input.assets = A.slides.slice(0, 10).map((f) => ({ image: { url: u(f) } }));
        input.metadata = { instagram: { type: 'carousel', shouldShareToFeed: true } };
        break;
      case 'youtube:short':
        if (!A.reel) continue;
        input.text = c.youtube.description;
        input.assets = [video(A.reel)];
        input.metadata = { youtube: { title: clip(c.youtube.title, 100), categoryId: config.post.youtubeCategoryId, privacy: 'public', madeForKids: false, notifySubscribers: true } };
        break;
      case 'youtube:video':
        if (!A.video) continue;
        input.text = c.youtubeLong.description;
        input.assets = [video(A.video)];
        input.metadata = { youtube: { title: clip(c.youtubeLong.title, 100), categoryId: config.post.youtubeCategoryId, privacy: 'public', madeForKids: false, notifySubscribers: false } };
        break;
      case 'instagram:history-reel':
        if (!A.historyReel || !c.history) continue;
        input.text = c.history.instagram;
        input.assets = [video(A.historyReel, { metadata: { thumbnailOffset: 1500 } })];
        input.metadata = { instagram: { type: 'reel', shouldShareToFeed: true } };
        break;
      case 'instagram:history-carousel':
        if (!A.historySlides?.length || !c.history) continue;
        input.text = c.history.instagram;
        input.assets = A.historySlides.slice(0, 10).map((f) => ({ image: { url: u(f) } }));
        input.metadata = { instagram: { type: 'carousel', shouldShareToFeed: true } };
        break;
      case 'youtube:history-short':
        if (!A.historyReel || !c.history) continue;
        input.text = c.history.youtube.description;
        input.assets = [video(A.historyReel)];
        input.metadata = { youtube: { title: clip(c.history.youtube.title, 100), categoryId: config.post.youtubeCategoryId, privacy: 'public', madeForKids: false, notifySubscribers: true } };
        break;
      case 'twitter:video':
        if (!A.video) continue;
        input.text = clip(c.short, 280);
        input.assets = [video(A.video)];
        break;
      case 'linkedin:video':
        if (!A.video) continue;
        input.text = c.linkedin;
        input.assets = [video(A.video)];
        break;
      case 'threads:video':
      case 'tiktok:video':
      case 'facebook:video':
      case 'bluesky:video':
      case 'mastodon:video':
        if (!A.reel) continue;
        input.text = t.service === 'bluesky' ? clip(c.short, 300) : t.service === 'mastodon' ? clip(c.short, 500) : c.linkedin;
        input.assets = [video(A.reel)];
        break;
      default:
        continue;
    }
    if (mode === 'now') input.mode = 'shareNow';
    else if (mode === 'queue' || !at) input.mode = 'addToQueue';
    else {
      input.mode = 'customScheduled';
      input.dueAt = new Date(at.getTime() + (t.offsetHours || 0) * 3600e3).toISOString();
    }
    const matches = chans.filter((ch) => ch.service === t.service);
    for (const ch of matches) {
      posts.push({ target: `${t.service}:${t.kind}`, channel: ch, input: { ...input, channelId: ch.id } });
      input.assets.forEach((a) => media.add((a.video || a.image).url));
    }
  }
  return { posts, media: [...media] };
}

export async function createPost(input) {
  const data = await gql(`mutation($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt status } }
      ... on MutationError { message }
    }
  }`, { input });
  const r = data.createPost;
  if (r.message) throw new Error(r.message);
  return r.post;
}

const postedFile = (slug) => path.join(ROOT, 'posted', `${slug}.json`);
export const alreadyPosted = (slug) => (fs.existsSync(postedFile(slug)) ? JSON.parse(fs.readFileSync(postedFile(slug), 'utf8')) : null);

// Runs the whole thing. mode: schedule | queue | now. dry: print, don't post.
export async function ship(slug, { dry = false, mode = 'schedule', force = false, plan: given, log = console.log } = {}) {
  loadEnv();
  const prev = alreadyPosted(slug);
  if (prev && !force && !dry) throw new Error(`${slug} was already posted on ${prev.at}. Use --force to post again.`);
  const plan = given || (await fetchPlan(slug));
  let chans;
  const placeholders = () => [...new Set((plan.targets || config.post.targets).map((t) => t.service))].map((s) => ({ id: `<${s}-channel>`, service: s, name: s }));
  if (process.env.BUFFER_API_KEY) chans = await channels();
  else if (dry) { log('(no BUFFER_API_KEY: dry run against placeholder channels)'); chans = placeholders(); }
  else throw new Error('BUFFER_API_KEY is not set');
  if (!chans.length && dry) { log('(no channels connected in Buffer yet: previewing against placeholder channels)'); chans = placeholders(); }
  else if (!chans.length) throw new Error('No channels are connected in Buffer yet. Connect YouTube, Instagram and the rest at buffer.com, then publish again.');
  const { posts, media } = buildPosts(plan, chans, { mode });
  const missing = [...new Set((plan.targets || []).filter((t) => t.enabled !== false).map((t) => t.service))].filter((s) => !chans.some((c) => c.service === s));
  if (missing.length) log(`no Buffer channel connected for: ${missing.join(', ')} (skipped)`);
  if (!posts.length) throw new Error('nothing to post: no enabled target has both media and a connected channel');
  log(`${posts.length} post(s) for ${slug}:`);
  for (const p of posts) log(`  • ${p.target.padEnd(20)} → ${p.channel.displayName || p.channel.name}  ${p.input.mode}${p.input.dueAt ? ' ' + p.input.dueAt : ''}`);
  if (dry) {
    await checkLive(media, log).catch((e) => log('⚠ ' + e.message));
    log('dry run: nothing sent to Buffer');
    return { dry: true, posts: posts.map((p) => ({ target: p.target, channel: p.channel.name, input: p.input })) };
  }
  await checkLive(media, log);
  const results = [];
  for (const p of posts) {
    try {
      const post = await createPost(p.input);
      results.push({ target: p.target, channel: p.channel.name, id: post.id, dueAt: post.dueAt, status: post.status });
      log(`  ✓ ${p.target} → ${post.status || 'queued'} ${post.dueAt || ''}`);
    } catch (e) {
      results.push({ target: p.target, channel: p.channel.name, error: e.message });
      log(`  ✗ ${p.target}: ${e.message}`);
    }
  }
  fs.mkdirSync(path.dirname(postedFile(slug)), { recursive: true });
  fs.writeFileSync(postedFile(slug), JSON.stringify({ slug, at: new Date().toISOString(), mode, results }, null, 2) + '\n');
  return { results };
}
