// Sending email through Plinth (plinth.tools), the same service ClearTrust's other apps use.
// One function, send({ to, subject, html, text }). Nothing is sent until these are set:
//   PLINTH_API_KEY      the Plinth key
//   PLINTH_FROM_EMAIL   a sender address verified in Plinth
//   PLINTH_FROM_NAME    optional, defaults to the brand name
// Plinth's REST transport is POST /api/v1/call with the tool-call shape { name, arguments }.
import { config } from './apps.mjs';

const BASE = () => (process.env.PLINTH_BASE_URL || 'https://plinth.tools').replace(/\/+$/, '');
const FROM = () => `${process.env.PLINTH_FROM_NAME || config.brand} <${process.env.PLINTH_FROM_EMAIL}>`;

export const configured = () => !!(process.env.PLINTH_API_KEY && process.env.PLINTH_FROM_EMAIL);
export const provider = () => (configured() ? 'plinth' : null);
export const sender = () => (configured() ? FROM() : null);

export async function send({ to, subject, html, text }) {
  if (!configured()) throw new Error('email is not set up (PLINTH_API_KEY and PLINTH_FROM_EMAIL)');
  const res = await fetch(`${BASE()}/api/v1/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PLINTH_API_KEY}` },
    body: JSON.stringify({ name: 'emails.send', arguments: { to, from: FROM(), subject, text, ...(html ? { html } : {}) } }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await res.text().catch(() => '');
  if (!res.ok) throw Object.assign(new Error(`Plinth emails.send ${res.status}: ${raw.slice(0, 300)}`), { status: res.status });
  // A tool call can answer 200 and still carry a failure in its body: read it, don't assume.
  let b = null; try { b = JSON.parse(raw); } catch { /* not JSON */ }
  const inner = b?.result ?? b?.data ?? b;
  const failed = b?.isError || b?.error || b?.ok === false || b?.success === false || inner?.isError || inner?.error || inner?.ok === false || inner?.success === false
    || /^(failed|error|rejected|blocked|suppressed)$/i.test(String(inner?.status || ''));
  const say = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? '')).slice(0, 300);
  if (failed) throw Object.assign(new Error(`Plinth did not send it: ${say(b?.error || inner?.error || inner?.message || b?.message || inner)}`), { status: 422 });
  return { ok: true, id: inner?.id || inner?.messageId || inner?.message_id || null, status: inner?.status || null, reply: raw.slice(0, 400) };
}
