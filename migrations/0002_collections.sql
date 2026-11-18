-- Monthly subscription payments. A payment is an ordinary delegate_receipt
-- transaction with a `period`, so it flows into summaries and closings unchanged.
-- subscriber_year keeps 12 paid flags in one row: a register page costs one extra
-- row per subscriber instead of up to twelve. WITHOUT ROWID stores the row inside
-- its primary key, so a lookup reads one row and not an index entry plus a row.

ALTER TABLE subscribers ADD COLUMN monthly_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_key TEXT;
ALTER TABLE transactions ADD COLUMN period TEXT;
ALTER TABLE transactions_archive ADD COLUMN period TEXT;

CREATE UNIQUE INDEX uq_tx_subscriber_period ON transactions(subscriber_id, period)
  WHERE deleted_at IS NULL AND period IS NOT NULL;

CREATE TABLE subscriber_year (
  subscriber_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  paid_mask INTEGER NOT NULL DEFAULT 0,
  paid_total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subscriber_id, year)
) WITHOUT ROWID;

-- delegate_id 0 holds the organisation-wide total.
CREATE TABLE delegate_period (
  delegate_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  paid_count INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (delegate_id, period)
) WITHOUT ROWID;

CREATE TRIGGER trg_tx_period_insert AFTER INSERT ON transactions
WHEN NEW.period IS NOT NULL
BEGIN
  INSERT INTO subscriber_year (subscriber_id, year, paid_mask, paid_total)
  VALUES (NEW.subscriber_id, CAST(substr(NEW.period, 1, 4) AS INTEGER),
    1 << (CAST(substr(NEW.period, 6, 2) AS INTEGER) - 1), NEW.amount)
  ON CONFLICT(subscriber_id, year) DO UPDATE SET
    paid_mask = paid_mask | excluded.paid_mask,
    paid_total = paid_total + excluded.paid_total;

  INSERT INTO delegate_period (delegate_id, period, paid_count, paid_amount)
  VALUES (0, NEW.period, 1, NEW.amount)
  ON CONFLICT(delegate_id, period) DO UPDATE SET
    paid_count = paid_count + 1,
    paid_amount = paid_amount + excluded.paid_amount;

  INSERT INTO delegate_period (delegate_id, period, paid_count, paid_amount)
  SELECT NEW.delegate_id, NEW.period, 1, NEW.amount
  WHERE NEW.delegate_id IS NOT NULL
  ON CONFLICT(delegate_id, period) DO UPDATE SET
    paid_count = paid_count + 1,
    paid_amount = paid_amount + excluded.paid_amount;
END;

CREATE TRIGGER trg_tx_period_soft_delete AFTER UPDATE OF deleted_at ON transactions
WHEN OLD.period IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE subscriber_year SET
    paid_mask = paid_mask & ~(1 << (CAST(substr(OLD.period, 6, 2) AS INTEGER) - 1)),
    paid_total = paid_total - OLD.amount
  WHERE subscriber_id = OLD.subscriber_id AND year = CAST(substr(OLD.period, 1, 4) AS INTEGER);

  UPDATE delegate_period SET
    paid_count = paid_count - 1,
    paid_amount = paid_amount - OLD.amount
  WHERE period = OLD.period AND (delegate_id = 0 OR delegate_id = OLD.delegate_id);
END;
