# Landing page

Static landing page for `fire-tools`. Hand-rolled HTML + CSS — no build
step, no framework. Tracks issue
[#138](https://github.com/fire-tools-inc/app/issues/138).

## Status

The hosted GitHub Pages deployment has been retired — the browser demo
persisted nothing server-side and was never a usable product surface, so the
app now ships only as the desktop build and the self-hosted Docker stack.

`npm run build:landing` still copies `website/` into `dist/` if you want to
host the landing page yourself.

## Local preview

```sh
cd website
python3 -m http.server 4000
# open http://localhost:4000
```
