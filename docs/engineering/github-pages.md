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
`dist/demo/index.html` should reference `/demo/assets/index.js` and
`/demo/assets/index.css` for the production site.

## Custom domain

The site is served at <https://fire-tools-inc.synctune.it/>. The `homepage`
field in `package.json` is the single source of truth for the public site URL:

- `vite.config.ts` derives the production base path (`<site path>demo/`, so
  `/demo/`) and the `__APP_SITE_URL__` define used for website links in the
  renderer (dashboard "Browse all tools", Settings API guide and reference).
- `electron/siteUrls.cjs` derives the desktop Help menu docs link and the
  `guideUrl` / `openapiUrl` written to the local API connection file.

While `homepage` is missing or still points at `github.com/<owner>/<repo>`,
both fall back to the GitHub Pages project site
`https://<owner>.github.io/<repo>/` (base `/<repo>/demo/`), which follows
repository renames and org moves automatically. A fork that deploys its own
Pages site without a custom domain must reset `homepage` to its repository
URL. A `homepage` that is not an `https://` URL fails the build.

The domain itself is configured outside the build:

- DNS: a `CNAME` record `fire-tools-inc.synctune.it` ->
  `fire-tools-inc.github.io.` in the `synctune.it` zone.
- Repository **Settings -> Pages -> Custom domain** (or
  `gh api repos/fire-tools-inc/app/pages -X PUT -f cname=fire-tools-inc.synctune.it`),
  then **Enforce HTTPS** once the certificate is issued. A `CNAME` file in the
  artifact is ignored for workflow deployments, so none is shipped.

Once the custom domain is bound, GitHub Pages redirects the old
`https://fire-tools-inc.github.io/app/...` URLs to the same path on the custom
domain. Changing the domain or base path therefore needs a coordinated
cutover: bind (or unbind) the Pages custom domain and deploy the matching
`homepage` together. Between those two steps the deployed asset paths and the
served path prefix disagree and the demo renders blank.

To validate a workflow branch in Actions without deploying the public site:

```sh
gh workflow run deploy.yml --repo fire-tools-inc/app --ref your-workflow-branch \
  -f build_only=true
```

This runs the full test/build job and uploads its Pages artifact, but skips
deployment. Its separate concurrency group cannot replace a pending production
deploy. Normal `main` pushes and manual dispatches without `build_only=true`
retain their deployment behavior and environment restrictions.
