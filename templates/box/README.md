# {{TITLE}}

**{{QUESTION}}**

An interactive, open-source explainer. Box No. {{NO}} of [Glassbox](https://{{DOMAIN}}), one "how it works" a day.

▶ **Play with it:** https://{{DOMAIN}}/{{SLUG}}/
📖 **The 60-second explainer:** https://{{DOMAIN}}/e/{{SLUG}}/

## Run it

It's plain HTML, CSS and JavaScript. No build step, no dependencies.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## How it's built

- `index.html`, `style.css`, `app.js`: the whole app
- `glassbox.json`: the title, question, explainer beats and key terms the Glassbox site shows
- `window.glassbox.director` in `app.js`: the storyboard the Glassbox studio records into short videos
- `glassbox/`: the published video, slides and post copy (made by the studio)

## License

MIT. Fork it, remix it, teach with it.
