#!/usr/bin/env bash
#
# release.sh — one-tap release cutter for Fire Tools.
#
# Bumps the requested version, validates locally, then atomically pushes the
# release commit and annotated tag. GitHub Actions publishes the installers.
#
# Usage:
#   ./scripts/release.sh vX.Y.Z          # bump, validate, commit and tag
#   ./scripts/release.sh                 # validate and tag the committed version
#   ./scripts/release.sh --bump          # next minor version
#   ./scripts/release.sh --bump X.Y.Z     # explicit version (legacy interface)
#   ./scripts/release.sh -h | --help
#
set -Eeuo pipefail

cd "$(dirname "$0")/.."

DEFAULT_BRANCH="main"
REMOTE="origin"
REPO_URL="https://github.com/fire-tools-inc/app"

err()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
fail() { err "$*"; exit 1; }

STEP="checking release prerequisites"
trap 'status=$?; err "Release failed while $STEP (exit $status). Local changes and tags are preserved; inspect git status before retrying."; exit "$status"' ERR

usage() {
 cat <<'EOF'
Usage:
 ./scripts/release.sh vX.Y.Z       Bump, validate, commit and push the tag.
 ./scripts/release.sh             Validate and tag the committed version.
 ./scripts/release.sh --bump       Bump to the next minor and release.
 ./scripts/release.sh --bump X.Y.Z  Bump to an explicit version and release.

Requires a clean main checkout synchronized with origin/main.
Runs clean installs, both audits/test suites, browser tests and Pages/Electron builds.
Pushes main and the tag atomically; Actions publishes the release afterward.
EOF
}

valid_version() {
 [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
}

BUMP_REQUESTED=0
BUMP_TO=""
while [[ $# -gt 0 ]]; do
 case "$1" in
   -h|--help) usage; exit 0 ;;
   v*)
     [[ "$BUMP_REQUESTED" == 0 ]] || fail "Specify only one release tag or --bump option."
     BUMP_TO="${1#v}"
     valid_version "$BUMP_TO" || fail "'$1' is not a valid stable tag; expected vX.Y.Z."
     BUMP_REQUESTED=1
     shift ;;
   --bump)
     [[ "$BUMP_REQUESTED" == 0 ]] || fail "Specify only one release tag or --bump option."
     BUMP_REQUESTED=1
     if [[ -n "${2:-}" && "$2" != -* ]]; then
       BUMP_TO="$2"
       valid_version "$BUMP_TO" || fail "'$BUMP_TO' is not a valid stable version; expected X.Y.Z."
       shift 2
     else
       shift 1
     fi ;;
   *) fail "Unknown argument: $1. Use --help for release usage." ;;
 esac
done

for tool in git node npm; do
 command -v "$tool" >/dev/null || fail "$tool is required to release."
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 22)) { console.error("Releases require Node.js >=22.22.0."); process.exit(1); }'

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "$DEFAULT_BRANCH" ]] || fail "Releases must be cut from '$DEFAULT_BRANCH' (you are on '$BRANCH')."
[[ -z "$(git status --porcelain)" ]] || fail "Working tree is dirty; commit or stash your changes first."

STEP="fetching release refs"
info "fetching $REMOTE..."
git fetch --quiet --prune --tags "$REMOTE"
BASE_COMMIT="$(git rev-parse HEAD)"
[[ "$BASE_COMMIT" == "$(git rev-parse "$REMOTE/$DEFAULT_BRANCH")" ]] ||
 fail "Local '$DEFAULT_BRANCH' is not in sync with $REMOTE/$DEFAULT_BRANCH; run 'git pull --ff-only' first."

CURRENT_VERSION="$(node -p "require('./package.json').version")"
valid_version "$CURRENT_VERSION" || fail "package.json must contain a stable X.Y.Z version."
VERSION="$CURRENT_VERSION"
if [[ "$BUMP_REQUESTED" == 1 ]]; then
 if [[ -z "$BUMP_TO" ]]; then
   BUMP_TO="$(node -e 'const [major, minor] = process.argv[1].split(".").map(Number); process.stdout.write(`${major}.${minor + 1}.0`)' "$CURRENT_VERSION")"
 fi
 VERSION="$BUMP_TO"
fi
TAG="v$VERSION"

node - "$CURRENT_VERSION" "$VERSION" <<'NODE'
const current = process.argv[2].split('.').map(Number);
const requested = process.argv[3].split('.').map(Number);
if (![...current, ...requested].every(Number.isSafeInteger)) {
 console.error('Version components must be safe integers.');
 process.exit(1);
}
const firstDifference = requested.findIndex((value, index) => value !== current[index]);
if (firstDifference !== -1 && requested[firstDifference] < current[firstDifference]) {
 console.error(`Requested version ${process.argv[3]} is older than ${process.argv[2]}.`);
 process.exit(1);
}
NODE

