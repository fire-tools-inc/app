-- Removes the price × times breakdown; every expense keeps its total amount.
ALTER TABLE expense_entries DROP COLUMN quantity;
ALTER TABLE expense_entries DROP COLUMN unit_amount;
