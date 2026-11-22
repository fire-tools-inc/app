-- Expenses paid several times at the same price: amount = unit_amount × quantity.
ALTER TABLE expense_entries ADD COLUMN unit_amount REAL CHECK (unit_amount IS NULL OR unit_amount > 0);
ALTER TABLE expense_entries ADD COLUMN quantity REAL CHECK (quantity IS NULL OR quantity > 0);
