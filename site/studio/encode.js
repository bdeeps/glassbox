// In-browser MP4 encoding (WebCodecs + mp4-muxer), a generated soundtrack, and
// a tiny zip writer. No server-side video tools needed.
const MUXER = './vendor/mp4-muxer.mjs';  // vendored (MIT) so the studio makes no third-party requests
const SR = 48000;

export const canEncode = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

async function pickCodec(W, H, fps, bitrate) {
  for (const codec of ['avc1.640033', 'avc1.640028', 'avc1.4d0033', 'avc1.42003e']) {
    const ok = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: fps }).catch(() => null);
    if (ok?.supported) return codec;
  }
  throw new Error('This browser cannot encode H.264 video. Use a recent Chrome or Edge.');
}

async function aacSupported() {
  if (typeof AudioEncoder === 'undefined') return false;
  const r = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 128000 }).catch(() => null);
  return !!r?.supported;
}

const yieldNow = () => new Promise((r) => setTimeout(r, 0));

export async function createEncoder({ W, H, fps = 30, bitrate = 6_000_000, audio = null }) {
  const { Muxer, ArrayBufferTarget } = await import(MUXER);
  const codec = await pickCodec(W, H, fps, bitrate);
  const withAudio = !!audio && (await aacSupported());
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    ...(withAudio ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SR } } : {}),
    fastStart: 'in-memory',
  });
  let failure = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  enc.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });
  let n = 0;
  return {
    withAudio,
    async add(canvas) {
      if (failure) throw failure;
      const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(frame, { keyFrame: n % (fps * 2) === 0 });
      frame.close();
      n++;
      while (enc.encodeQueueSize > 6) await yieldNow();
    },
    async finish() {
      await enc.flush();
      if (failure) throw failure;
      if (withAudio) await encodeAudio(muxer, audio);
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    },
  };
}

async function encodeAudio(muxer, buf) {
  let failure = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
  enc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 128000 });
  const L = buf.getChannelData(0), R = buf.getChannelData(1), step = 4800;
  for (let i = 0; i < buf.length; i += step) {
    const n = Math.min(step, buf.length - i), data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data });
    enc.encode(ad); ad.close();
  }
  await enc.flush();
  if (failure) throw failure;
}

// A quiet ambient pad that changes chord each scene, with a soft tick on every
// cut. Original, generated here, so there are no music rights to worry about.
export async function soundtrack(sceneMs, outroMs) {
  const total = (sceneMs.reduce((a, b) => a + b, 0) + outroMs) / 1000;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const master = ctx.createGain(); master.gain.value = 0.22;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  lp.connect(master); master.connect(ctx.destination);
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 207.65, 246.94]];
  let t = 0;
  const cuts = [...sceneMs, outroMs];
  cuts.forEach((ms, i) => {
    const d = ms / 1000, chord = CHORDS[i % CHORDS.length];
    chord.forEach((f, k) => [f, f * 2.003].forEach((ff, j) => {
      const o = ctx.createOscillator(); o.type = j ? 'sine' : 'triangle'; o.frequency.value = ff;
      const p = ctx.createStereoPanner(); p.pan.value = (k - 1) * 0.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(j ? 0.05 : 0.11, t + Math.min(0.8, d / 3));
      g.gain.setValueAtTime(j ? 0.05 : 0.11, t + d - 0.35);
      g.gain.linearRampToValueAtTime(0, t + d + 0.25);
      o.connect(g).connect(p).connect(lp); o.start(t); o.stop(t + d + 0.3);
    }));
    const tick = ctx.createOscillator(); tick.type = 'sine'; tick.frequency.setValueAtTime(1320, t); tick.frequency.exponentialRampToValueAtTime(660, t + 0.08);
    const tg = ctx.createGain(); tg.gain.setValueAtTime(0.25, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    tick.connect(tg).connect(master); tick.start(t); tick.stop(t + 0.14);
    t += d;
  });
  master.gain.setValueAtTime(0.22, Math.max(0, total - 1.2));
  master.gain.linearRampToValueAtTime(0, total);
  return ctx.startRendering();
}

export const toBlob = (c, type = 'image/jpeg', q = 0.9) => new Promise((r) => c.toBlob(r, type, q));

// Store-only zip, enough for "download everything" on the hosted studio.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export async function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const { name, blob } of files) {
    const data = new Uint8Array(await blob.arrayBuffer()), nm = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(h, nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(c, nm);
    off += 30 + nm.length + data.length;
  }
  const size = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
