# GitHub Pages deploy

The public site is deployed by [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
from the generated `dist/` directory:

- `dist/index.html` is the landing page.
- `dist/demo/` is the Vite web demo.
- `dist/docs/` is the rendered documentation.
- `dist/api/` is the OpenAPI viewer.

The build job uses one locked `npm ci --ignore-scripts` installation for the
full renderer test suite (with coverage and two workers) and the subsequent
production build. Tests must pass before the site is built or uploaded.
Deployment remains a separate job behind the `github-pages` environment and
the non-cancelling production concurrency group.

The demo uses stable entry and chunk filenames (`assets/index.js`,
`assets/index.css`, and stable chunk names) instead of Vite's default hashed
filenames. GitHub Pages caches HTML for a short time; during a deploy, a browser
can briefly hold an older `demo/index.html`. Stable asset paths keep that stale
HTML loading the app instead of requesting deleted `index-*.js` or
`index-*.css` files and rendering a blank page.

Run `npm run build` before opening a Pages deploy PR. The generated
`dist/demo/index.html` should reference `/app/demo/assets/index.js` and
`/app/demo/assets/index.css` for the production repository.

To validate a workflow branch in Actions without deploying the public site:

```sh
gh workflow run deploy.yml --repo fire-tools-inc/app --ref your-workflow-branch \
  -f build_only=true
```

This runs the full test/build job and uploads its Pages artifact, but skips
deployment. Its separate concurrency group cannot replace a pending production
deploy. Normal `main` pushes and manual dispatches without `build_only=true`
retain their deployment behavior and environment restrictions.
