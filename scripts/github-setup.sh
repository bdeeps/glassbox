#!/usr/bin/env bash
# Creates (or refreshes) the public GitHub repos, fully filled in: description,
# homepage, topics, README, licences, issue labels and GitHub Pages. Run it after
# creating the GitHub org named in glassbox.config.json. Safe to re-run.
#   scripts/github-setup.sh hub      # this repo → <org>/<org>.github.io (Pages via Actions, custom domain)
#   scripts/github-setup.sh <slug>   # ../<slug> → <org>/<slug> (Pages from main)
set -euo pipefail
cd "$(dirname "$0")/.."
cfg() { node -p "require('./glassbox.config.json').$1"; }
ORG=$(cfg org); HUB=$(cfg hubRepo); DOMAIN=$(cfg domain); BRAND=$(cfg brand)
target=${1:?usage: scripts/github-setup.sh hub|<slug>}

gh api "orgs/$ORG" >/dev/null 2>&1 || { echo "GitHub org '$ORG' doesn't exist yet. Create it at https://github.com/organizations/plan first."; exit 1; }

# Labels used by the issue templates and the "Suggest a box" links.
labels() {
  gh label create box-idea --repo "$1" --color 8ef0ff --description "A suggestion for a future box" --force >/dev/null
  gh label create correction --repo "$1" --color ffb547 --description "Something in an explainer is wrong or misleading" --force >/dev/null
}
# Repo settings that aren't files: issues on, wiki and projects off (nothing hides there).
settings() {
  gh repo edit "$1" --enable-issues --enable-wiki=false --enable-projects=false --enable-discussions=false \
    --description "$2" --homepage "$3" >/dev/null
}

if [ "$target" = "hub" ]; then
  HUB_DESC="$BRAND: see inside how things work. One open-source interactive explainer a day, with no tracking. Hub site, studio and publish kit."
  npm run -s check
  git add -A && (git diff --cached --quiet || git commit -qm "Glassbox hub")
  gh repo view "$ORG/$HUB" >/dev/null 2>&1 || gh repo create "$ORG/$HUB" --public --source . --remote origin \
    --description "$HUB_DESC"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$ORG/$HUB.git"
  git push -u origin main
  settings "$ORG/$HUB" "$HUB_DESC" "https://$DOMAIN"
  gh repo edit "$ORG/$HUB" --add-topic glassbox --add-topic explainer --add-topic education --add-topic interactive \
    --add-topic open-source --add-topic html5 --add-topic no-tracking --add-topic privacy --add-topic github-pages --add-topic static-site >/dev/null
  labels "$ORG/$HUB"
  gh api -X POST "repos/$ORG/$HUB/pages" -f build_type=workflow >/dev/null 2>&1 || true
  gh api -X PUT "repos/$ORG/$HUB/pages" -f cname="$DOMAIN" >/dev/null 2>&1 || true
  gh api -X PUT "repos/$ORG/$HUB/pages" -F https_enforced=true >/dev/null 2>&1 || echo "  (turn on Enforce HTTPS in Pages settings once DNS resolves)"
  gh workflow run pages.yml -R "$ORG/$HUB" || true
  echo "Hub: https://github.com/$ORG/$HUB  →  https://$DOMAIN"
  echo "Manual step: Settings → General → Social preview → upload site/assets/og.png"
  exit 0
fi

slug=$target
dir="../$slug"
[ -f "$dir/glassbox.json" ] || { echo "no $dir/glassbox.json"; exit 1; }
node scripts/readme.mjs "$slug"
meta=$(node scripts/readme.mjs "$slug" --meta)
desc=$(node -e "console.log(JSON.parse(process.argv[1]).description)" "$meta")
home=$(node -e "console.log(JSON.parse(process.argv[1]).homepage)" "$meta")
topics=$(node -e "console.log(JSON.parse(process.argv[1]).topics.map(t=>'--add-topic '+t).join(' '))" "$meta")
( cd "$dir"
  [ -d .git ] || git init -q -b main
  git add -A && (git diff --cached --quiet || git commit -qm "Glassbox box: $slug")
  gh repo view "$ORG/$slug" >/dev/null 2>&1 || gh repo create "$ORG/$slug" --public --source . --remote origin --description "$desc"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$ORG/$slug.git"
  git push -u origin main
)
settings "$ORG/$slug" "$desc" "$home"
# shellcheck disable=SC2086
gh repo edit "$ORG/$slug" $topics >/dev/null
labels "$ORG/$slug"
gh api -X POST "repos/$ORG/$slug/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
gh workflow run pages.yml -R "$ORG/$HUB" >/dev/null 2>&1 || true
echo "Box: https://github.com/$ORG/$slug  →  $home"
[ -f "$dir/glassbox/cover.jpg" ] && echo "Manual step: Settings → General → Social preview → upload $slug/glassbox/cover.jpg"
