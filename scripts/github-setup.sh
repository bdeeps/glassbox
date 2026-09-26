#!/usr/bin/env bash
# Creates (or refreshes) the public GitHub repos, fully filled in: description,
# homepage, topics, README, licences, issue labels, and the secret/variable the
# box needs to ping the server. Safe to re-run.
#   scripts/github-setup.sh hub      # this repo  → <owner>/<hubRepo>
#   scripts/github-setup.sh <slug>   # ../<slug>  → <owner>/<slug>
# <owner> is "org" in glassbox.config.json: a GitHub user or organisation.
# Hosting is Railway (see docs/SETUP.md); these repos are the source.
set -euo pipefail
cd "$(dirname "$0")/.."
cfg() { node -p "require('./glassbox.config.json').$1"; }
OWNER=$(cfg org); HUB=$(cfg hubRepo); BRAND=$(cfg brand)
SITE=$(node --input-type=module -e "import { SITE } from './scripts/lib/apps.mjs'; console.log(SITE)")
target=${1:?usage: scripts/github-setup.sh hub|<slug>}

gh api "users/$OWNER" >/dev/null 2>&1 || { echo "GitHub user or org '$OWNER' not found."; exit 1; }
env_get() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

labels() {
  gh label create box-idea --repo "$1" --color 8ef0ff --description "A suggestion for a future box" --force >/dev/null
  gh label create correction --repo "$1" --color ffb547 --description "Something in an explainer is wrong or misleading" --force >/dev/null
}
settings() {
  gh repo edit "$1" --enable-issues --enable-wiki=false --enable-projects=false --enable-discussions=false \
    --description "$2" --homepage "$3" >/dev/null
}
push() {  # $1 = dir, $2 = repo, $3 = description
  ( cd "$1"
    [ -d .git ] || git init -q -b main
    git add -A && (git diff --cached --quiet || git commit -qm "Update from Glassbox")
    gh repo view "$OWNER/$2" >/dev/null 2>&1 || gh repo create "$OWNER/$2" --public --description "$3"
    git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$2.git"
    git push -u origin main
  )
}

if [ "$target" = "hub" ]; then
  HUB_DESC="$BRAND: see inside how things work. One open-source interactive explainer a day, with its history. Hub site, server, studio and publish kit."
  npm run -s check
  push . "$HUB" "$HUB_DESC"
  settings "$OWNER/$HUB" "$HUB_DESC" "$SITE"
  gh repo edit "$OWNER/$HUB" --add-topic glassbox --add-topic explainer --add-topic education --add-topic interactive \
    --add-topic open-source --add-topic html5 --add-topic history --add-topic privacy --add-topic static-site --add-topic railway >/dev/null
  labels "$OWNER/$HUB"
  key=$(env_get BUFFER_API_KEY); [ -n "$key" ] && printf %s "$key" | gh secret set BUFFER_API_KEY -R "$OWNER/$HUB" >/dev/null && echo "  BUFFER_API_KEY secret set (for the Post a box workflow)"
  echo "Hub: https://github.com/$OWNER/$HUB  →  $SITE"
  echo "Manual step: Settings → General → Social preview → upload site/assets/og.png"
  exit 0
fi

slug=$target
dir="../$slug"
[ -f "$dir/glassbox.json" ] || { echo "no $dir/glassbox.json"; exit 1; }
node scripts/readme.mjs "$slug"
meta=$(node scripts/readme.mjs "$slug" --meta)
desc=$(node -e "console.log(JSON.parse(process.argv[1]).description)" "$meta")
topics=$(node -e "console.log(JSON.parse(process.argv[1]).topics.map(t=>'--add-topic '+t).join(' '))" "$meta")
push "$dir" "$slug" "$desc"
settings "$OWNER/$slug" "$desc" "$SITE/$slug/"
# shellcheck disable=SC2086
gh repo edit "$OWNER/$slug" $topics >/dev/null
labels "$OWNER/$slug"
tok=$(env_get SYNC_TOKEN)
if [ -n "$tok" ]; then
  printf %s "$tok" | gh secret set GLASSBOX_SYNC_TOKEN -R "$OWNER/$slug" >/dev/null
  gh variable set GLASSBOX_SITE -R "$OWNER/$slug" --body "$SITE" >/dev/null
  curl -fsS -X POST "$SITE/__sync" -H "Authorization: Bearer $tok" >/dev/null 2>&1 && echo "  asked $SITE to fetch it now" || true
fi
echo "Box: https://github.com/$OWNER/$slug  →  $SITE/$slug/"
[ -f "$dir/glassbox/cover.jpg" ] && echo "Manual step: Settings → General → Social preview → upload $slug/glassbox/cover.jpg"
