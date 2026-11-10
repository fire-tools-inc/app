-- Rolling back deletes stored receipt images, but does not alter financial entries.
DROP TABLE IF EXISTS receipts;
