// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const siteUrls = require('../../electron/siteUrls.cjs');
const { resolveSiteUrl } = siteUrls;

describe('electron/siteUrls.cjs', () => {
  it('uses the package.json homepage as the site root', () => {
    expect(resolveSiteUrl('https://docs.example.test/fire?x=1#top', 'https://github.com/acme/app')).toBe('https://docs.example.test/fire/');
    expect(siteUrls.OPENAPI_URL).toBe(new URL('api/openapi.yaml', siteUrls.SITE_URL).href);
    expect(siteUrls.SITE_URL).not.toMatch(/github\.(com|io)/);
  });

  it('falls back to the GitHub Pages project site while the homepage is the repository', () => {
    expect(resolveSiteUrl('https://github.com/acme/app', 'https://github.com/acme/renamed.git')).toBe('https://acme.github.io/renamed/');
    expect(resolveSiteUrl(undefined, 'https://github.com/acme/app/')).toBe('https://acme.github.io/app/');
    expect(resolveSiteUrl('', '')).toBe('');
  });

  it('rejects homepages that are not https URLs', () => {
    expect(() => resolveSiteUrl('http://docs.example.test/', '')).toThrow(/https/);
    expect(() => resolveSiteUrl('not a url', '')).toThrow();
  });
});
