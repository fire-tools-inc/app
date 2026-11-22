-- Merges retired built-in expense categories into the categories that replace
-- them: FEES -> BUSINESS ("Business & Fees") and HOLIDAYS -> TRAVEL
-- ("Travel & Holidays"). When a month (or the global list) has a budget for
-- both ids, the amounts are added together. Overrides of the retired ids are
-- removed; the surviving category keeps its own override.
--
-- Every changed value is recorded in expense_category_merge_backup so the
-- rollback can restore rows that have not been edited since this migration.
CREATE TABLE expense_category_merge_backup (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_table     TEXT    NOT NULL,
    record_key       TEXT,      -- expense external_id or pdf_imports id
    legacy_row_id    INTEGER,   -- category_budgets row that held the retired id
    expense_month_id INTEGER,   -- budget month (NULL for global budgets)
    legacy_value     TEXT    NOT NULL,  -- retired category id or original JSON
    merged_value     TEXT,              -- category id or JSON written here
    amount           REAL,      -- retired budget amount
    currency         TEXT,      -- retired budget currency
    target_row_id    INTEGER,   -- surviving budget the amount was merged into
    target_amount    REAL,      -- surviving budget before the merge
    target_currency  TEXT,
    merged_amount    REAL,      -- surviving budget after the merge
    summed           INTEGER NOT NULL DEFAULT 0 CHECK (summed IN (0, 1)),
    name             TEXT,      -- removed override fields
    icon             TEXT,
    color            TEXT
);

-- Expense rows
INSERT INTO expense_category_merge_backup (user_id, source_table, record_key, legacy_value, merged_value)
SELECT user_id, 'expense_entries', external_id, category,
       CASE category WHEN 'FEES' THEN 'BUSINESS' ELSE 'TRAVEL' END
FROM expense_entries WHERE category IN ('FEES', 'HOLIDAYS');
UPDATE expense_entries SET category = CASE category WHEN 'FEES' THEN 'BUSINESS' ELSE 'TRAVEL' END
WHERE category IN ('FEES', 'HOLIDAYS');

-- Month and global budgets
INSERT INTO expense_category_merge_backup (
    user_id, source_table, legacy_row_id, expense_month_id, legacy_value, merged_value, amount, currency,
    target_row_id, target_amount, target_currency, summed)
SELECT l.user_id, 'category_budgets', l.id, l.expense_month_id, l.category,
       CASE l.category WHEN 'FEES' THEN 'BUSINESS' ELSE 'TRAVEL' END,
       l.monthly_budget, l.currency, t.id, t.monthly_budget, t.currency,
       CASE WHEN t.id IS NOT NULL AND (l.currency IS NULL OR t.currency IS NULL OR l.currency = t.currency)
            THEN 1 ELSE 0 END
FROM category_budgets l
LEFT JOIN category_budgets t ON t.id = (
    SELECT MIN(x.id) FROM category_budgets x
    WHERE x.user_id = l.user_id AND x.expense_month_id IS l.expense_month_id
      AND x.category = CASE l.category WHEN 'FEES' THEN 'BUSINESS' ELSE 'TRAVEL' END)
WHERE l.category IN ('FEES', 'HOLIDAYS');

UPDATE category_budgets SET
    monthly_budget = monthly_budget + (
        SELECT SUM(b.amount) FROM expense_category_merge_backup b
        WHERE b.source_table = 'category_budgets' AND b.summed = 1 AND b.target_row_id = category_budgets.id),
    currency = COALESCE(currency, (
        SELECT MAX(b.currency) FROM expense_category_merge_backup b
        WHERE b.source_table = 'category_budgets' AND b.summed = 1 AND b.target_row_id = category_budgets.id))
WHERE id IN (
    SELECT target_row_id FROM expense_category_merge_backup
    WHERE source_table = 'category_budgets' AND summed = 1);

UPDATE expense_category_merge_backup SET merged_amount = (
    SELECT c.monthly_budget FROM category_budgets c WHERE c.id = expense_category_merge_backup.target_row_id)
WHERE source_table = 'category_budgets' AND target_row_id IS NOT NULL;

-- A retired budget whose currency differs from the surviving one cannot be
-- added to it; it is removed here and kept in the backup table.
DELETE FROM category_budgets WHERE id IN (
    SELECT legacy_row_id FROM expense_category_merge_backup
    WHERE source_table = 'category_budgets' AND target_row_id IS NOT NULL);
UPDATE category_budgets SET category = CASE category WHEN 'FEES' THEN 'BUSINESS' ELSE 'TRAVEL' END
WHERE category IN ('FEES', 'HOLIDAYS');

-- Built-in category overrides
INSERT INTO expense_category_merge_backup (user_id, source_table, legacy_value, name, icon, color)
SELECT user_id, 'category_overrides', category_id, name, icon, color
FROM category_overrides WHERE category_id IN ('FEES', 'HOLIDAYS');
DELETE FROM category_overrides WHERE category_id IN ('FEES', 'HOLIDAYS');

-- Planning schedules and import rules (compact JSON written by the API)
INSERT INTO expense_category_merge_backup (user_id, source_table, legacy_value)
SELECT user_id, 'expense_planning', payload_json FROM expense_planning
WHERE instr(payload_json, '"category":"FEES"') > 0 OR instr(payload_json, '"category":"HOLIDAYS"') > 0;
UPDATE expense_planning SET payload_json = replace(replace(payload_json,
    '"category":"FEES"', '"category":"BUSINESS"'), '"category":"HOLIDAYS"', '"category":"TRAVEL"')
WHERE user_id IN (SELECT user_id FROM expense_category_merge_backup WHERE source_table = 'expense_planning');
UPDATE expense_category_merge_backup SET merged_value = (
    SELECT p.payload_json FROM expense_planning p WHERE p.user_id = expense_category_merge_backup.user_id)
WHERE source_table = 'expense_planning';

-- Unfinished document import drafts
INSERT INTO expense_category_merge_backup (user_id, source_table, record_key, legacy_value)
SELECT user_id, 'pdf_imports', CAST(id AS TEXT), drafts_json FROM pdf_imports
WHERE instr(drafts_json, '"suggestedCategory":"FEES"') > 0 OR instr(drafts_json, '"suggestedCategory":"HOLIDAYS"') > 0;
UPDATE pdf_imports SET drafts_json = replace(replace(drafts_json,
    '"suggestedCategory":"FEES"', '"suggestedCategory":"BUSINESS"'),
    '"suggestedCategory":"HOLIDAYS"', '"suggestedCategory":"TRAVEL"')
WHERE CAST(id AS TEXT) IN (SELECT record_key FROM expense_category_merge_backup WHERE source_table = 'pdf_imports');
UPDATE expense_category_merge_backup SET merged_value = (
    SELECT p.drafts_json FROM pdf_imports p WHERE CAST(p.id AS TEXT) = expense_category_merge_backup.record_key)
WHERE source_table = 'pdf_imports';
