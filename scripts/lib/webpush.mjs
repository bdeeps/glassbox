// Browser push notifications without a library: VAPID (RFC 8292) and the aes128gcm message
// encryption (RFC 8291 / RFC 8188), using node:crypto. The VAPID key pair is made once and kept
// in the shared store.
import crypto from 'node:crypto';
import * as store from './store.mjs';

const b64u = (b) => Buffer.from(b).toString('base64url');
const from64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let vapid = null;
async function keys() {
  if (vapid) return vapid;
  let saved = await store.get('push:vapid');
  if (!saved) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    saved = { privateJwk: privateKey.export({ format: 'jwk' }), publicKey: b64u(Buffer.concat([Buffer.from([4]), from64(jwk.x), from64(jwk.y)])) };
    if (!(await store.claim('push:vapid', saved, 1e15))) saved = await store.get('push:vapid');   // another replica won
  }
  return (vapid = { publicKey: saved.publicKey, privateKey: crypto.createPrivateKey({ key: saved.privateJwk, format: 'jwk' }) });
}
export const publicKey = async () => (await keys()).publicKey;

function jwt(audience, privateKey) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:glassbox@cleartrust.cc' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

export function encrypt(payload, p256dh, auth) {
  const ua = from64(p256dh), secret = from64(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const as = ecdh.generateKeys();
  const shared = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, secret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.length]), as, body]);
}

// Sends one notification. Returns { ok } or { gone: true } when the browser has dropped the
// subscription (404/410), so the caller can forget it.
export async function send(sub, data) {
  const k = await keys();
  const url = new URL(sub.endpoint);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: `vapid t=${jwt(url.origin, k.privateKey)}, k=${k.publicKey}` },
    body: encrypt(JSON.stringify(data), sub.keys.p256dh, sub.keys.auth),
  });
  if (res.status === 404 || res.status === 410) return { gone: true };
  return { ok: res.ok, status: res.status };
}
