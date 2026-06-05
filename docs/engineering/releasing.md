# Cutting a release

Releases are driven by **git tags**. Pushing a tag matching `v*` (e.g.
`v2.1.1`) triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml),
which:

1. **Verifies** the tag's core `X.Y.Z` matches `package.json` `version`.
2. Builds the macOS (arm64 + x64) DMGs and the Windows installer.
3. Publishes a GitHub Release with those assets.

If the tag and `package.json` disagree, the `verify` job fails with:

> Tag 'vX.Y.Z' does not match package.json version '...'.

## One-tap script

Use [`scripts/release.sh`](../../scripts/release.sh). It enforces the same
rules as CI **before** anything is pushed, so you never ship a mismatched tag.

```sh
# Release the version already committed to main:
./scripts/release.sh

# Bump to the next minor (X.Y.Z -> X.(Y+1).0), commit + push main, then release:
./scripts/release.sh --bump

# Bump to an explicit version, then release:
./scripts/release.sh --bump 2.1.3
```

What it does:

- Refuses to run unless you are on a clean `main` that is in sync with `origin/main`.
- With `--bump X.Y.Z`: runs `scripts/bump-version.mjs`, commits with
  `--no-gpg-sign`, and pushes `main`.
- With a bare `--bump` (no version): bumps to the next minor — `X.Y.Z` becomes
  `X.(Y+1).0` (e.g. `2.1.1` → `2.2.0`).
- Verifies `package.json` core matches the tag core.
- Refuses to clobber an existing local or remote tag.
- Creates an annotated tag `vX.Y.Z` and pushes it.

The published GitHub Release body is **changelog first** (auto-generated from
the PRs/commits since the previous tag, via the GitHub API) followed by the
macOS/Windows install instructions — see the `Build release notes` step in
[`release.yml`](../../.github/workflows/release.yml).

> If `main` is branch-protected and the bump push is rejected, open a PR for the
> bump, merge it, then re-run `./scripts/release.sh` (no `--bump`).

## What `scripts/bump-version.mjs` updates

`node scripts/bump-version.mjs <X.Y.Z>` keeps the version consistent across:

- `package.json` and `package-lock.json` (root)
- `server/package.json` and `server/package-lock.json`
- `tests/setup.ts` (`__APP_VERSION__` stub)

## Fixing a mismatched tag

If a tag already points at the wrong commit (version drift), move it to the
commit whose `package.json` matches, then force-push:

```sh
git tag -f vX.Y.Z <commit>
git push origin vX.Y.Z --force
```
