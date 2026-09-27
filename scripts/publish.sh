#!/usr/bin/env bash
# Publishes a recorded box: commits it, creates or fills its GitHub repo, confirms the push
# really landed, re-dates the calendar (object boxes), pushes the hub, then slims the local copy.
#   scripts/publish.sh <slug> "<commit message>"
set -euo pipefail
cd "$(dirname "$0")/.."
slug=${1:?slug}; msg=${2:?message}
dir=../$slug
[ -f "$dir/glassbox/post.json" ] || { echo "✗ $slug is not recorded yet"; exit 1; }
printf '.DS_Store\n' > "$dir/.gitignore"
node scripts/readme.mjs "$slug" >/dev/null
node scripts/check.mjs 2>&1 | grep -A3 " $slug " | head -4 || true
git -C "$dir" config http.postBuffer 524288000
git -C "$dir" add -A
git -C "$dir" diff --cached --quiet || git -C "$dir" commit -qm "$msg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
scripts/github-setup.sh "$slug" 2>&1 | tail -2 || true
head=$(git -C "$dir" rev-parse HEAD)
for i in 1 2 3 4; do
  [ "$(git -C "$dir" ls-remote origin main | cut -f1)" = "$head" ] && break
  echo "  push didn't land, retrying ($i)…"
  git -C "$dir" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=120 push -u origin main 2>&1 | tail -1 || true
  sleep 3
done
[ "$(git -C "$dir" ls-remote origin main | cut -f1)" = "$head" ] || { echo "✗ $slug: GitHub does not have $head"; exit 1; }
echo "✓ $slug is on GitHub ($head)"
kind=$(node -p "require('$dir/glassbox.json').kind || 'box'")
if [ "$kind" != "principle" ]; then node scripts/redate.mjs | tail -1; fi
git add dates.json apps.local.json 2>/dev/null || true
git diff --cached --quiet || { git commit -qm "Publish $slug

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q && echo "✓ hub pushed"; }
node scripts/slim.mjs "$slug"
df -h /System/Volumes/Data | tail -1
