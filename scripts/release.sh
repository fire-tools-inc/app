#!/usr/bin/env bash
#
# release.sh — one-tap release cutter for Fire Tools.
#
# Verifies main is clean and in sync, optionally bumps the version, checks that
# package.json matches the tag (mirrors .github/workflows/release.yml), then
# creates an annotated tag vX.Y.Z and pushes it. Pushing the tag triggers the
# Release workflow, which builds the desktop apps and publishes the GitHub
# Release.
#
# Usage:
#   ./scripts/release.sh                 # release the version already in package.json
#   ./scripts/release.sh --bump          # bump to the next minor (X.Y.Z -> X.(Y+1).0), then release
#   ./scripts/release.sh --bump 2.1.3    # bump to an explicit version, then release
#   ./scripts/release.sh -h | --help
#
set -euo pipefail

cd "$(dirname "$0")/.."

DEFAULT_BRANCH="main"
REMOTE="origin"
REPO_URL="https://github.com/fire-tools-inc/app"

err()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }

usage() {
  sed -n '3,15p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
}

# Return the "X.Y.Z" core of a version or tag, or empty if unparseable.
core() {
  node -e "const m=String(process.argv[1]??'').trim().replace(/^v/i,'').match(/^(\d+)\.(\d+)\.(\d+)/);process.stdout.write(m?m[1]+'.'+m[2]+'.'+m[3]:'')" "$1"
}

BUMP_REQUESTED=0
BUMP_TO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --bump)
      BUMP_REQUESTED=1
      # An explicit version is optional; without one we bump the next minor.
      if [[ -n "${2:-}" && "$2" != -* ]]; then
        BUMP_TO="$2"; shift 2
      else
        shift 1
      fi ;;
    *) err "unknown argument: $1"; usage; exit 1 ;;
  esac
done

# 1. Must run from a clean default branch.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "$DEFAULT_BRANCH" ]]; then
  err "releases must be cut from '$DEFAULT_BRANCH' (you are on '$BRANCH')."
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  err "working tree is dirty; commit or stash your changes first."
  exit 1
fi

# 2. Sync check against the remote.
info "fetching $REMOTE..."
git fetch --quiet --prune --tags "$REMOTE"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$REMOTE/$DEFAULT_BRANCH")" ]]; then
  err "local '$DEFAULT_BRANCH' is not in sync with $REMOTE/$DEFAULT_BRANCH; run 'git pull --ff-only' first."
  exit 1
fi

# 3. Optional version bump (commit + push to main).
if [[ "$BUMP_REQUESTED" == 1 ]]; then
  # No explicit version → bump to the next minor (X.Y.Z -> X.(Y+1).0).
  if [[ -z "$BUMP_TO" ]]; then
    BUMP_TO="$(node -e "const m=require('./package.json').version.match(/^(\d+)\.(\d+)\.(\d+)/);process.stdout.write(m[1]+'.'+(Number(m[2])+1)+'.0')")"
    info "no version given; bumping to next minor: $BUMP_TO"
  fi
  if ! [[ "$BUMP_TO" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    err "'$BUMP_TO' is not a valid X.Y.Z version."
    exit 1
  fi
  info "bumping version to $BUMP_TO..."
  node scripts/bump-version.mjs "$BUMP_TO"
  git add -u
  git commit --no-gpg-sign -m "chore: bump version to $BUMP_TO"
  info "pushing version bump to $REMOTE/$DEFAULT_BRANCH..."
  if ! git push "$REMOTE" "$DEFAULT_BRANCH"; then
    err "failed to push the bump to $DEFAULT_BRANCH (branch protection?). Open a PR for the bump, merge it, then re-run without --bump."
    exit 1
  fi
fi

# 4. Resolve the version to release.
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

# 5. Verify package.json core matches the tag core (same rule as CI).
if [[ -z "$(core "$VERSION")" ]]; then
  err "could not parse package.json version '$VERSION' as semver."
  exit 1
fi
if [[ "$(core "$TAG")" != "$(core "$VERSION")" ]]; then
  err "tag '$TAG' (core $(core "$TAG")) does not match package.json version '$VERSION' (core $(core "$VERSION"))."
  exit 1
fi

# 6. Refuse to clobber an existing tag.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  err "tag '$TAG' already exists locally. Bump to a new version (--bump X.Y.Z)."
  exit 1
fi
if git ls-remote --exit-code --tags "$REMOTE" "$TAG" >/dev/null 2>&1; then
  err "tag '$TAG' already exists on $REMOTE. Bump to a new version (--bump X.Y.Z)."
  exit 1
fi

# 7. Tag and push — this is what triggers the Release workflow.
info "creating annotated tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"
info "pushing tag $TAG to $REMOTE..."
git push "$REMOTE" "$TAG"

info "done. Release build: $REPO_URL/actions/workflows/release.yml"
