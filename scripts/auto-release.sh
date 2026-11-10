#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
STEP="checking automatic release prerequisites"
release_failed() {
  local status="$1"
  printf 'error: Automatic release failed while %s (exit %s). Inspect the remote branch and tag before retrying.\n' "$STEP" "$status" >&2
  exit "$status"
}
trap 'release_failed "$?"' ERR

[[ "${GITHUB_ACTIONS:-}" == true && -n "${GITHUB_OUTPUT:-}" ]] ||
  fail "Automatic releases must run in GitHub Actions with GITHUB_OUTPUT."
[[ "${RELEASE_SOURCE:-}" =~ ^[0-9a-f]{40}$ && "${RELEASE_BEFORE:-}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "RELEASE_SOURCE and RELEASE_BEFORE must identify the main push."
[[ -z "$(git status --porcelain)" ]] || fail "The release checkout is dirty."

STEP="fetching merged release sources"
git fetch --quiet --tags origin main
git merge-base --is-ancestor "$RELEASE_SOURCE" origin/main ||
  fail "The source commit is not merged into origin/main."
git switch --quiet --detach "$RELEASE_SOURCE"
CURRENT_VERSION="$(node -p "require('./package.json').version")"
PREVIOUS_VERSION="$(git show "$RELEASE_BEFORE:package.json" | node -p "JSON.parse(require('node:fs').readFileSync(0, 'utf8')).version")"
VERSION="$CURRENT_VERSION"

if [[ "$CURRENT_VERSION" == "$PREVIOUS_VERSION" ]]; then
  git switch --quiet --detach origin/main
  CURRENT_VERSION="$(node -p "require('./package.json').version")"
  HEAD_MESSAGE="$(git log -1 --format=%B)"
  if [[ "$(git rev-parse HEAD)" != "$RELEASE_SOURCE" &&
        "$HEAD_MESSAGE" == "chore: bump version to "* && "$HEAD_MESSAGE" == *"[skip ci]"* ]]; then
    VERSION="$CURRENT_VERSION"
    printf 'Using the automatic version bump already covering this push: %s\n' "$VERSION"
  else
    VERSION="$(node - "$CURRENT_VERSION" <<'NODE'
const version = process.argv[2];
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)) {
  throw new Error(`Invalid package version: ${version}`);
}
const [major, minor, patch] = version.split('.').map(Number);
if (![major, minor, patch + 1].every(Number.isSafeInteger)) {
  throw new Error('Version components must be safe integers.');
}
process.stdout.write(`${major}.${minor}.${patch + 1}`);
NODE
)"
  fi
fi

TAG="v$VERSION"
PUSH_MAIN=0
STEP="preparing the release version and tag"
git config --local user.name "github-actions[bot]"
git config --local user.email "41898282+github-actions[bot]@users.noreply.github.com"
if git show-ref --verify --quiet "refs/tags/$TAG"; then
  [[ "$(git rev-parse "refs/tags/$TAG^{commit}")" == "$(git rev-parse HEAD)" ]] ||
    fail "Tag '$TAG' already belongs to a different commit; it will not be moved."
  node scripts/release-version.mjs verify "$VERSION"
else
  node scripts/release-version.mjs check "$CURRENT_VERSION" "$VERSION" origin
  if [[ "$VERSION" != "$CURRENT_VERSION" ]]; then
    node scripts/bump-version.mjs "$VERSION"
    node scripts/release-version.mjs verify "$VERSION"
    git add -- package.json package-lock.json server/package.json server/package-lock.json tests/setup.ts
    VALIDATED_TREE="$(git write-tree)"
    git commit --no-gpg-sign -m "chore: bump version to $VERSION [skip ci]"
    [[ "$(git rev-parse 'HEAD^{tree}')" == "$VALIDATED_TREE" ]] ||
      fail "A commit hook changed the release contents; no tag has been pushed."
    PUSH_MAIN=1
  else
    node scripts/release-version.mjs verify "$VERSION"
  fi
  [[ -z "$(git status --porcelain)" ]] || fail "The checkout changed before tagging."
  git -c tag.gpgSign=false tag -a "$TAG" -m "Release $TAG"
fi

STEP="pushing the release refs"
if [[ "$PUSH_MAIN" == 1 ]]; then
  git push --atomic origin HEAD:refs/heads/main "refs/tags/$TAG:refs/tags/$TAG"
else
  git push origin "refs/tags/$TAG:refs/tags/$TAG"
fi
printf 'tag=%s\n' "$TAG" >> "$GITHUB_OUTPUT"
printf 'Prepared %s; the reusable release workflow will build and publish its installers.\n' "$TAG"
