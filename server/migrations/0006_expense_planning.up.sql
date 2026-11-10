CREATE TABLE expense_planning (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE expense_entries ADD COLUMN schedule_id TEXT;
ALTER TABLE expense_entries ADD COLUMN scheduled_date TEXT
    CHECK ((schedule_id IS NULL AND scheduled_date IS NULL)
        OR (schedule_id IS NOT NULL AND scheduled_date IS NOT NULL));
ALTER TABLE income_entries ADD COLUMN schedule_id TEXT;
ALTER TABLE income_entries ADD COLUMN scheduled_date TEXT
    CHECK ((schedule_id IS NULL AND scheduled_date IS NULL)
        OR (schedule_id IS NOT NULL AND scheduled_date IS NOT NULL));
CREATE UNIQUE INDEX idx_expense_scheduled_occurrence
    ON expense_entries (user_id, schedule_id, scheduled_date) WHERE schedule_id IS NOT NULL;
CREATE UNIQUE INDEX idx_income_scheduled_occurrence
    ON income_entries (user_id, schedule_id, scheduled_date) WHERE schedule_id IS NOT NULL;