check_tag_available() {
 if git show-ref --verify --quiet "refs/tags/$TAG"; then
   fail "Tag '$TAG' already exists locally; choose a new version."
 fi
 local refs
 refs="$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG")"
 [[ -z "$refs" ]] || fail "Tag '$TAG' already exists on $REMOTE; choose a new version."
}

check_main_unchanged() {
 local refs
 refs="$(git ls-remote --heads "$REMOTE" "refs/heads/$DEFAULT_BRANCH")"
 [[ "$refs" == "$BASE_COMMIT"$'\t'"refs/heads/$DEFAULT_BRANCH" ]] ||
   fail "$REMOTE/$DEFAULT_BRANCH changed during validation. Inspect your local version changes and synchronize before releasing."
}

verify_versions() {
 node - "$VERSION" <<'NODE'
const fs = require('node:fs');
const version = process.argv[2];
for (const file of ['package.json', 'package-lock.json', 'server/package.json', 'server/package-lock.json']) {
 const data = JSON.parse(fs.readFileSync(file, 'utf8'));
 if (data.version !== version || (file.endsWith('package-lock.json') && data.packages?.['']?.version !== version)) {
   console.error(`${file} does not match release version ${version}.`);
   process.exit(1);
 }
}
const setup = fs.readFileSync('tests/setup.ts', 'utf8');
const testVersion = setup.match(/vi\.stubGlobal\('__APP_VERSION__',\s*'([^']+)'\)/)?.[1];
if (testVersion !== version) {
 console.error(`tests/setup.ts does not match release version ${version}.`);
 process.exit(1);
}
NODE
}

check_tag_available
if [[ "$VERSION" != "$CURRENT_VERSION" ]]; then
 STEP="updating version files"
 info "bumping version to $VERSION..."
 node scripts/bump-version.mjs "$VERSION"
fi
verify_versions
VERSION_DIFF="$(git diff --binary HEAD)"

STEP="installing dependencies"
info "restoring root and server dependencies..."
npm ci
npm --prefix server ci

STEP="auditing dependencies"
npm audit
npm --prefix server audit

STEP="running renderer and backend tests"
info "running local test suites..."
npm test
npm --prefix server test

STEP="running production browser tests"
npm exec -- playwright install chromium
npm run test:browser

STEP="building Pages and Electron with the embedded backend"
info "building release sources..."
npm run build
npm run electron:build
verify_versions

STEP="checking validated release state"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "$DEFAULT_BRANCH" && "$(git rev-parse HEAD)" == "$BASE_COMMIT" ]] ||
 fail "The local branch or HEAD changed during validation; inspect the checkout before releasing."
CHANGED_FILES="$(git diff --name-only HEAD && git ls-files --others --exclude-standard)"
while IFS= read -r file; do
 case "$file" in
   ""|package.json|package-lock.json|server/package.json|server/package-lock.json|tests/setup.ts) ;;
   *) fail "Unexpected change during validation: $file. Nothing has been staged or pushed." ;;
 esac
done <<< "$CHANGED_FILES"
[[ "$(git diff --binary HEAD)" == "$VERSION_DIFF" ]] ||
  fail "Tracked files changed during validation; the checked release contents will not be committed."
check_main_unchanged
check_tag_available

STEP="committing the validated version"
if [[ -n "$CHANGED_FILES" ]]; then
 git add -- package.json package-lock.json server/package.json server/package-lock.json tests/setup.ts
 VALIDATED_TREE="$(git write-tree)"
 git commit --no-gpg-sign -m "chore: bump version to $VERSION"
 [[ "$(git rev-parse 'HEAD^{tree}')" == "$VALIDATED_TREE" ]] ||
   fail "A commit hook changed the validated release contents; no tag has been pushed."
fi
[[ -z "$(git status --porcelain)" ]] || fail "The checkout changed while committing; no tag has been pushed."
verify_versions

STEP="creating and pushing the release tag"
check_main_unchanged
check_tag_available
info "creating annotated tag $TAG..."
git -c tag.gpgSign=false tag -a "$TAG" -m "Release $TAG"
info "pushing the validated commit and $TAG atomically..."
if ! git push --atomic "$REMOTE" "HEAD:refs/heads/$DEFAULT_BRANCH" "refs/tags/$TAG:refs/tags/$TAG"; then
 fail "The atomic push did not confirm publication (branch protection, tag rejection or connection failure). Local commit and tag are preserved. Inspect remote refs before retrying; no non-atomic fallback is attempted."
fi

info "pushed $TAG. GitHub Actions will build the installers and publish the release."
info "publication runs asynchronously: $REPO_URL/actions/workflows/release.yml"
