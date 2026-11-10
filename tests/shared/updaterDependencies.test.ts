// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper';
import type { UpdateInfo } from 'builder-util-runtime';
import type { ResolvedUpdateFileInfo } from 'electron-updater/out/types';

const payload = 'synthetic update binary';
const sha512 = createHash('sha512').update(payload).digest('base64');
const updateInfo: UpdateInfo = {
  version: '9.9.9',
  releaseDate: '2026-01-01T00:00:00.000Z',
  releaseNotes: [{ version: '9.9.9', note: 'Synthetic release notes' }],
  files: [{ url: 'synthetic.zip', sha512, size: payload.length }],
};
const fileInfo: ResolvedUpdateFileInfo = {
  url: new URL('https://example.invalid/synthetic.zip'),
  info: updateInfo.files[0],
};
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
let directory: string;
let updateFile: string;
let helper: DownloadedUpdateHelper;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fire-tools-updater-test-'));
  helper = new DownloadedUpdateHelper(directory);
  await mkdir(helper.cacheDirForPendingUpdate);
  updateFile = join(helper.cacheDirForPendingUpdate, 'synthetic.zip');
  await writeFile(updateFile, payload);
  await helper.setDownloadedFile(updateFile, null, updateInfo, fileInfo, 'synthetic.zip', true);
});

afterEach(async () => rm(directory, { recursive: true, force: true }));

describe('updater metadata comparison after replacing deprecated lodash.isequal', () => {
  it('reuses an in-memory download with equivalent nested release and file metadata', async () => {
    const equivalent = structuredClone(updateInfo);
    expect(await helper.validateDownloadedPath(updateFile, equivalent, {
      url: new URL(fileInfo.url.href), info: { ...fileInfo.info },
    }, logger)).toBe(updateFile);
  });

  it('does not reuse a download for a changed version or release-notes array', async () => {
    expect(await helper.validateDownloadedPath(updateFile, {
      ...updateInfo, version: '9.9.10',
    }, fileInfo, logger)).toBeNull();
    expect(await helper.validateDownloadedPath(updateFile, {
      ...updateInfo, releaseNotes: [{ version: '9.9.9', note: 'Changed synthetic note' }],
    }, fileInfo, logger)).toBeNull();
  });

  it('does not reuse a download with changed checksum or file size', async () => {
    for (const info of [
      { ...fileInfo.info, sha512: 'changed-synthetic-checksum' },
      { ...fileInfo.info, size: payload.length + 1 },
    ]) {
      expect(await helper.validateDownloadedPath(updateFile, updateInfo, {
        ...fileInfo, info,
      }, logger)).toBeNull();
    }
  });

  it('still validates a persisted download checksum after an app restart', async () => {
    const restarted = new DownloadedUpdateHelper(directory);
    expect(await restarted.validateDownloadedPath(updateFile, updateInfo, fileInfo, logger)).toBe(updateFile);
    expect(restarted.downloadedFileInfo?.sha512).toBe(sha512);
  });

  it('rejects a persisted download whose bytes no longer match the checksum', async () => {
    await writeFile(updateFile, 'different synthetic binary');
    const restarted = new DownloadedUpdateHelper(directory);
    expect(await restarted.validateDownloadedPath(updateFile, updateInfo, fileInfo, logger)).toBeNull();
  });
});
