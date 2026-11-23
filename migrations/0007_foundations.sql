-- Many foundations on one app (design: .claude/design/multi-foundation.md, phase 1).
-- Every row belongs to a foundation. Everything that exists today becomes foundation 1,
-- «مؤسسة أحباب الحسين الثقافية الخيرية», so nothing changes for current users.
-- Isolation is enforced in the routes (foundation_id from the session, never the request);
-- the summaries below are kept per foundation by the triggers.

PRAGMA defer_foreign_keys = true;

CREATE TABLE foundations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- JSON array of enabled features; NULL = all (phase 2 fills this per foundation).
  features TEXT,
  logo_key TEXT,
  stamp_key TEXT,
  signature_key TEXT,
  signature2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO foundations (id, name) VALUES (1, 'مؤسسة أحباب الحسين الثقافية الخيرية');

-- Old triggers go first: they name the tables rebuilt below.
DROP TRIGGER trg_tx_closed_insert;
DROP TRIGGER trg_tx_closed_update;
DROP TRIGGER trg_tx_insert;
DROP TRIGGER trg_tx_soft_delete;
DROP TRIGGER trg_sub_insert;
DROP TRIGGER trg_sub_update;
DROP TRIGGER trg_sp_insert;
DROP TRIGGER trg_sp_end;
DROP TRIGGER trg_rx_insert;
DROP TRIGGER trg_rx_update;
DROP TRIGGER trg_tx_period_insert;
DROP TRIGGER trg_tx_period_soft_delete;

-- ── foundation_id on every data table (existing rows → 1) ──────────────────────────────
ALTER TABLE users ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscribers ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscriber_programs ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions_archive ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE prescriptions ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE prescriptions_archive ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE audit_log ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE audit_log_archive ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expense_files ADD COLUMN foundation_id INTEGER NOT NULL DEFAULT 1;

-- ── programs: names are unique per foundation, not across the app ─────────────────────
CREATE TABLE programs_new (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (foundation_id, name)
);
INSERT INTO programs_new (id, foundation_id, name, active) SELECT id, 1, name, active FROM programs;
DROP TABLE programs;
ALTER TABLE programs_new RENAME TO programs;

-- ── monthly closings: one per foundation per month ──────────────────────────────────────
CREATE TABLE monthly_closings_new (
  foundation_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  opening_balance INTEGER NOT NULL,
  total_in INTEGER NOT NULL,
  total_out INTEGER NOT NULL,
  closing_balance INTEGER NOT NULL,
  tx_count INTEGER NOT NULL,
  closed_by INTEGER NOT NULL REFERENCES users(id),
  closed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (foundation_id, month)
) WITHOUT ROWID;
INSERT INTO monthly_closings_new SELECT 1, month, status, opening_balance, total_in, total_out,
  closing_balance, tx_count, closed_by, closed_at FROM monthly_closings;
DROP TABLE monthly_closings;
ALTER TABLE monthly_closings_new RENAME TO monthly_closings;

-- ── summary tables, per foundation ─────────────────────────────────────────────────────
CREATE TABLE stats_totals_new (
  foundation_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (foundation_id, key)
) WITHOUT ROWID;
INSERT INTO stats_totals_new SELECT 1, key, value FROM stats_totals;
DROP TABLE stats_totals;
ALTER TABLE stats_totals_new RENAME TO stats_totals;

CREATE TABLE stats_daily_new (
  foundation_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  new_subscribers INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  total_in INTEGER NOT NULL DEFAULT 0,
  total_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (foundation_id, day)
) WITHOUT ROWID;
INSERT INTO stats_daily_new SELECT 1, day, new_subscribers, tx_count, total_in, total_out FROM stats_daily;
DROP TABLE stats_daily;
ALTER TABLE stats_daily_new RENAME TO stats_daily;

