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
  if (!res.ok) throw Object.assign(new Error(`Plinth emails.send ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`), { status: res.status });
  return { ok: true };
}
