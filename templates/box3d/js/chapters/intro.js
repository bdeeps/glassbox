// A starter chapter. Copy it for each idea the box explains.
import { M, rod, sphere, clamp } from '../kit.js';

export default {
  id: 'intro',
  short: 'Start here',
  title: {{QUESTION_JSON}},
  subtitle: 'Replace this chapter with the first idea.',
  view: { pos: [4, 3, 6], target: [0, 1, 0] },
  learn: `<p>Explain the idea in two or three short paragraphs. Use <b>bold</b> for the words that matter.</p>
    <p class="tip"><b>Try it:</b> say which control to move and what to look for.</p>`,
  terms: [{ t: 'Key term', d: 'A one-sentence definition.' }],
  defaults: { speed: 1 },
  controls: [{ key: 'speed', type: 'range', label: 'Speed', min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(1) + '×' }],
  quiz: [{ q: 'A question about the idea?', options: ['Right answer', 'Wrong answer'], answer: 0, why: 'Why it is right.' }],
  reel: [{ ms: 4000, caption: 'One short sentence per scene.', anim: { speed: [0.2, 2] } }],
  build({ stage }) {
    const shaft = rod(-1.5, 1.5, 0.15, 0.15, M.metal());
    const ball = sphere(0.5, M.plastic(0xff7a59));
    shaft.position.y = ball.position.y = 1;
    stage.root.add(shaft, ball);
    stage.label('A label', [0, 1.8, 0]);
    return {
      update(dt, s) { shaft.rotation.x += dt * s.speed * 3; ball.position.x = Math.sin(performance.now() / 1000 * s.speed) * 1.2; },
      readout: (s) => `<div class="row"><span>Speed</span><b>${clamp(s.speed, 0, 3).toFixed(1)}×</b></div>`,
    };
  },
};
