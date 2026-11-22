-- Restores the retired FEES and HOLIDAYS categories from the backup recorded
-- by the up migration. Only rows that still hold the value written by the
-- migration are restored: expenses, budgets, planning documents and import
-- drafts edited after the merge keep their current (merged) categories, and
-- a merged budget whose total changed keeps that total. Overrides are
-- restored unless one already exists for the retired id.

-- Expense rows
UPDATE expense_entries SET category = (
    SELECT b.legacy_value FROM expense_category_merge_backup b
    WHERE b.source_table = 'expense_entries' AND b.user_id = expense_entries.user_id
      AND b.record_key = expense_entries.external_id AND b.merged_value = expense_entries.category)
WHERE EXISTS (
    SELECT 1 FROM expense_category_merge_backup b
    WHERE b.source_table = 'expense_entries' AND b.user_id = expense_entries.user_id
      AND b.record_key = expense_entries.external_id AND b.merged_value = expense_entries.category);

-- Budgets that were renamed in place
UPDATE category_budgets SET category = (
    SELECT b.legacy_value FROM expense_category_merge_backup b
    WHERE b.source_table = 'category_budgets' AND b.target_row_id IS NULL AND b.legacy_row_id = category_budgets.id)
WHERE EXISTS (
    SELECT 1 FROM expense_category_merge_backup b
    WHERE b.source_table = 'category_budgets' AND b.target_row_id IS NULL AND b.legacy_row_id = category_budgets.id
      AND b.user_id = category_budgets.user_id AND b.expense_month_id IS category_budgets.expense_month_id
      AND b.merged_value = category_budgets.category AND b.amount = category_budgets.monthly_budget);

-- Budgets that were added to (or dropped beside) a surviving budget that is
-- unchanged since the merge: put the retired budget back and restore the
-- surviving budget's original amount and currency.
CREATE TEMP TABLE expense_category_restorable_budgets AS
SELECT b.target_row_id AS target_row_id
FROM expense_category_merge_backup b
JOIN category_budgets c ON c.id = b.target_row_id
WHERE b.source_table = 'category_budgets' AND b.target_row_id IS NOT NULL
  AND c.user_id = b.user_id AND c.expense_month_id IS b.expense_month_id
  AND c.category = b.merged_value AND c.monthly_budget = b.merged_amount
GROUP BY b.target_row_id;

INSERT INTO category_budgets (user_id, expense_month_id, category, monthly_budget, currency)
SELECT b.user_id, b.expense_month_id, b.legacy_value, b.amount, b.currency
FROM expense_category_merge_backup b
WHERE b.source_table = 'category_budgets'
  AND b.target_row_id IN (SELECT target_row_id FROM expense_category_restorable_budgets)
  AND NOT EXISTS (
    SELECT 1 FROM category_budgets c
    WHERE c.user_id = b.user_id AND c.expense_month_id IS b.expense_month_id AND c.category = b.legacy_value);

UPDATE category_budgets SET
    monthly_budget = (SELECT MAX(b.target_amount) FROM expense_category_merge_backup b
        WHERE b.source_table = 'category_budgets' AND b.target_row_id = category_budgets.id),
    currency = (SELECT MAX(b.target_currency) FROM expense_category_merge_backup b
        WHERE b.source_table = 'category_budgets' AND b.target_row_id = category_budgets.id)
WHERE id IN (SELECT target_row_id FROM expense_category_restorable_budgets);
DROP TABLE expense_category_restorable_budgets;

-- Built-in category overrides
INSERT INTO category_overrides (user_id, category_id, name, icon, color)
SELECT b.user_id, b.legacy_value, b.name, b.icon, b.color
FROM expense_category_merge_backup b
WHERE b.source_table = 'category_overrides'
  AND NOT EXISTS (SELECT 1 FROM category_overrides o WHERE o.user_id = b.user_id AND o.category_id = b.legacy_value);

-- Planning documents and import drafts unchanged since the merge
UPDATE expense_planning SET payload_json = (
    SELECT b.legacy_value FROM expense_category_merge_backup b
    WHERE b.source_table = 'expense_planning' AND b.user_id = expense_planning.user_id)
WHERE EXISTS (
    SELECT 1 FROM expense_category_merge_backup b
    WHERE b.source_table = 'expense_planning' AND b.user_id = expense_planning.user_id
      AND b.merged_value = expense_planning.payload_json);
UPDATE pdf_imports SET drafts_json = (
    SELECT b.legacy_value FROM expense_category_merge_backup b
    WHERE b.source_table = 'pdf_imports' AND b.record_key = CAST(pdf_imports.id AS TEXT))
WHERE EXISTS (
    SELECT 1 FROM expense_category_merge_backup b
    WHERE b.source_table = 'pdf_imports' AND b.record_key = CAST(pdf_imports.id AS TEXT)
      AND b.merged_value = pdf_imports.drafts_json);

DROP TABLE expense_category_merge_backup;
