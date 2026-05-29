# Landing page

Static landing page for `fire-tools`. Hand-rolled HTML + CSS — no build
step, no framework. Tracks issue
[#138](https://github.com/mbianchidev/fire-tools/issues/138).

## Where it lives in production

`npm run build:landing` copies the contents of `website/` to
`dist/landing/`, which the existing GitHub Pages workflow publishes
alongside the SPA. The live URLs are:

- `https://mbianchidev.github.io/fire-tools/` — the app (unchanged)
- `https://mbianchidev.github.io/fire-tools/landing/` — this landing page

If you want the landing page to be the default (`/`), point the
workflow to copy `website/index.html` to `dist/index.html` *before*
copying the app build — out of scope for this PR.

## Local preview

```sh
cd website
python3 -m http.server 4000
# open http://localhost:4000
```
