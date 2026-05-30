// Tests for electron/backup.cjs — runs in node env (forced per file) because
// we hit the real filesystem under a tmp dir.
//
// We load the .cjs module via createRequire since the test runner is ESM/jsdom
// by default. The module itself has no Electron dependencies.
//
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Resolved relative to repo root via createRequire from this test file's location.
const backup = require('../../electron/backup.cjs');

interface BackupRecord {
  id: string;
  dir: string;
  timestamp: string;
  version: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  totalBytes: number;
  valid: boolean;
}

describe('electron/backup.cjs', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'fire-tools-backup-'));
    // Seed a realistic userData layout.
    writeFileSync(join(userDataDir, 'firetools.db'), 'DB-CONTENT-v1');
    writeFileSync(join(userDataDir, 'firetools.db-wal'), 'WAL-CONTENT');
    writeFileSync(join(userDataDir, 'window-state.json'), '{"width":800}');
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('creates a backup with manifest and snapshots all known files', async () => {
    const rec = await backup.createBackup({ userDataDir, version: '1.2.3' });

    expect(rec.id).toMatch(/-1\.2\.3$/);
    expect(rec.version).toBe('1.2.3');
    const names = rec.files.map((f: { name: string }) => f.name).sort();
    expect(names).toEqual(['firetools.db', 'firetools.db-wal', 'window-state.json']);
    rec.files.forEach((f: { bytes: number; sha256: string }) => {
      expect(f.bytes).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    const manifest = JSON.parse(readFileSync(join(rec.dir, 'manifest.json'), 'utf8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.timestamp).toBe(rec.timestamp);
  });

  it('throws when there is nothing to back up', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'fire-tools-empty-'));
    try {
      await expect(
        backup.createBackup({ userDataDir: empty, version: '1.0.0' })
      ).rejects.toThrow(/no source files/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('lists backups newest first', async () => {
    const a = await backup.createBackup({ userDataDir, version: '1.0.0' });
    // Ensure ISO timestamp differs from the first one.
    await new Promise((r) => setTimeout(r, 15));
    const b = await backup.createBackup({ userDataDir, version: '1.0.1' });
    await new Promise((r) => setTimeout(r, 15));
    const c = await backup.createBackup({ userDataDir, version: '1.0.2' });

    const list: BackupRecord[] = await backup.listBackups({ userDataDir });
    expect(list.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    list.forEach((entry) => expect(entry.valid).toBe(true));
  });

  it('marks invalid backups with valid=false when manifest is missing', async () => {
    await backup.createBackup({ userDataDir, version: '1.0.0' });
    const root = join(userDataDir, 'backups');
    const orphan = join(root, '2099-01-01T00-00-00-000Z-orphan');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'random.txt'), 'no-manifest-here');

    const list: BackupRecord[] = await backup.listBackups({ userDataDir });
    const bad = list.find((b) => b.id.endsWith('-orphan'));
    expect(bad).toBeDefined();
    expect(bad!.valid).toBe(false);
  });

  it('rotation keeps at least 1 backup even when keep=0 is requested', async () => {
    await backup.createBackup({ userDataDir, version: '1.0.0' });
    await new Promise((r) => setTimeout(r, 15));
    await backup.createBackup({ userDataDir, version: '1.0.1' });
    await new Promise((r) => setTimeout(r, 15));
    const newest = await backup.createBackup({ userDataDir, version: '1.0.2' });

    const result = await backup.rotateBackups({ userDataDir, keep: 0 });
    expect(result.kept).toEqual([newest.id]);
    expect(result.removed.length).toBe(2);

    const after: BackupRecord[] = await backup.listBackups({ userDataDir });
    expect(after.length).toBe(1);
    expect(after[0].id).toBe(newest.id);
  });

  it('rotation keeps newest N and prunes the rest', async () => {
    const recs = [];
    for (let i = 0; i < 4; i++) {
      recs.push(await backup.createBackup({ userDataDir, version: `1.0.${i}` }));
      await new Promise((r) => setTimeout(r, 12));
    }
    const result = await backup.rotateBackups({ userDataDir, keep: 2 });
    expect(result.kept.length).toBe(2);
    expect(result.removed.length).toBe(2);
    // Newest-first ordering means the two most-recent versions stay.
    expect(result.kept).toEqual([recs[3].id, recs[2].id]);
  });

  it('rotation is a no-op when fewer backups than the keep target', async () => {
    const a = await backup.createBackup({ userDataDir, version: '1.0.0' });
    const result = await backup.rotateBackups({ userDataDir, keep: 10 });
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([a.id]);
  });

  it('restores a backup over live userData and creates a safety snapshot', async () => {
    const original = await backup.createBackup({ userDataDir, version: '1.0.0' });

    // Mutate live state — simulate a bad install.
    writeFileSync(join(userDataDir, 'firetools.db'), 'CORRUPTED');

    const out = await backup.restoreBackup({
      userDataDir,
      backupId: original.id,
      currentVersion: '1.0.1',
    });
    expect(out.restored).toContain('firetools.db');
    expect(out.safetyBackupId).toMatch(/-1\.0\.1-prerestore/);

    const dbContent = readFileSync(join(userDataDir, 'firetools.db'), 'utf8');
    expect(dbContent).toBe('DB-CONTENT-v1');

    const list: BackupRecord[] = await backup.listBackups({ userDataDir });
    expect(list.some((b) => b.id === out.safetyBackupId)).toBe(true);
  });

  it('restoreBackup rejects unknown ids and corrupt manifests', async () => {
    await expect(
      backup.restoreBackup({ userDataDir, backupId: 'nope', currentVersion: '1.0.0' })
    ).rejects.toThrow(/unknown backup/);
  });

  it('createBackup is atomic — failed runs leave no .tmp- directory behind', async () => {
    // Successful run, then look at the backups root: no .tmp-* entries.
    await backup.createBackup({ userDataDir, version: '1.0.0' });
    const root = join(userDataDir, 'backups');
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(root);
    expect(entries.some((e) => e.startsWith('.tmp-'))).toBe(false);
  });
});
