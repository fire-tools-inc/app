// @vitest-environment node
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileMatcher, getFileMatchers } from 'app-builder-lib/out/fileMatcher';
import { load } from 'js-yaml';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const platformFiles = z.object({
  files: z.array(z.string()),
  mac: z.object({ files: z.array(z.string()) }),
  win: z.object({ files: z.array(z.string()) }),
  linux: z.object({ files: z.array(z.string()) }),
}).parse(load(readFileSync(resolve('electron-builder.yml'), 'utf8')));
const prebuilds = join(dirname(require.resolve('better-sqlite3/package.json')), 'prebuilds');

describe('SQLite Node-API packaging', () => {
  it.each([
    { platform: 'mac' as const, arch: 'arm64', expected: ['darwin-arm64.node'] },
    { platform: 'mac' as const, arch: 'x64', expected: ['darwin-x64.node'] },
    { platform: 'win' as const, arch: 'x64', expected: ['win32-x64.node'] },
    { platform: 'linux' as const, arch: 'x64', expected: ['linux-x64.node', 'linuxmusl-x64.node'] },
  ])('retains only the $platform/$arch prebuilds with the actual builder filter', ({ platform, arch, expected }) => {
    const matcher = new FileMatcher(process.cwd(), '/synthetic-output', pattern => pattern.replaceAll('${arch}', arch));
    matcher.prependPattern('**/*');
    for (const pattern of platformFiles.files.filter(pattern => pattern.startsWith('!'))) matcher.addPattern(pattern);
    for (const pattern of platformFiles[platform].files) matcher.addPattern(pattern);
    const filter = matcher.createFilter();
    const retained = readdirSync(prebuilds).filter(file => {
      const path = join(prebuilds, file);
      return filter(path, statSync(path));
    });
    expect(retained).toEqual(expected);
    expect(filter(join(dirname(prebuilds), 'build', 'Release', 'better_sqlite3.node'),
      statSync(join(prebuilds, expected[0])))).toBe(false);

    const applicationMatchers = getFileMatchers(platformFiles, 'files', '/synthetic-output', {
      defaultSrc: process.cwd(),
      globalOutDir: resolve('release'),
      customBuildOptions: platformFiles[platform],
      macroExpander: pattern => pattern.replaceAll('${arch}', arch),
    });
    const applicationIncludes = (file: string) => applicationMatchers?.some(matcher =>
      matcher.createFilter()(resolve(file), statSync('package.json')));
    expect(applicationIncludes('electron/main.cjs')).toBe(true);
    expect(applicationIncludes('dist-electron/index.html')).toBe(true);
    for (const file of ['tests/browser/workspace.spec.ts', 'test-results/trace.network', 'coverage/index.html']) {
      expect(applicationIncludes(file)).toBe(false);
    }
    expect(platformFiles[platform].files).toContain(platformFiles.files[0]);
  });
});
