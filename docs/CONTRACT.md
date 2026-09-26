# The box contract

A box is any static HTML5 app in its own repo. To join the shelf and get videos made for it, it needs three things.

## 1. `glassbox.json`

```json
{
  "slug": "cameraclear",            // repo name = URL path, lowercase-dashes
  "box": 1,                         // sequential box number
  "date": "2026-09-26",             // the day it opens
  "title": "CameraClear",
  "question": "How does a camera actually see?",   // the headline everywhere
  "hook": "One or two sentences that make someone press play.",
  "thumbText": "HOW A CAMERA SEES", // YouTube thumbnail text, 2–4 words
  "thumbScene": 3,                  // optional: which scene the thumbnail uses
  "field": "optics",                // one of glassbox.config.json "fields"
  "minutes": 15,
  "tags": ["camera", "optics"],     // also become hashtags
  "explainer": [{ "title": "…", "text": "…" }],   // the "In 60 seconds" beats (3–7)
  "concepts": [{ "term": "…", "def": "…" }],      // "Words worth knowing"
  "links": { "youtube": "https://youtube.com/shorts/…" }  // optional, embeds on the page
}
```

## 2. Relative paths and the bar

The box is served at `/<slug>/`, so reference its own files relatively (`css/app.css`, not `/css/app.css`). Load the Glassbox bar last:

```html
<script src="/bar.js" defer></script>
```

It adds a small pill linking to the explainer, the source and the shelf. When the box runs on its own (a local server or a fork), it 404s quietly.

## 3. `window.glassbox.director`

The studio loads the box in a same-origin iframe (`/<slug>/?reel=1`) and drives it one frame at a time. Rendering must be a function of state and time, not of wall-clock time.

```js
window.glassbox = {
  director: {
    // The storyboard. Captions become video subtitles, carousel slides and post copy.
    scenes: [{ caption: 'Every camera is just a dark box with a hole in it.', ms: 4600 }, …],

    // Hide all UI, size the drawing surface to exactly width×height CSS px at DPR 1.
    setup({ width, height }) {},

    // Render scene i at progress t (0→1). dtMs is the frame step (1000/30).
    // Must render synchronously and return the canvas that holds the frame.
    frame(i, t, dtMs) {
      return { main: canvas, inset: optionalSecondCanvas, insetLabel: 'CAMERA SCREEN' };
    },
  },
};
```

Notes:

- The studio calls `setup` at 1920×1080 for the YouTube video and 1000×1000 for the Reel window.
- Return the canvas **straight after rendering**. WebGL canvases don't need `preserveDrawingBuffer`, because the studio copies the pixels in the same task.
- While the director is active, stop your own `requestAnimationFrame` updates (CameraClear checks a `reel` flag), so only `frame()` advances time.
- Aim for 6–9 scenes of 4–6 seconds. With the 3.5 s end card, that's a 30–55 s Short.
- `templates/box/app.js` is a minimal working example. `cameraclear/js/app.js` + `js/reel.js` is a full Three.js one.
