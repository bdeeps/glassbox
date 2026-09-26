<!-- glassbox:start -->
<!-- Filled in from glassbox.json by the Glassbox hub: npm run readme -- {{SLUG}} -->
# {{TITLE}}

**{{QUESTION}}**
<!-- glassbox:end -->

## Run it

It's plain HTML, CSS and JavaScript. No build step, no dependencies, and it never contacts another website.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## How it's built

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | The whole app |
| `glassbox.json` | Title, question, explainer beats, key terms, browser storage and credits shown on {{DOMAIN}} |
| `window.glassbox.director` in `app.js` | The storyboard the Glassbox studio records into short videos |
| `glassbox/` | The published video, slides, thumbnail and post copy |
| `fonts/` | Self-hosted Geist and Instrument Serif (SIL OFL 1.1, see `fonts/OFL.txt`) |
