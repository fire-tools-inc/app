# Cutting a release

Every version bump on `main` now creates a matching **git tag** and runs
[`.github/workflows/release.yml`](../../.github/workflows/release.yml), which:

1. **Verifies** the tag's core `X.Y.Z` matches the root/server packages,
   both lockfiles and the test version stub.
2. Builds the macOS (arm64 + x64) DMGs and the Windows installer.
3. Publishes a GitHub Release with those assets.

Every build checks out the exact verified tag commit, not whichever commit is
currently on `main`. Finishing an older build after a newer release does not
force the older version to become GitHub's latest release.

If the tag and `package.json` disagree, the `verify` job fails with:

> Tag 'vX.Y.Z' does not match package.json version '...'.

## Automatic releases

[`.github/workflows/version-bump.yml`](../../.github/workflows/version-bump.yml)
handles pushes to `main`:

- If the push explicitly changes the package version, that version is tagged
  without another increment. This includes selecting `2.4.1` after unpublished
  automatic bumps have advanced the packages to `2.4.3`.
- Otherwise, it increments the patch version across all five version files,
  commits with `--no-gpg-sign`, and atomically pushes the commit and annotated tag.
- It calls the reusable Release workflow with that tag. This explicit call is
  necessary: tag pushes made with `GITHUB_TOKEN` do **not** trigger another
  workflow, even when the version commit also carries `[skip ci]`.

Version preparation is serialized, but different versions can build in
parallel without cancelling one another. An explicit version is tagged at its
merged source commit even if another PR has advanced `main`. A concurrent push
that rejects an automatic bump stops the workflow rather than rebasing a stale
version onto new code. Existing tags are never moved or overwritten.

Changing files with `bump-version.mjs` alone does not publish anything: the
version must be committed and merged into `main`. Do not mark a maintainer's
main push `[skip ci]` if it should run automatic release preparation.

## One-tap script

Pass the desired **stable release tag** to
[`scripts/release.sh`](../../scripts/release.sh). It bumps the version,
validates the release locally, commits and pushes the tag in one command:

```sh
# Example: choose an unreleased version, then run from clean, synced main.
./scripts/release.sh v2.4.1

# Or release the version already committed to main, without another bump:
./scripts/release.sh

# Existing shortcuts remain supported:
./scripts/release.sh --bump
./scripts/release.sh --bump 2.4.1
```

Prerequisites: Git, Node.js >=22.22.0, npm, a clean `main` checkout synchronized
with `origin/main`, and permission to push both the release commit and tag.
Merge the intended changes and wait for the automatic version-bump workflow
before synchronizing your release checkout. The script never switches branches,
merges a PR, force-pushes or rewrites an existing tag.

The script performs these steps in order:

1. Fetch and verify the current `main` commit, reject malformed versions,
   versions older than the newest **stable remote release tag**, and existing
   tags, then update the five version files when needed. Unpublished package
   bumps are not releases: if `v2.4.0` is the latest stable remote tag,
   `v2.4.1` is valid even when the packages currently say `2.4.3`. With no stable
   remote tags, the current package version remains the downgrade baseline.
   Local-only retained tags and prerelease tags do not change this baseline.
   Bare `--bump` chooses the next minor version.
2. Run sequential clean installs in the root and `server/`, both dependency
   audits and both full test suites.
3. Ensure the Playwright Chromium binary is installed and run the production
   browser regression suite. Chromium's OS libraries must be available; the
   script does not automatically install privileged system packages.
4. Build the Pages site and the Electron renderer/embedded backend with the
   existing build scripts.
5. Verify every version again, reject unrelated changes introduced by checks,
   and recheck that local and remote `main` did not move during validation.
   Validated file contents must stay unchanged through the checks and commit
   hooks; unexpected modifications stop the release.
6. Commit only the version files with `--no-gpg-sign` and no tool attribution,
   create an unsigned annotated `vX.Y.Z` tag, and push `main` and the tag
   **atomically**. Automatic release preparation preserves this explicit
   version and reuses the same tag instead of bumping again.
7. Print that **GitHub Actions will build and publish the release**, with the
   release-workflow URL. The script returns after the push; it does not wait for
   Actions or claim the installers have already been published.

Local checks must all pass before any commit or tag is pushed. Maintainer tag
pushes still trigger Release directly; automatic bumps call the same reusable
workflow. Neither path publishes through local packaging or `gh release create`.
The website's main-triggered Pages workflow remains separate.

The published GitHub Release body is **changelog first** (auto-generated from
the PRs/commits since the previous tag, via the GitHub API) followed by the
macOS/Windows install instructions — see the `Build release notes` step in
[`release.yml`](../../.github/workflows/release.yml).

## Failed runs and protected branches

The script stops with a nonzero exit on a failed install, audit, test, build,
version check or remote operation. It preserves local edits, commits and tags;
it does not automatically discard work.

If an atomic push is rejected, neither ref is published by that transaction.
For an interrupted connection, inspect remote refs before assuming whether
the server accepted the push. There is no fallback to separate, partially
successful pushes.

If branch protection requires a PR for the bump, submit the local version commit
for review and merge it; automatic preparation then tags and publishes that
version. A local tag retained from a failed push must be inspected and handled
explicitly first; the script will not move or overwrite it. Never push the
retained tag at an unmerged local commit merely to bypass branch protection.

Monitor **Auto bump patch version** for automatic releases or **Release** for
direct tag pushes. If an installer build or publication fails, rerun the failed
jobs. A prepared tag can also be retried explicitly without another bump:

```sh
gh workflow run release.yml --repo fire-tools-inc/app --ref main -f tag=v2.4.1
```

The dispatch builds the existing tag; it does not create or retarget one.

## What `scripts/bump-version.mjs` updates

`node scripts/bump-version.mjs <X.Y.Z>` keeps the version consistent across:

- `package.json` and `package-lock.json` (root)
- `server/package.json` and `server/package-lock.json`
- `tests/setup.ts` (`__APP_VERSION__` stub)

## Fixing a mismatched or published tag

Do not move an existing published tag. Correct the version through the normal
reviewed branch flow and choose a new unused tag. The script verifies the
root/server manifests, both lockfiles and the test version stub together.