CREATE TABLE stats_monthly_new (
  foundation_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  general_aid INTEGER NOT NULL DEFAULT 0,
  monthly_aid INTEGER NOT NULL DEFAULT 0,
  program_aid INTEGER NOT NULL DEFAULT 0,
  delegate_receipt INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (foundation_id, month)
) WITHOUT ROWID;
INSERT INTO stats_monthly_new SELECT 1, month, general_aid, monthly_aid, program_aid, delegate_receipt, tx_count FROM stats_monthly;
DROP TABLE stats_monthly;
ALTER TABLE stats_monthly_new RENAME TO stats_monthly;

-- delegate_id 0 holds each foundation's own total.
CREATE TABLE delegate_period_new (
  foundation_id INTEGER NOT NULL,
  delegate_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  paid_count INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (foundation_id, delegate_id, period)
) WITHOUT ROWID;
INSERT INTO delegate_period_new SELECT 1, delegate_id, period, paid_count, paid_amount FROM delegate_period;
DROP TABLE delegate_period;
ALTER TABLE delegate_period_new RENAME TO delegate_period;

-- delegate_totals and subscriber_year stay keyed by delegate / subscriber: each belongs to one foundation.

-- ── indexes lead with the foundation ───────────────────────────────────────────────────
DROP INDEX idx_users_role;
CREATE INDEX idx_users_role ON users(foundation_id, role, active);

