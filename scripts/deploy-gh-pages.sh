#!/usr/bin/env bash
#
# Build the ADPL Deck Studio static site and publish it to the `gh-pages`
# branch. Re-run this any time the app changes.
#
#   npm run deploy                      # test + build + publish
#   DEPLOY_BRANCH=site npm run deploy   # publish to a different branch
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH="${DEPLOY_BRANCH:-gh-pages}"
REMOTE="${DEPLOY_REMOTE:-origin}"
TRACKING="refs/remotes/$REMOTE/$BRANCH"

WORK="$(mktemp -d)"
SNAP="$(mktemp -d)"
cleanup() {
  git worktree remove "$WORK" --force >/dev/null 2>&1 || true
  rm -rf "$WORK" "$SNAP"
}
trap cleanup EXIT

# ---------------------------------------------------------------- build ----
echo "▶ typecheck + tests"
npm test

echo "▶ production build"
npm run build
touch dist/.nojekyll   # stop GitHub Pages from running Jekyll over the bundle

# --------------------------------------------------- anything new to ship? ----
echo "▶ comparing with the published site"
git fetch "$REMOTE" "+refs/heads/$BRANCH:$TRACKING" --quiet 2>/dev/null || true
if git rev-parse -q --verify "$TRACKING" >/dev/null; then
  git archive "$TRACKING" | tar -x -C "$SNAP"
  if diff -rq "$SNAP" dist >/dev/null 2>&1; then
    echo "✔ nothing changed — the published site is already current"
    exit 0
  fi
fi

# --------------------------------------------------------------- publish ----
echo "▶ publishing dist/ to '$BRANCH'"
git worktree add -q --detach "$WORK" HEAD
cd "$WORK"
git branch -D "$BRANCH" >/dev/null 2>&1 || true   # drop any stale local copy
git checkout -q --orphan "$BRANCH"                # fresh single-commit snapshot
git rm -rq --cached . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} +
cp -r "$REPO_ROOT/dist/." .
git add -A

STAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
git -c user.name="${GIT_AUTHOR_NAME:-adpl-deck-studio}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-deploy@localhost}" \
    commit -q -m "Publish built site ($STAMP)"

# Every deploy is a fresh orphan snapshot, so there is no shared history with
# the previous one and the update is always a force push. This branch is
# machine-owned (build output only, never edited by hand), and the snapshot
# comparison above already skipped the push when nothing changed.
git push --force "$REMOTE" "$BRANCH"

echo "✔ published to $BRANCH at $STAMP"
echo "  Live once Pages is on: Settings → Pages → Deploy from a branch → $BRANCH → / (root)"
