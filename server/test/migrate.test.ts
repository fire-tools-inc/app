import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  listMigrations,
  runMigrations,
  rollbackMigrations,
  getMigrationStatus,
} from '../src/migrate.js';

const path = 'migrations';

const tableExists = (db: Database.Database, name: string): boolean => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { name: string } | undefined;
  return !!row;
};

describe('migration runner', () => {
  it('adds the AI permission to existing settings without altering models, flags or receipt originals', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      runMigrations(db, path);
      const aiAndLater = listMigrations(path).filter(migration => migration.id >= '0005');
      rollbackMigrations(db, path, aiAndLater.length);
      db.prepare(`INSERT INTO user_settings (user_id, llm_base_url, llm_api_key, llm_model, experimental_features_json)
        VALUES (1, 'http://localhost:11434/v1', '', 'synthetic', '{"pdfImport":true}')`).run();
      const original = Buffer.from('synthetic receipt bytes');
      db.prepare(`INSERT INTO receipts (user_id, file_name, mime_type, content, sha256)
        VALUES (1, 'synthetic.png', 'image/png', ?, ?)`).run(original, 'a'.repeat(64));
      expect(runMigrations(db, path).migrationsApplied).toEqual(aiAndLater.map(migration => `${migration.id}_${migration.name}`));
      expect(db.prepare('SELECT ai_features_enabled FROM user_settings WHERE user_id = 1').get()).toEqual({ ai_features_enabled: 1 });
      db.prepare('UPDATE user_settings SET ai_features_enabled = 0 WHERE user_id = 1').run();
      expect(() => db.prepare('UPDATE user_settings SET ai_features_enabled = 2 WHERE user_id = 1').run()).toThrow();
      rollbackMigrations(db, path, aiAndLater.length);
      expect(db.prepare('SELECT llm_base_url, llm_api_key, llm_model, experimental_features_json FROM user_settings WHERE user_id = 1').get()).toEqual({
        llm_base_url: 'http://localhost:11434/v1', llm_api_key: '', llm_model: 'synthetic', experimental_features_json: '{"pdfImport":true}',
      });
      expect(db.prepare('SELECT content FROM receipts WHERE user_id = 1').get()).toEqual({ content: original });
    } finally {
      db.close();
    }
  });

  it('lists migrations with paired up/down files', () => {
    const migrations = listMigrations(path);
    expect(migrations.length).toBeGreaterThan(0);
    for (const m of migrations) {
      expect(m.upPath).toMatch(/\.up\.sql$/);
      expect(m.downPath).toMatch(/\.down\.sql$/);
    }
  });

  it('applies migrations and tracks them in schema_migrations', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const result = runMigrations(db, path);
    expect(result.migrationsApplied.length).toBe(result.totalMigrations);

    expect(tableExists(db, 'users')).toBe(true);
    expect(tableExists(db, 'schema_migrations')).toBe(true);

    const status = getMigrationStatus(db, path);
    expect(status.every((m) => m.applied)).toBe(true);

    db.close();
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, path);
    const second = runMigrations(db, path);
    expect(second.migrationsApplied).toEqual([]);
    db.close();
  });

  it('rolls back the last migration and re-applies cleanly', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const applied = runMigrations(db, path);
    const totalMigrations = applied.migrationsApplied.length;
    expect(tableExists(db, 'users')).toBe(true);
    expect(tableExists(db, 'schema_migrations')).toBe(true);

    const rolled = rollbackMigrations(db, path, 1);
    expect(rolled.migrationsRolledBack.length).toBe(1);
    expect(tableExists(db, 'schema_migrations')).toBe(true);

    const reapplied = runMigrations(db, path);
    expect(reapplied.migrationsApplied.length).toBe(1);
    const finalStatus = getMigrationStatus(db, path);
    expect(finalStatus.length).toBe(totalMigrations);
    expect(finalStatus.every((m) => m.applied)).toBe(true);

    db.close();
  });

  it('rolls back everything with steps="all"', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, path);
    const rolled = rollbackMigrations(db, path, 'all');
    expect(rolled.migrationsRolledBack.length).toBeGreaterThan(0);
    expect(tableExists(db, 'users')).toBe(false);
    db.close();
  });

  it('rolling back when nothing is applied is a no-op', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const rolled = rollbackMigrations(db, path, 1);
    expect(rolled.migrationsRolledBack).toEqual([]);
    db.close();
  });
});
