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

  it('rolls back the amount breakdown without changing expense totals', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db, path);
      db.exec(`INSERT INTO expense_years (id, user_id, year) VALUES (1, 1, 2024);
        INSERT INTO expense_months (id, user_id, expense_year_id, month) VALUES (1, 1, 1, 6);
        INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description, category, expense_type, unit_amount, quantity)
        VALUES (1, 1, 'e-1', '2024-06-03', 90, 'Sessions', 'HEALTHCARE', 'NEED', 45, 2)`);
      expect(() => db.prepare("UPDATE expense_entries SET quantity = 0 WHERE external_id = 'e-1'").run()).toThrow();
      const fromQuantity = listMigrations(path).filter(migration => migration.id >= '0007');
      expect(rollbackMigrations(db, path, fromQuantity.length).migrationsRolledBack).toContain('0007_expense_quantity');
      expect(db.prepare("SELECT * FROM expense_entries WHERE external_id = 'e-1'").get()).toMatchObject({ amount: 90 });
      expect(db.prepare("SELECT * FROM expense_entries WHERE external_id = 'e-1'").get()).not.toHaveProperty('quantity');
    } finally {
      db.close();
    }
  });

  it('merges retired expense categories and restores unedited rows on rollback', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      runMigrations(db, path);
      const mergeAndLater = listMigrations(path).filter(migration => migration.id >= '0008');
      rollbackMigrations(db, path, mergeAndLater.length);
      db.exec(`INSERT INTO expense_years (id, user_id, year) VALUES (1, 1, 2024);
        INSERT INTO expense_months (id, user_id, expense_year_id, month) VALUES (1, 1, 1, 6), (2, 1, 1, 7);
        INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description, category, expense_type) VALUES
          (1, 1, 'fee', '2024-06-03', 4, 'Synthetic fee', 'FEES', 'NEED'),
          (1, 1, 'trip', '2024-06-04', 300, 'Synthetic trip', 'HOLIDAYS', 'WANT'),
          (1, 1, 'edited', '2024-06-05', 7, 'Synthetic charge', 'FEES', 'NEED'),
          (1, 1, 'other', '2024-06-06', 9, 'Synthetic other', 'BUSINESS', 'NEED');
        INSERT INTO category_budgets (user_id, expense_month_id, category, monthly_budget, currency) VALUES
          (1, 1, 'FEES', 10, 'EUR'), (1, 1, 'BUSINESS', 50, 'EUR'),
          (1, 2, 'HOLIDAYS', 200, NULL), (1, NULL, 'FEES', 5, NULL), (1, NULL, 'BUSINESS', 20, NULL);
        INSERT INTO category_overrides (user_id, category_id, name) VALUES (1, 'FEES', 'Synthetic fees'), (1, 'BUSINESS', 'Synthetic work');
        INSERT INTO expense_planning (user_id, payload_json) VALUES
          (1, '{"schemaVersion":1,"schedules":[],"skippedOccurrences":[],"goals":[],"rules":[{"id":"r","name":"Fee","enabled":true,"priority":0,"match":{"description":"fee","operator":"contains"},"kind":"expense","category":"FEES","expenseType":"NEED"}]}');
        INSERT INTO pdf_imports (user_id, source_file, doc_type, drafts_json) VALUES
          (1, 'synthetic.pdf', 'receipt', '[{"id":"d","suggestedCategory":"HOLIDAYS"}]');`);
      runMigrations(db, path);

      const categories = () => Object.fromEntries((db.prepare('SELECT external_id, category FROM expense_entries ORDER BY external_id')
        .all() as Array<{ external_id: string; category: string }>).map(row => [row.external_id, row.category]));
      const budgets = () => db.prepare(`SELECT expense_month_id AS month, category, monthly_budget AS amount, currency
        FROM category_budgets ORDER BY expense_month_id, category`).all();
      expect(categories()).toEqual({ edited: 'BUSINESS', fee: 'BUSINESS', other: 'BUSINESS', trip: 'TRAVEL' });
      expect(budgets()).toEqual([
        { month: null, category: 'BUSINESS', amount: 25, currency: null },
        { month: 1, category: 'BUSINESS', amount: 60, currency: 'EUR' },
        { month: 2, category: 'TRAVEL', amount: 200, currency: null },
      ]);
      expect(db.prepare('SELECT category_id, name FROM category_overrides').all()).toEqual([{ category_id: 'BUSINESS', name: 'Synthetic work' }]);
      expect(db.prepare('SELECT payload_json FROM expense_planning').get()).toMatchObject({ payload_json: expect.stringContaining('"category":"BUSINESS"') });
      expect(db.prepare('SELECT drafts_json FROM pdf_imports').get()).toEqual({ drafts_json: '[{"id":"d","suggestedCategory":"TRAVEL"}]' });

      db.prepare("UPDATE expense_entries SET category = 'OTHER' WHERE external_id = 'edited'").run();
      rollbackMigrations(db, path, mergeAndLater.length);
      expect(categories()).toEqual({ edited: 'OTHER', fee: 'FEES', other: 'BUSINESS', trip: 'HOLIDAYS' });
      expect(budgets()).toEqual([
        { month: null, category: 'BUSINESS', amount: 20, currency: null },
        { month: null, category: 'FEES', amount: 5, currency: null },
        { month: 1, category: 'BUSINESS', amount: 50, currency: 'EUR' },
        { month: 1, category: 'FEES', amount: 10, currency: 'EUR' },
        { month: 2, category: 'HOLIDAYS', amount: 200, currency: null },
      ]);
      expect(db.prepare('SELECT category_id FROM category_overrides ORDER BY category_id').all())
        .toEqual([{ category_id: 'BUSINESS' }, { category_id: 'FEES' }]);
      expect(db.prepare('SELECT payload_json FROM expense_planning').get()).toMatchObject({ payload_json: expect.stringContaining('"category":"FEES"') });
      expect(db.prepare('SELECT drafts_json FROM pdf_imports').get()).toEqual({ drafts_json: '[{"id":"d","suggestedCategory":"HOLIDAYS"}]' });
      expect(tableExists(db, 'expense_category_merge_backup')).toBe(false);
    } finally {
      db.close();
    }
  });

  it('accepts only supported AI provider presets', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db, path);
      db.prepare("INSERT INTO user_settings (user_id, llm_provider) VALUES (1, 'openrouter')").run();
      expect(() => db.prepare("UPDATE user_settings SET llm_provider = 'unsupported' WHERE user_id = 1").run()).toThrow();
      const providerAndLater = listMigrations(path).filter(migration => migration.id >= '0009');
      expect(rollbackMigrations(db, path, providerAndLater.length).migrationsRolledBack).toContain('0009_llm_provider');
      expect(db.prepare('SELECT * FROM user_settings WHERE user_id = 1').get()).not.toHaveProperty('llm_provider');
    } finally {
      db.close();
    }
  });

  it('tracks domain revisions and rolls back the sync metadata without losing financial rows', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      runMigrations(db, path);
      const revision = (domain: string) => (db.prepare('SELECT revision FROM sync_domains WHERE user_id = 1 AND domain = ?')
        .get(domain) as { revision: number } | undefined)?.revision ?? 0;
      expect(db.prepare("SELECT value FROM sync_meta WHERE key = 'instance_id'").get()).toEqual({ value: expect.stringMatching(/^[0-9a-f]{32}$/) });

      db.exec(`INSERT INTO expense_years (id, user_id, year) VALUES (1, 1, 2025);
        INSERT INTO expense_months (id, user_id, expense_year_id, month) VALUES (1, 1, 1, 3);
        INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description, category, expense_type, position)
        VALUES (1, 1, 'e-1', '2025-03-02', 12, 'Synthetic', 'GROCERIES', 'NEED', 4)`);
      expect(revision('expenseTracker')).toBe(3);
      db.prepare("UPDATE expense_entries SET amount = 13 WHERE external_id = 'e-1'").run();
      db.prepare("DELETE FROM expense_entries WHERE external_id = 'e-1'").run();
      expect(revision('expenseTracker')).toBe(5);
      db.exec(`INSERT INTO calculator_inputs (user_id) VALUES (1);
        INSERT INTO asset_class_targets (user_id, asset_class, target_mode, target_percent) VALUES (1, 'STOCKS', 'PERCENTAGE', 70);
        INSERT INTO user_settings (user_id, language) VALUES (1, 'fr');
        INSERT INTO net_worth_years (user_id, year) VALUES (1, 2025);`);
      expect([revision('calculator'), revision('assetAllocation'), revision('settings'), revision('netWorth')]).toEqual([1, 1, 1, 1]);
      expect(db.prepare('SELECT fire_type, lean_expense_multiplier, fat_expense_multiplier, barista_annual_income, coast_target_age FROM calculator_inputs').get())
        .toEqual({ fire_type: 'standard', lean_expense_multiplier: 0.7, fat_expense_multiplier: 2, barista_annual_income: 20000, coast_target_age: 65 });
      expect(() => db.prepare("UPDATE calculator_inputs SET fire_type = 'turbo'").run()).toThrow();
      expect(() => db.prepare("UPDATE user_settings SET language = 'xx'").run()).toThrow();
      expect(() => db.prepare("INSERT INTO asset_class_targets (user_id, asset_class, target_mode) VALUES (1, 'ETF', 'OFF')").run()).toThrow();

      db.exec(`INSERT INTO assets (user_id, external_id, name, asset_class, current_value, position) VALUES (1, 'a-1', 'Synthetic', 'STOCKS', 100, 0);
        INSERT INTO users (id, email) VALUES (2, 'second@synthetic.invalid');
        INSERT INTO assets (user_id, external_id, name, asset_class) VALUES (2, 'a-2', 'Synthetic', 'BONDS');`);
      db.prepare('DELETE FROM users WHERE id = 2').run();
      expect(db.prepare('SELECT COUNT(*) AS n FROM sync_domains WHERE user_id = 2').get()).toEqual({ n: 0 });

      expect(rollbackMigrations(db, path, 1).migrationsRolledBack).toEqual(['0010_backend_sync']);
      for (const table of ['sync_meta', 'sync_domains', 'asset_class_targets']) expect(tableExists(db, table)).toBe(false);
      expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT * FROM assets WHERE external_id = 'a-1'").get()).toMatchObject({ current_value: 100 });
      expect(db.prepare("SELECT * FROM assets WHERE external_id = 'a-1'").get()).not.toHaveProperty('position');
      expect(db.prepare('SELECT * FROM calculator_inputs').get()).not.toHaveProperty('fire_type');
      expect(db.prepare('SELECT * FROM user_settings').get()).not.toHaveProperty('language');
      expect(runMigrations(db, path).migrationsApplied).toEqual(['0010_backend_sync']);
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
