-- Removes planning metadata/linkage only; recorded financial transactions survive.
DROP INDEX idx_expense_scheduled_occurrence;
DROP INDEX idx_income_scheduled_occurrence;
ALTER TABLE expense_entries DROP COLUMN scheduled_date;
ALTER TABLE expense_entries DROP COLUMN schedule_id;
ALTER TABLE income_entries DROP COLUMN scheduled_date;
ALTER TABLE income_entries DROP COLUMN schedule_id;
DROP TABLE expense_planning;
