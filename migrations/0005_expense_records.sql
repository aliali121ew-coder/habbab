-- Every expense names who received it: a subscriber from the register when there is one
-- (beneficiary_id), always with the name as written (beneficiary_name). Entries made before
-- this migration keep both empty.
ALTER TABLE expenses ADD COLUMN beneficiary_id INTEGER REFERENCES subscribers(id);
ALTER TABLE expenses ADD COLUMN beneficiary_name TEXT;

-- Receipts and invoices behind an expense, stored encrypted in R2 under random keys.
CREATE TABLE expense_files (
  id INTEGER PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  file_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_expense_files_expense ON expense_files(expense_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id, id);