DROP INDEX idx_sub_status_id;
DROP INDEX idx_sub_name;
DROP INDEX idx_sub_phone;
DROP INDEX uq_sub_national;
CREATE INDEX idx_sub_status_id ON subscribers(foundation_id, status, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_name ON subscribers(foundation_id, name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_phone ON subscribers(foundation_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE UNIQUE INDEX uq_sub_national ON subscribers(foundation_id, national_id_bidx)
  WHERE deleted_at IS NULL AND national_id_bidx IS NOT NULL;
-- idx_sub_delegate_* stay: a delegate belongs to one foundation.

DROP INDEX idx_tx_type_month_id;
CREATE INDEX idx_tx_type_month_id ON transactions(foundation_id, type, month, id DESC) WHERE deleted_at IS NULL;
DROP INDEX idx_txa_type_month_id;
CREATE INDEX idx_txa_type_month_id ON transactions_archive(foundation_id, type, month, id DESC);

DROP INDEX idx_rx_status_id;
CREATE INDEX idx_rx_status_id ON prescriptions(foundation_id, status, id DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_audit_foundation_id ON audit_log(foundation_id, id DESC);

DROP INDEX idx_expenses_month;
CREATE INDEX idx_expenses_month ON expenses(foundation_id, month, category, id) WHERE deleted_at IS NULL;

-- ── triggers, per foundation ───────────────────────────────────────────────────────────
-- Closed months reject writes at the database level, whatever the code path.
CREATE TRIGGER trg_tx_closed_insert BEFORE INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM monthly_closings WHERE foundation_id = NEW.foundation_id AND month = NEW.month AND status = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'MONTH_CLOSED');
END;

CREATE TRIGGER trg_tx_closed_update BEFORE UPDATE OF deleted_at ON transactions
WHEN EXISTS (SELECT 1 FROM monthly_closings WHERE foundation_id = OLD.foundation_id AND month = OLD.month AND status = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'MONTH_CLOSED');
END;

CREATE TRIGGER trg_tx_insert AFTER INSERT ON transactions
BEGIN
  INSERT INTO stats_monthly (foundation_id, month, general_aid, monthly_aid, program_aid, delegate_receipt, tx_count)
  VALUES (NEW.foundation_id, NEW.month,
    CASE NEW.type WHEN 'general_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'monthly_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'program_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'delegate_receipt' THEN NEW.amount ELSE 0 END,
    1)
  ON CONFLICT(foundation_id, month) DO UPDATE SET
    general_aid = general_aid + excluded.general_aid,
    monthly_aid = monthly_aid + excluded.monthly_aid,
    program_aid = program_aid + excluded.program_aid,
    delegate_receipt = delegate_receipt + excluded.delegate_receipt,
    tx_count = tx_count + 1;

  INSERT INTO stats_daily (foundation_id, day, tx_count, total_in, total_out)
  VALUES (NEW.foundation_id, NEW.tx_date, 1,
    CASE WHEN NEW.type = 'delegate_receipt' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.type <> 'delegate_receipt' THEN NEW.amount ELSE 0 END)
  ON CONFLICT(foundation_id, day) DO UPDATE SET
    tx_count = tx_count + 1,
    total_in = total_in + excluded.total_in,
    total_out = total_out + excluded.total_out;

  INSERT INTO delegate_totals (delegate_id, received_total, disbursed_total)
  SELECT NEW.delegate_id,
    CASE WHEN NEW.type = 'delegate_receipt' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.type <> 'delegate_receipt' THEN NEW.amount ELSE 0 END
  WHERE NEW.delegate_id IS NOT NULL
  ON CONFLICT(delegate_id) DO UPDATE SET
    received_total = received_total + excluded.received_total,
    disbursed_total = disbursed_total + excluded.disbursed_total;
END;

CREATE TRIGGER trg_tx_soft_delete AFTER UPDATE OF deleted_at ON transactions
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE stats_monthly SET
    general_aid = general_aid - CASE OLD.type WHEN 'general_aid' THEN OLD.amount ELSE 0 END,
    monthly_aid = monthly_aid - CASE OLD.type WHEN 'monthly_aid' THEN OLD.amount ELSE 0 END,
    program_aid = program_aid - CASE OLD.type WHEN 'program_aid' THEN OLD.amount ELSE 0 END,
    delegate_receipt = delegate_receipt - CASE OLD.type WHEN 'delegate_receipt' THEN OLD.amount ELSE 0 END,
    tx_count = tx_count - 1
  WHERE foundation_id = OLD.foundation_id AND month = OLD.month;

  UPDATE stats_daily SET
    tx_count = tx_count - 1,
    total_in = total_in - CASE WHEN OLD.type = 'delegate_receipt' THEN OLD.amount ELSE 0 END,
    total_out = total_out - CASE WHEN OLD.type <> 'delegate_receipt' THEN OLD.amount ELSE 0 END
  WHERE foundation_id = OLD.foundation_id AND day = OLD.tx_date;

  UPDATE delegate_totals SET
    received_total = received_total - CASE WHEN OLD.type = 'delegate_receipt' THEN OLD.amount ELSE 0 END,
    disbursed_total = disbursed_total - CASE WHEN OLD.type <> 'delegate_receipt' THEN OLD.amount ELSE 0 END
  WHERE delegate_id = OLD.delegate_id;
END;

CREATE TRIGGER trg_sub_insert AFTER INSERT ON subscribers
BEGIN
  INSERT INTO stats_totals (foundation_id, key, value) VALUES (NEW.foundation_id, 'subs_' || NEW.status, 1)
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;

  INSERT INTO stats_daily (foundation_id, day, new_subscribers) VALUES (NEW.foundation_id, date(NEW.created_at), 1)
  ON CONFLICT(foundation_id, day) DO UPDATE SET new_subscribers = new_subscribers + 1;

  INSERT INTO delegate_totals (delegate_id, subs_alive, subs_deceased)
  SELECT NEW.delegate_id, NEW.status = 'alive', NEW.status = 'deceased'
  WHERE NEW.delegate_id IS NOT NULL
  ON CONFLICT(delegate_id) DO UPDATE SET
    subs_alive = subs_alive + excluded.subs_alive,
    subs_deceased = subs_deceased + excluded.subs_deceased;
END;

CREATE TRIGGER trg_sub_update AFTER UPDATE OF status, delegate_id, deleted_at ON subscribers
WHEN OLD.status <> NEW.status
  OR OLD.delegate_id IS NOT NEW.delegate_id
  OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  UPDATE stats_totals SET value = value - 1
  WHERE foundation_id = OLD.foundation_id AND key = 'subs_' || OLD.status AND OLD.deleted_at IS NULL;

  INSERT INTO stats_totals (foundation_id, key, value)
  SELECT NEW.foundation_id, 'subs_' || NEW.status, 1 WHERE NEW.deleted_at IS NULL
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;

  UPDATE delegate_totals SET
    subs_alive = subs_alive - (OLD.status = 'alive'),
    subs_deceased = subs_deceased - (OLD.status = 'deceased')
  WHERE delegate_id = OLD.delegate_id AND OLD.deleted_at IS NULL;

  INSERT INTO delegate_totals (delegate_id, subs_alive, subs_deceased)
  SELECT NEW.delegate_id, NEW.status = 'alive', NEW.status = 'deceased'
  WHERE NEW.delegate_id IS NOT NULL AND NEW.deleted_at IS NULL
  ON CONFLICT(delegate_id) DO UPDATE SET
    subs_alive = subs_alive + excluded.subs_alive,
    subs_deceased = subs_deceased + excluded.subs_deceased;
END;

CREATE TRIGGER trg_sp_insert AFTER INSERT ON subscriber_programs
BEGIN
  INSERT INTO stats_totals (foundation_id, key, value) VALUES (NEW.foundation_id, 'program_' || NEW.program_id, 1)
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER trg_sp_end AFTER UPDATE OF ended_at ON subscriber_programs
WHEN OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
BEGIN
  UPDATE stats_totals SET value = value - 1 WHERE foundation_id = OLD.foundation_id AND key = 'program_' || OLD.program_id;
END;

CREATE TRIGGER trg_rx_insert AFTER INSERT ON prescriptions
BEGIN
  INSERT INTO stats_totals (foundation_id, key, value) VALUES (NEW.foundation_id, 'rx_total', 1)
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;

  INSERT INTO stats_totals (foundation_id, key, value) SELECT NEW.foundation_id, 'rx_pending', 1 WHERE NEW.status = 'pending'
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER trg_rx_update AFTER UPDATE OF status, deleted_at ON prescriptions
WHEN OLD.status <> NEW.status OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  UPDATE stats_totals SET value = value - 1
  WHERE foundation_id = OLD.foundation_id AND key = 'rx_total' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL;

  UPDATE stats_totals SET value = value - 1
  WHERE foundation_id = OLD.foundation_id AND key = 'rx_pending' AND OLD.status = 'pending' AND OLD.deleted_at IS NULL;

  INSERT INTO stats_totals (foundation_id, key, value)
  SELECT NEW.foundation_id, 'rx_pending', 1 WHERE NEW.status = 'pending' AND NEW.deleted_at IS NULL
  ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER trg_tx_period_insert AFTER INSERT ON transactions
WHEN NEW.period IS NOT NULL
BEGIN
  INSERT INTO subscriber_year (subscriber_id, year, paid_mask, paid_total)
  VALUES (NEW.subscriber_id, CAST(substr(NEW.period, 1, 4) AS INTEGER),
    1 << (CAST(substr(NEW.period, 6, 2) AS INTEGER) - 1), NEW.amount)
  ON CONFLICT(subscriber_id, year) DO UPDATE SET
    paid_mask = paid_mask | excluded.paid_mask,
    paid_total = paid_total + excluded.paid_total;

  INSERT INTO delegate_period (foundation_id, delegate_id, period, paid_count, paid_amount)
  VALUES (NEW.foundation_id, 0, NEW.period, 1, NEW.amount)
  ON CONFLICT(foundation_id, delegate_id, period) DO UPDATE SET
    paid_count = paid_count + 1,
    paid_amount = paid_amount + excluded.paid_amount;

  INSERT INTO delegate_period (foundation_id, delegate_id, period, paid_count, paid_amount)
  SELECT NEW.foundation_id, NEW.delegate_id, NEW.period, 1, NEW.amount
  WHERE NEW.delegate_id IS NOT NULL
  ON CONFLICT(foundation_id, delegate_id, period) DO UPDATE SET
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
  WHERE foundation_id = OLD.foundation_id AND period = OLD.period AND (delegate_id = 0 OR delegate_id = OLD.delegate_id);
END;
