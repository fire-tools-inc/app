# Landing page

Static landing page for `fire-tools`. Hand-rolled HTML + CSS, no build
step and no framework. It uses the same tokens as the app (`src/App.css`),
system fonts and no external font or script requests. Tracks issue
[#138](https://github.com/fire-tools-inc/app/issues/138).

## Where it lives in production

`npm run build:landing` copies the contents of `website/` to `dist/`
(the site root) so it ships at the GitHub Pages root. The SPA lives
under `dist/demo/`. GitHub Pages serves it on the custom domain set in
`package.json` `homepage` (see
[GitHub Pages deploy](../docs/engineering/github-pages.md#custom-domain)).
The live URLs are:

- `https://fire-tools-inc.synctune.it/`: this landing page
- `https://fire-tools-inc.synctune.it/demo/`: the read-only demo app

## Screenshots

The page shows real app screenshots from `docs/user/screenshots/`, which
`npm run build:docs` publishes under `dist/docs/user/screenshots/`.
Refresh them with `npm run docs:screenshots` after UI changes.

## Local preview

Build once so the docs screenshots and demo exist next to the page:

```sh
npm run build
python3 -m http.server 4000 --directory dist
# open http://localhost:4000/
```

For a quick HTML/CSS-only check, `cd website && python3 -m http.server 4000`
works too, but screenshots will not load there.
