# One-time setup

## 1. Domain

Register **glassbox.how** (it looked unregistered on 2026-09-26). At the registrar's DNS:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153 |
| CNAME | www | glassboxhow.github.io |

## 2. GitHub org

1. Create the free org **glassboxhow** at github.com/organizations/plan. The API can't create orgs.
2. Org settings → Pages → **Verify** `glassbox.how` (a TXT record). This stops anyone else claiming it.
3. From this repo: `scripts/github-setup.sh hub`. It creates `glassboxhow/glassboxhow.github.io` and sets its description, homepage, topics and issue labels. It also turns issues on and wiki/projects off, sets Pages to deploy from Actions on the custom domain, and runs the first build.
4. For each box: `scripts/github-setup.sh <slug>` (e.g. `cameraclear`). It regenerates the box README (cover image, video links, explainer, concepts, privacy, licences), `LICENSE-CONTENT.md` and `package.json` metadata from `glassbox.json`. Then it creates the public repo with description, homepage, topics and labels, and turns on Pages.
5. One manual step per repo, because GitHub has no API for it: **Settings → General → Social preview →** upload `site/assets/og.png` (hub) or `glassbox/cover.jpg` (box).
6. Once DNS resolves, tick **Enforce HTTPS** in the hub repo's Pages settings.

If you pick a different org or domain, change `org`, `hubRepo` and `domain` in `glassbox.config.json`.

## 3. Social accounts

- Instagram **@glassbox.how** as a Business or Creator account (Buffer needs this to publish Reels directly).
- YouTube channel **@glassboxhow**.
- Optional: LinkedIn page, X, Threads, TikTok.
- The studio's **Brand kit** tab renders the profile picture (1080×1080) and YouTube banner (2560×1440).

## 4. Buffer

1. Connect each account as a channel in Buffer.
2. Buffer → Settings → API → create a key.
3. Locally: `cp .env.example .env` and paste it as `BUFFER_API_KEY`.
4. On GitHub: hub repo → Settings → Secrets → Actions → `BUFFER_API_KEY` (for the **Post a box** workflow).
5. `npm run post -- --channels` should list your channels.

## 5. Optional: instant hub rebuilds

The hub rebuilds every 2 hours. For instant updates, create a fine-grained token with *Contents: read & write* on the hub repo. Add it to each box repo as the `HUB_DISPATCH_TOKEN` secret, and the box's `notify-hub` workflow will ping the hub on every push.
