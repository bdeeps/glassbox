// {{TITLE}}. Replace this demo with the real model.
// The one rule: rendering is a pure function of (state, time), so the Glassbox
// studio can drive it frame by frame through window.glassbox.director.
const canvas = document.getElementById('stage');
const g = canvas.getContext('2d');
const state = { speed: 1, time: 0 };
const speed = document.getElementById('speed');
speed.addEventListener('input', () => { state.speed = +speed.value; });

function resize(w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2)) {
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
}
new ResizeObserver(() => { if (!reel) resize(); }).observe(canvas);

function render() {
  const W = canvas.width, H = canvas.height, r = Math.min(W, H) * 0.3;
  g.fillStyle = '#07080c'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(state.time);
  g.strokeStyle = '{{COLOR}}'; g.lineWidth = Math.max(2, r * 0.04);
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(r, 0); g.stroke(); }
  g.restore();
  document.getElementById('readout').textContent = `speed ×${state.speed.toFixed(1)}`;
}

let last = performance.now(), reel = null;
function loop(now) {
  requestAnimationFrame(loop);
  if (reel) return;
  state.time += ((now - last) / 1000) * state.speed; last = now;
  render();
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- Glassbox director
// Storyboard: each scene animates state from → to. Captions become the video
// subtitles, carousel slides and post copy. Keep them short and concrete.
const STORYBOARD = [
  { ms: 5000, from: { speed: 0.3 }, to: { speed: 0.3 }, caption: 'Start with the simplest version of the idea.' },
  { ms: 5000, from: { speed: 0.3 }, to: { speed: 3 }, caption: 'Now turn one dial and watch what changes.' },
  { ms: 5000, from: { speed: 3 }, to: { speed: 1 }, caption: 'That one relationship explains the whole thing.' },
];
const smooth = (k) => k * k * (3 - 2 * k);
window.glassbox = {
  director: {
    scenes: STORYBOARD.map(({ caption, ms }) => ({ caption, ms })),
    setup({ width, height }) {
      reel = true;
      document.body.classList.add('gb-reel');
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      resize(width, height, 1);
    },
    frame(i, t, dtMs) {
      const sc = STORYBOARD[i], k = smooth(t);
      for (const key in sc.to) state[key] = sc.from[key] + (sc.to[key] - sc.from[key]) * k;
      state.time += (dtMs / 1000) * state.speed;
      render();
      return { main: canvas };
    },
  },
};
