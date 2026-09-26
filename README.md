# Glassbox

**See inside how things work.** One open-source, interactive HTML5 explainer every day, plus the short videos that bring people back to play with it.

This repo is the **hub**: the site at `glassbox.how`, the **studio** that turns a box into Reels, Shorts, a YouTube video, a carousel and captions, and the **publish kit** that schedules it all through Buffer.

## How the pieces fit

```
github.com/glassboxhow                       glassbox.how
├─ glassboxhow.github.io   (this repo)  ──►  /                 home + the shelf
│    Actions builds it from every box   ──►  /e/<slug>/        explainer page per box
│                                       ──►  /studio/          recording + publish kit
│                                       ──►  /bar.js /apps.json
├─ cameraclear             (box No. 001) ──►  /cameraclear/     the app itself
│    glassbox.json  (manifest)                /cameraclear/glassbox/reel.mp4 …
│    glassbox/      (studio output)
└─ <tomorrow's box>        (box No. 002) ──►  /<slug>/
```

- **Every box is its own public repo** with GitHub Pages turned on. GitHub serves an org's project sites under the org site's custom domain, so `glassboxhow/cameraclear` automatically appears at `glassbox.how/cameraclear/`. Nothing to proxy, nothing to pay for.
- **The hub finds boxes by topic.** Any public repo in the org tagged `glassbox-box` with a `glassbox.json` is picked up by the hub's build (every 2 hours, on push, or instantly via the box's optional `notify-hub` workflow).
- **Each box hosts its own media.** The studio writes `reel.mp4`, `video.mp4`, slides, thumbnail, cover and `post.json` into the box repo's `glassbox/` folder. That keeps each repo well under GitHub's 1 GB limit, and gives Buffer the public media URLs it requires.
- **No database, no accounts, no tracking.** Static HTML, CSS and JS. The hub build is zero-dependency Node.

## Daily loop

```bash
npm run new -- <slug> "How does X work?" --field physics   # scaffolds ../<slug> as box No. N+1
npm run dev                                                # http://localhost:5210
```

1. Build the model in `../<slug>/app.js`, fill in `glassbox.json`, and write the storyboard (`window.glassbox.director`). See [docs/CONTRACT.md](docs/CONTRACT.md).
2. Open **http://localhost:5210/studio/?box=<slug>** → **Record**. You get a 16:9 video, a 9:16 Reel/Short, 10 carousel slides, a thumbnail and a share cover. It encodes in the browser (WebCodecs), faster than real time.
3. **Words**: edit the drafted captions for Instagram, YouTube, X, LinkedIn.
4. **Ship**: pick the time → **Save to repo** → **Dry run** → **Ship it**. Ship commits and pushes `glassbox/`, waits for Pages to serve the files, then creates the Buffer posts.
5. First time only for a box: `scripts/github-setup.sh <slug>` creates the public repo, turns on Pages and tags it.

`npm run check` flags anything missing. `npm run post -- <slug> --dry` does the Buffer step from the terminal, and the **Post a box** GitHub Action does it from your phone.

## What gets posted

| Target | Asset | Copy |
|---|---|---|
| Instagram Reel | `reel.mp4` (1080×1920) | Instagram caption |
| Instagram carousel (+4 h) | `slide-1…10.jpg` (1080×1350) | carousel caption |
| YouTube Short | `reel.mp4` | Short title + description |
| YouTube video | `video.mp4` (1920×1080) | long title + description |
| LinkedIn, X | `video.mp4` | LinkedIn / X copy |
| Threads, TikTok | `reel.mp4` | LinkedIn copy |

A target is skipped when no matching channel is connected in Buffer. Edit the list in `glassbox.config.json`.

## Commands

| | |
|---|---|
| `npm run dev` | hub + every local box + studio at :5210 |
| `npm run new -- <slug> "<question>" --field <f>` | scaffold the next box |
| `npm run check` | validate local boxes |
| `npm run build` | static build to `dist/` from local boxes |
| `npm run post -- <slug> [--dry\|--queue\|--now]` | schedule a box in Buffer |
| `npm run post -- --channels` | list connected Buffer channels |
| `scripts/github-setup.sh hub\|<slug>` | create repos + Pages |

One-time setup: [docs/SETUP.md](docs/SETUP.md).

MIT licensed.
