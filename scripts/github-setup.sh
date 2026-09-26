#!/usr/bin/env bash
# Creates the public GitHub repos and turns on Pages. Run after you've created
# the GitHub org named in glassbox.config.json.
#   scripts/github-setup.sh hub          # this repo → <org>/<org>.github.io, Pages via Actions, custom domain
#   scripts/github-setup.sh <slug>       # ../<slug> → <org>/<slug>, Pages from main, box topic
set -euo pipefail
cd "$(dirname "$0")/.."
cfg() { node -p "require('./glassbox.config.json').$1"; }
ORG=$(cfg org); HUB=$(cfg hubRepo); DOMAIN=$(cfg domain); TOPIC=$(cfg topic)
target=${1:?usage: scripts/github-setup.sh hub|<slug>}

if [ "$target" = "hub" ]; then
  git add -A && (git diff --cached --quiet || git commit -qm "Glassbox hub")
  gh repo view "$ORG/$HUB" >/dev/null 2>&1 || gh repo create "$ORG/$HUB" --public --source . --remote origin --description "Glassbox: see inside how things work. One open-source interactive explainer a day."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$ORG/$HUB.git"
  git push -u origin main
  gh api -X POST "repos/$ORG/$HUB/pages" -f build_type=workflow >/dev/null 2>&1 || true
  gh api -X PUT "repos/$ORG/$HUB/pages" -f cname="$DOMAIN" -F https_enforced=true >/dev/null 2>&1 || gh api -X PUT "repos/$ORG/$HUB/pages" -f cname="$DOMAIN" >/dev/null
  gh workflow run pages.yml -R "$ORG/$HUB"
  echo "Hub: https://github.com/$ORG/$HUB  →  https://$DOMAIN (after DNS, see docs/SETUP.md)"
  exit 0
fi

slug=$target
dir="../$slug"
[ -f "$dir/glassbox.json" ] || { echo "no $dir/glassbox.json"; exit 1; }
question=$(node -p "require('$dir/glassbox.json').question")
( cd "$dir"
  [ -d .git ] || git init -q -b main
  git add -A && (git diff --cached --quiet || git commit -qm "Box: $question")
  gh repo view "$ORG/$slug" >/dev/null 2>&1 || gh repo create "$ORG/$slug" --public --source . --remote origin --description "$question An interactive, open-source explainer."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$ORG/$slug.git"
  git push -u origin main
)
gh repo edit "$ORG/$slug" --add-topic "$TOPIC" --homepage "https://$DOMAIN/$slug/"
gh api -X POST "repos/$ORG/$slug/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
gh workflow run pages.yml -R "$ORG/$HUB" || true
echo "Box: https://github.com/$ORG/$slug  →  https://$DOMAIN/$slug/"
