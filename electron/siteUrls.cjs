// Public website URLs shared by the Electron main process and vite.config.ts.
// package.json "homepage" is the single source of truth for the site (custom
// domain). While it is missing or still points at the GitHub repository, the
// site falls back to the repository's default GitHub Pages project URL so
// repo renames / org moves keep working: github.com/<owner>/<repo> ->
// <owner>.github.io/<repo>/.

const { homepage } = require('../package.json');

const REPO_URL = 'https://github.com/fire-tools-inc/app';

/** Returns the site root with a trailing slash, or '' when it cannot be derived. */
function resolveSiteUrl(homepageUrl, repoUrl) {
  const configured = typeof homepageUrl === 'string' ? homepageUrl.trim() : '';
  if (configured && !/^https?:\/\/github\.com\//i.test(configured)) {
    const url = new URL(configured);
    if (url.protocol !== 'https:') {
      throw new Error(`package.json "homepage" must be an https:// URL, got ${configured}`);
    }
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return url.href;
  }
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(repoUrl || '');
  return match ? `https://${match[1]}.github.io/${match[2]}/` : '';
}

const SITE_URL = resolveSiteUrl(homepage, REPO_URL);
const sitePage = (path) => new URL(path, SITE_URL).href;

module.exports = {
  resolveSiteUrl,
  REPO_URL,
  SITE_URL,
  DOCS_URL: sitePage('docs/user/'),
  API_GUIDE_URL: sitePage('docs/user/api-access.html'),
  OPENAPI_URL: sitePage('api/openapi.yaml'),
};
