// Email and push subscribers: sign-up (with a confirmation link), unsubscribe, and the mails
// that go out: a note when new explainers are added, a weekly digest, and a daily count of
// registrations to the team. People are stored in the shared store under "sub:<hash>"; push
// subscriptions under "pushsub:<hash>". No IP addresses or device details are kept.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SITE, config, esc } from './apps.mjs';
import * as store from './store.mjs';
import * as mailer from './mailer.mjs';
import * as webpush from './webpush.mjs';

const REPORT_TO = process.env.REPORT_TO || 'glassbox@cleartrust.cc';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
const keyOf = (email) => 'sub:' + hash(email.trim().toLowerCase());
const token = () => crypto.randomBytes(24).toString('base64url');
const EMAIL = /^[^\s@<>"',;]{1,64}@[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/i;

// India time, where the team and most readers are.
const ist = (t = Date.now()) => new Date(t + 330 * 60e3);
const istDay = (t) => ist(t).toISOString().slice(0, 10);

export const allSubs = async () => Object.values(await store.list('sub:'));
export const allPush = async () => Object.entries(await store.list('pushsub:'));

// Everyone who signed up, newest first, for the admin's list. Tokens are left out.
export async function listSubs() {
  const push = new Set((await allPush()).map(([, p]) => p.sub).filter(Boolean));
  return Object.entries(await store.list('sub:')).map(([key, s]) => ({ email: s.email, status: s.status, at: s.at || null, source: s.source || '', confirmSentAt: s.confirmSentAt || null, confirmedAt: s.confirmedAt || null, unsubAt: s.unsubAt || null, push: push.has(key) }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export async function stats() {
  const subs = await allSubs(), today = istDay();
  const on = (iso) => iso && istDay(Date.parse(iso)) === today;
  return {
    total: subs.filter((s) => s.status === 'active').length, pending: subs.filter((s) => s.status === 'pending').length,
    unsubscribed: subs.filter((s) => s.status === 'unsub').length, push: (await allPush()).length,
    today: { signups: subs.filter((s) => on(s.at)).length, confirmed: subs.filter((s) => on(s.confirmedAt)).length, unsubscribed: subs.filter((s) => on(s.unsubAt)).length },
    mail: mailer.provider(), from: mailer.sender(),
  };
}

// ---------------------------------------------------------------- emails
const boxUrl = (a) => `${SITE}/e/${a.slug}/`;
const coverOf = (a) => `${SITE}/${a.slug}/glassbox/cover.jpg`;

function shell({ preheader, body, unsub }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(config.brand)}</title></head>
<body style="margin:0;background:#07080c;color:#eef0f6;font:16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080c"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 18px;font:600 18px/1 Georgia,serif;color:#eef0f6"><a href="${SITE}/" style="color:#eef0f6;text-decoration:none">◈ ${esc(config.brand)}</a></td></tr>
<tr><td style="background:#10131b;border:1px solid #232735;border-radius:18px;padding:26px 24px">${body}</td></tr>
<tr><td style="padding:18px 6px 0;color:#8b91a3;font-size:12.5px;line-height:1.6">${esc(config.brand)}: one interactive explainer a day. Free, no ads.<br>${unsub ? `You're getting this because you asked for new explainers at ${esc(config.domain)}. <a href="${unsub}" style="color:#8ef0ff">Unsubscribe</a> at any time.` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label) => `<a href="${href}" style="display:inline-block;background:#8ef0ff;color:#07080c;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(label)}</a>`;
const boxCard = (a) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td>
<a href="${boxUrl(a)}" style="text-decoration:none;color:#eef0f6"><img src="${coverOf(a)}" alt="" width="512" style="width:100%;max-width:512px;height:auto;border-radius:12px;display:block;border:0">
<p style="margin:12px 0 4px;font:400 20px/1.25 Georgia,serif;color:#eef0f6">${esc(a.question)}</p></a>
<p style="margin:0 0 10px;color:#a8aebf;font-size:14.5px">${esc(a.hook || '')}</p>
<a href="${boxUrl(a)}" style="color:#8ef0ff;font-weight:600;text-decoration:none">Open the box →</a></td></tr></table>`;
const boxLines = (list) => list.map((a) => `${a.question}\n${a.hook || ''}\n${boxUrl(a)}`).join('\n\n');

function confirmMail(s) {
  const link = `${SITE}/api/confirm?t=${s.token}`;
  return {
    subject: `Confirm your email for ${config.brand}`,
    html: shell({ preheader: 'One click and you will hear about every new explainer.', body: `<h1 style="margin:0 0 10px;font:400 26px/1.2 Georgia,serif">One click to confirm</h1>
<p style="margin:0 0 18px;color:#c9cedb">You asked to hear about new ${esc(config.brand)} explainers: interactive 3D models that show how things work. Confirm it's really you and we'll write when a new one is added, plus a short digest each week.</p>
<p style="margin:0 0 18px">${button(link, 'Yes, keep me posted')}</p>
<p style="margin:0;color:#8b91a3;font-size:13.5px">If you didn't ask for this, ignore this email and you won't hear from us again.</p>` }),
    text: `Confirm your email for ${config.brand}\n\nYou asked to hear about new ${config.brand} explainers. Confirm here:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  };
}
function newBoxesMail(s, list) {
  const unsub = `${SITE}/api/unsubscribe?t=${s.token}`;
  const one = list.length === 1;
  return {
    subject: one ? `New on ${config.brand}: ${list[0].question}` : `${list.length} new explainers on ${config.brand}`,
    html: shell({ preheader: one ? list[0].hook || list[0].question : list.map((a) => a.question).join(' · '), unsub, body: `<h1 style="margin:0 0 16px;font:400 26px/1.2 Georgia,serif">${one ? 'A new box just opened' : `${list.length} new boxes just opened`}</h1>${list.slice(0, 8).map(boxCard).join('')}${list.length > 8 ? `<p style="margin:0"><a href="${SITE}/" style="color:#8ef0ff">And ${list.length - 8} more on the shelf →</a></p>` : ''}` }),
    text: `${one ? 'A new box just opened' : `${list.length} new boxes just opened`} on ${config.brand}\n\n${boxLines(list)}\n\nUnsubscribe: ${unsub}`,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
function digestMail(s, list, range) {
  const unsub = `${SITE}/api/unsubscribe?t=${s.token}`;
  return {
    subject: `This week on ${config.brand}: ${list.length} new explainer${list.length === 1 ? '' : 's'}`,
    html: shell({ preheader: list.map((a) => a.question).slice(0, 4).join(' · '), unsub, body: `<h1 style="margin:0 0 6px;font:400 26px/1.2 Georgia,serif">Your week in glass boxes</h1>
<p style="margin:0 0 18px;color:#a8aebf;font-size:14.5px">${esc(range)} · ${list.length} new explainer${list.length === 1 ? '' : 's'}. Pick one, play with it for five minutes, and share it with a curious friend.</p>${list.slice(0, 10).map(boxCard).join('')}${list.length > 10 ? `<p style="margin:0 0 14px"><a href="${SITE}/" style="color:#8ef0ff">And ${list.length - 10} more on the shelf →</a></p>` : ''}
<p style="margin:6px 0 0">${button(SITE + '/', 'See the whole shelf')}</p>` }),
    text: `Your week on ${config.brand} (${range})\n\n${boxLines(list)}\n\nThe whole shelf: ${SITE}/\n\nUnsubscribe: ${unsub}`,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
function reportMail(day, st, names) {
  const rows = [['New sign-ups today', st.today.signups], ['Confirmed today', st.today.confirmed], ['Unsubscribed today', st.today.unsubscribed], ['Active subscribers in total', st.total], ['Waiting to confirm', st.pending], ['Browser notification subscribers', st.push]];
  return {
    subject: `${config.brand} registrations for ${day}: ${st.today.signups} new`,
    html: shell({ preheader: `${st.today.signups} new, ${st.total} active in total.`, body: `<h1 style="margin:0 0 14px;font:400 24px/1.2 Georgia,serif">Registrations for ${esc(day)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #232735;color:#c9cedb">${k}</td><td align="right" style="padding:8px 0;border-top:1px solid #232735;font:600 18px/1 ui-monospace,Menlo,monospace;color:#8ef0ff">${v}</td></tr>`).join('')}</table>
${names.length ? `<p style="margin:16px 0 4px;color:#a8aebf;font-size:13.5px">Signed up today</p><p style="margin:0;font:13.5px/1.6 ui-monospace,Menlo,monospace;color:#c9cedb">${names.map(esc).join('<br>')}</p>` : ''}` }),
    text: `Registrations for ${day}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${names.length ? `\n\nSigned up today:\n${names.join('\n')}` : ''}`,
  };
}

// ---------------------------------------------------------------- sending
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function sendTo(s, mail) {
  for (let i = 0; i < 4; i++) {
    try { await mailer.send({ to: s.email, ...mail }); return true; }
    catch (e) { if (e.status === 429 || e.status >= 500) await wait(2000 * (i + 1)); else throw e; }
  }
  return false;
}
async function mailAll(build, log) {
  const subs = (await allSubs()).filter((s) => s.status === 'active');
  let ok = 0, bad = 0;
  for (const s of subs) {
    try { (await sendTo(s, build(s))) ? ok++ : bad++; } catch (e) { bad++; log(`mail to a subscriber failed: ${e.message}`); }
    await wait(600);   // stay under the mail service's rate limit
  }
  return { ok, bad, total: subs.length };
}
async function pushAll(data, log) {
  let ok = 0;
  for (const [key, sub] of await allPush()) {
    try { const r = await webpush.send(sub, data); if (r.gone) await store.del(key); else if (r.ok) ok++; }
    catch (e) { log(`push failed: ${e.message}`); }
  }
  return ok;
}

// ---------------------------------------------------------------- public API
const hits = new Map();
function limited(req, max = 8, windowMs = 3600e3) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
async function readJson(req, max = 8192) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const sameOrigin = (req) => { try { return !req.headers.origin || new URL(req.headers.origin).host === req.headers.host; } catch { return false; } };
const validPush = (p) => p && typeof p.endpoint === 'string' && /^https:\/\/[a-z0-9.-]+\//i.test(p.endpoint) && p.endpoint.length < 1000 && typeof p.keys?.p256dh === 'string' && typeof p.keys?.auth === 'string';

function page(res, code, title, text) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(config.brand)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080c;color:#eef0f6;font:17px/1.55 system-ui,sans-serif"><main style="max-width:460px;padding:28px;text-align:center">
<h1 style="font:400 30px/1.2 Georgia,serif;margin:0 0 10px">${esc(title)}</h1><p style="color:#c9cedb;margin:0 0 22px">${text}</p><a href="/" style="display:inline-block;background:#8ef0ff;color:#07080c;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:999px">Back to ${esc(config.brand)}</a></main></body></html>`);
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

export async function publicApi(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/')) return false;

  if (p === '/api/push-key' && req.method === 'GET') return json(res, 200, { key: await webpush.publicKey() }), true;

  if (p === '/api/subscribe' && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'Please sign up from the site.' }), true;
    if (limited(req)) return json(res, 429, { error: 'Too many tries. Please come back in an hour.' }), true;
    let b; try { b = await readJson(req); } catch { return json(res, 400, { error: 'That did not come through. Please try again.' }), true; }
    if (b.website) return json(res, 200, { ok: true }), true;                      // a bot filled the hidden field
    const email = String(b.email || '').trim();
    if (email.length > 254 || !EMAIL.test(email)) return json(res, 400, { error: 'That email address does not look right.' }), true;
    const key = keyOf(email), old = await store.get(key);
    let s = old;
    if (!old || old.status === 'unsub') {
      s = { email, token: old?.token || token(), status: 'pending', at: new Date().toISOString(), source: String(b.source || 'welcome').slice(0, 40), consentAt: new Date().toISOString() };
      await store.set(key, s);
    }
    if (validPush(b.push)) await store.set('pushsub:' + hash(b.push.endpoint), { endpoint: b.push.endpoint, keys: { p256dh: b.push.keys.p256dh, auth: b.push.keys.auth }, at: new Date().toISOString(), sub: key });
    let sent = false;
    if (s.status === 'pending' && mailer.configured() && !(s.confirmSentAt && Date.now() - Date.parse(s.confirmSentAt) < 10 * 60e3)) {
      try { sent = await sendTo(s, confirmMail(s)); if (sent) await store.set(key, { ...s, confirmSentAt: new Date().toISOString() }); } catch { /* the job below retries */ }
    }
    return json(res, 200, { ok: true, status: s.status, confirm: s.status === 'pending' ? (sent || s.confirmSentAt ? 'sent' : 'soon') : null }), true;
  }

  if (p === '/api/push' && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'Please turn notifications on from the site.' }), true;
    if (limited(req, 20)) return json(res, 429, { error: 'Too many tries.' }), true;
    let b; try { b = await readJson(req); } catch { return json(res, 400, { error: 'bad request' }), true; }
    if (!validPush(b.push)) return json(res, 400, { error: 'bad subscription' }), true;
    const key = 'pushsub:' + hash(b.push.endpoint);
    if (b.remove) await store.del(key); else await store.set(key, { endpoint: b.push.endpoint, keys: { p256dh: b.push.keys.p256dh, auth: b.push.keys.auth }, at: new Date().toISOString() });
    return json(res, 200, { ok: true }), true;
  }

  const t = url.searchParams.get('t') || '';
  const find = async () => (t.length > 20 ? Object.entries(await store.list('sub:')).find(([, v]) => v.token === t) : null);
  if (p === '/api/confirm' && req.method === 'GET') {
    const hit = await find();
    if (!hit) return page(res, 404, 'That link has expired', 'Sign up again from the home page and we will send a fresh one.'), true;
    if (hit[1].status !== 'active') await store.set(hit[0], { ...hit[1], status: 'active', confirmedAt: new Date().toISOString(), unsubAt: null });
    return page(res, 200, "You're in", 'We will write when a new explainer is added, plus a short digest each week. You can unsubscribe from any email.'), true;
  }
  if (p === '/api/unsubscribe' && (req.method === 'GET' || req.method === 'POST')) {
    const hit = await find();
    if (hit && hit[1].status !== 'unsub') await store.set(hit[0], { ...hit[1], status: 'unsub', unsubAt: new Date().toISOString() });
    if (hit) for (const [k, v] of await allPush()) if (v.sub === hit[0]) await store.del(k);
    if (req.method === 'POST') return json(res, 200, { ok: true }), true;
    return page(res, 200, 'You are unsubscribed', 'No more emails from us. If that was a mistake, you can sign up again from the home page.'), true;
  }
  return json(res, 404, { error: 'not found' }), true;
}

// The daily report, on demand (the admin's "Email me today's report" button).
export async function sendReportNow() {
  const day = istDay(), st = await stats();
  const names = (await allSubs()).filter((x) => x.at && istDay(Date.parse(x.at)) === day).map((x) => x.email);
  await mailer.send({ to: REPORT_TO, ...reportMail(day, st, names) });
  return { to: REPORT_TO, day, signups: st.today.signups };
}

// ---------------------------------------------------------------- scheduled jobs
// Called every few minutes and after each sync. Each job claims its slot in the shared store,
// so with several replicas it still runs exactly once.
const FOREVER = 400 * 86400e3;   // Postgres cannot subtract a longer interval from now()
const isReady = (a) => { try { return fs.existsSync(path.join(a.dir, 'glassbox', 'post.json')) && fs.existsSync(path.join(a.dir, 'glassbox', 'cover.jpg')); } catch { return false; } };

let running = false;
export async function runJobs(getApps, log = console.log) {
  if (running) return;
  running = true;
  try {
    const apps = getApps().filter(isReady);
    if (!apps.length) return;                                    // not synced yet

    // 1. Confirmation emails that could not be sent at sign-up (no mail service then, or it failed).
    if (mailer.configured()) {
      for (const [key, s] of Object.entries(await store.list('sub:'))) {
        if (s.status !== 'pending' || s.confirmSentAt) continue;
        if (!(await store.claim('job:confirm:' + key, {}, 30 * 60e3))) continue;
        try { if (await sendTo(s, confirmMail(s))) await store.set(key, { ...s, confirmSentAt: new Date().toISOString() }); } catch (e) { log(`confirm mail failed: ${e.message}`); }
        await wait(600);
      }
    }

    // 2. New explainers. Everything already there the first time counts as known. New ones wait
    //    until 20 quiet minutes have passed, so several added together make one email.
    let st = await store.get('notify:state');
    const slugs = apps.map((a) => a.slug);
    if (!st) { st = { known: slugs, queue: [], seen: {} }; await store.set('notify:state', st); }
    const fresh = slugs.filter((x) => !st.known.includes(x));
    if (fresh.length) {
      // `seen` remembers when each box was added, for the weekly digest.
      st = { known: [...st.known, ...fresh], queue: [...st.queue, ...fresh.map((slug) => ({ slug, at: Date.now() }))], seen: { ...(st.seen || {}), ...Object.fromEntries(fresh.map((slug) => [slug, Date.now()])) } };
      await store.set('notify:state', st);
    }
    if (st.queue.length && Date.now() - Math.max(...st.queue.map((q) => q.at)) > 20 * 60e3 && (await store.claim('job:newboxes', {}, 30 * 60e3))) {
      const list = st.queue.map((q) => apps.find((a) => a.slug === q.slug)).filter(Boolean).sort((a, b) => b.box - a.box);
      await store.set('notify:state', { ...st, queue: [] });
      if (list.length) {
        const pushed = await pushAll({ title: list.length === 1 ? list[0].question : `${list.length} new explainers on ${config.brand}`, body: list.length === 1 ? (list[0].hook || 'A new box just opened.') : list.slice(0, 3).map((a) => a.question).join(' · '), url: list.length === 1 ? boxUrl(list[0]) : SITE + '/' }, log);
        const r = mailer.configured() ? await mailAll((s) => newBoxesMail(s, list), log) : { ok: 0, bad: 0, total: 0 };
        await store.log(`new explainers (${list.map((a) => a.slug).join(', ')}): ${r.ok} email(s), ${pushed} notification(s)${mailer.configured() ? '' : ' (no email service set up)'}`, { ok: r.bad === 0 });
      }
      await store.del('job:newboxes').catch(() => {});
    }

    // 3. The daily count to the team, after 23:30 India time.
    const now = ist(), day = istDay(), mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (mins >= 23 * 60 + 30 && mailer.configured() && (await store.claim('job:daily:' + day, {}, FOREVER))) {
      const s = await stats();
      const names = (await allSubs()).filter((x) => x.at && istDay(Date.parse(x.at)) === day).map((x) => x.email);
      try { await mailer.send({ to: REPORT_TO, ...reportMail(day, s, names) }); await store.log(`daily registrations report sent: ${s.today.signups} new, ${s.total} active`); }
      catch (e) { await store.del('job:daily:' + day).catch(() => {}); log(`daily report failed: ${e.message}`); }
    }

    // 4. The weekly digest: Sundays after 10:00 India time, the boxes opened in the last 7 days.
    if (now.getUTCDay() === 0 && mins >= 10 * 60 && mailer.configured() && (await store.claim('job:weekly:' + day, {}, FOREVER))) {
      const from = istDay(Date.now() - 7 * 86400e3), weekAgo = Date.now() - 7 * 86400e3;
      const added = apps.filter((a) => (st.seen || {})[a.slug] > weekAgo);
      const list = (added.length ? added : apps.filter((a) => a.date > from && a.date <= day)).sort((a, b) => b.box - a.box);
      if (list.length) {
        const r = await mailAll((s) => digestMail(s, list, `${from.slice(5)} to ${day.slice(5)}`), log);
        await store.log(`weekly digest: ${list.length} explainer(s) to ${r.ok} subscriber(s)`, { ok: r.bad === 0 });
      }
    }
  } catch (e) { log('subscriber jobs: ' + e.message); }
  finally { running = false; }
}
