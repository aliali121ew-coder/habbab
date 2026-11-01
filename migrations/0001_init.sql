-- Summaries are maintained by triggers: they run inside the same atomic write,
-- so no route can forget them and a failed write can never leave them drifted.
-- Every index costs one extra row written per insert, so only indexes that a
-- real query uses exist, and hot ones are partial (live rows only).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','accountant','delegate','health')),
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_users_role ON users(role, active);

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  phone TEXT,
  national_id_enc TEXT,
  national_id_bidx TEXT,
  national_id_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive','deceased')),
  death_date TEXT,
  delegate_id INTEGER REFERENCES users(id),
  family_size INTEGER NOT NULL DEFAULT 1,
  address TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_sub_status_id ON subscribers(status, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_delegate_status_id ON subscribers(delegate_id, status, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_name ON subscribers(name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_delegate_name ON subscribers(delegate_id, name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_phone ON subscribers(phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE UNIQUE INDEX uq_sub_national ON subscribers(national_id_bidx)
  WHERE deleted_at IS NULL AND national_id_bidx IS NOT NULL;

CREATE TABLE programs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO programs (name) VALUES ('الأيتام'), ('الكفالة');

-- subscriber_name / delegate_id are copied here so a program page reads 30 rows, not 60.
CREATE TABLE subscriber_programs (
  id INTEGER PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id),
  program_id INTEGER NOT NULL REFERENCES programs(id),
  subscriber_name TEXT NOT NULL,
  delegate_id INTEGER,
  monthly_amount INTEGER NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  started_at TEXT NOT NULL DEFAULT (date('now')),
  ended_at TEXT
);
CREATE INDEX idx_sp_program_id ON subscriber_programs(program_id, id DESC) WHERE ended_at IS NULL;
CREATE INDEX idx_sp_delegate_program_id ON subscriber_programs(delegate_id, program_id, id DESC) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX uq_sp_active ON subscriber_programs(subscriber_id, program_id) WHERE ended_at IS NULL;

-- One table for all money movement. Rows are immutable: a correction is a
-- soft delete plus a new entry, which keeps the audit trail honest.
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('general_aid','monthly_aid','program_aid','delegate_receipt')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  month TEXT NOT NULL,
  tx_date TEXT NOT NULL,
  subscriber_id INTEGER REFERENCES subscribers(id),
  party_name TEXT NOT NULL,
  delegate_id INTEGER REFERENCES users(id),
  program_id INTEGER REFERENCES programs(id),
  receipt_no TEXT,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  deleted_by INTEGER
);
CREATE INDEX idx_tx_type_month_id ON transactions(type, month, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_delegate_type_id ON transactions(delegate_id, type, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_subscriber_id ON transactions(subscriber_id, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE transactions_archive (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  month TEXT NOT NULL,
  tx_date TEXT NOT NULL,
  subscriber_id INTEGER,
  party_name TEXT NOT NULL,
  delegate_id INTEGER,
  program_id INTEGER,
  receipt_no TEXT,
  note TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER
);
CREATE INDEX idx_txa_type_month_id ON transactions_archive(type, month, id DESC);

CREATE TABLE prescriptions (
  id INTEGER PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id),
  patient_name TEXT NOT NULL,
  rx_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dispensed','rejected')),
  details_enc TEXT NOT NULL,
  image_key TEXT,
  thumb_key TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_rx_status_id ON prescriptions(status, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_rx_subscriber_id ON prescriptions(subscriber_id, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE prescriptions_archive (
  id INTEGER PRIMARY KEY,
  subscriber_id INTEGER NOT NULL,
  patient_name TEXT NOT NULL,
  rx_date TEXT NOT NULL,
  status TEXT NOT NULL,
  details_enc TEXT NOT NULL,
  image_key TEXT,
  thumb_key TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE monthly_closings (
  month TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  opening_balance INTEGER NOT NULL,
  total_in INTEGER NOT NULL,
  total_out INTEGER NOT NULL,
  closing_balance INTEGER NOT NULL,
  tx_count INTEGER NOT NULL,
  closed_by INTEGER NOT NULL REFERENCES users(id),
  closed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_user_id ON audit_log(user_id, id DESC);

CREATE TABLE audit_log_archive (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE stats_totals (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stats_daily (
  day TEXT PRIMARY KEY,
  new_subscribers INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  total_in INTEGER NOT NULL DEFAULT 0,
  total_out INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stats_monthly (
  month TEXT PRIMARY KEY,
  general_aid INTEGER NOT NULL DEFAULT 0,
  monthly_aid INTEGER NOT NULL DEFAULT 0,
  program_aid INTEGER NOT NULL DEFAULT 0,
  delegate_receipt INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE delegate_totals (
  delegate_id INTEGER PRIMARY KEY,
  subs_alive INTEGER NOT NULL DEFAULT 0,
  subs_deceased INTEGER NOT NULL DEFAULT 0,
  received_total INTEGER NOT NULL DEFAULT 0,
  disbursed_total INTEGER NOT NULL DEFAULT 0
);

-- Closed months reject writes at the database level, whatever the code path.
CREATE TRIGGER trg_tx_closed_insert BEFORE INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM monthly_closings WHERE month = NEW.month AND status = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'MONTH_CLOSED');
END;

CREATE TRIGGER trg_tx_closed_update BEFORE UPDATE OF deleted_at ON transactions
WHEN EXISTS (SELECT 1 FROM monthly_closings WHERE month = OLD.month AND status = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'MONTH_CLOSED');
END;

CREATE TRIGGER trg_tx_insert AFTER INSERT ON transactions
BEGIN
  INSERT INTO stats_monthly (month, general_aid, monthly_aid, program_aid, delegate_receipt, tx_count)
  VALUES (NEW.month,
    CASE NEW.type WHEN 'general_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'monthly_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'program_aid' THEN NEW.amount ELSE 0 END,
    CASE NEW.type WHEN 'delegate_receipt' THEN NEW.amount ELSE 0 END,
    1)
  ON CONFLICT(month) DO UPDATE SET
    general_aid = general_aid + excluded.general_aid,
    monthly_aid = monthly_aid + excluded.monthly_aid,
    program_aid = program_aid + excluded.program_aid,
    delegate_receipt = delegate_receipt + excluded.delegate_receipt,
    tx_count = tx_count + 1;

  INSERT INTO stats_daily (day, tx_count, total_in, total_out)
  VALUES (NEW.tx_date, 1,
    CASE WHEN NEW.type = 'delegate_receipt' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.type <> 'delegate_receipt' THEN NEW.amount ELSE 0 END)
  ON CONFLICT(day) DO UPDATE SET
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
  WHERE month = OLD.month;

  UPDATE stats_daily SET
    tx_count = tx_count - 1,
    total_in = total_in - CASE WHEN OLD.type = 'delegate_receipt' THEN OLD.amount ELSE 0 END,
    total_out = total_out - CASE WHEN OLD.type <> 'delegate_receipt' THEN OLD.amount ELSE 0 END
  WHERE day = OLD.tx_date;

  UPDATE delegate_totals SET
    received_total = received_total - CASE WHEN OLD.type = 'delegate_receipt' THEN OLD.amount ELSE 0 END,
    disbursed_total = disbursed_total - CASE WHEN OLD.type <> 'delegate_receipt' THEN OLD.amount ELSE 0 END
  WHERE delegate_id = OLD.delegate_id;
END;

CREATE TRIGGER trg_sub_insert AFTER INSERT ON subscribers
BEGIN
  INSERT INTO stats_totals (key, value) VALUES ('subs_' || NEW.status, 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;

  INSERT INTO stats_daily (day, new_subscribers) VALUES (date(NEW.created_at), 1)
  ON CONFLICT(day) DO UPDATE SET new_subscribers = new_subscribers + 1;

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
  WHERE key = 'subs_' || OLD.status AND OLD.deleted_at IS NULL;

  INSERT INTO stats_totals (key, value)
  SELECT 'subs_' || NEW.status, 1 WHERE NEW.deleted_at IS NULL
  ON CONFLICT(key) DO UPDATE SET value = value + 1;

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
  INSERT INTO stats_totals (key, value) VALUES ('program_' || NEW.program_id, 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER trg_sp_end AFTER UPDATE OF ended_at ON subscriber_programs
WHEN OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
BEGIN
  UPDATE stats_totals SET value = value - 1 WHERE key = 'program_' || OLD.program_id;
END;

CREATE TRIGGER trg_rx_insert AFTER INSERT ON prescriptions
BEGIN
  INSERT INTO stats_totals (key, value) VALUES ('rx_total', 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;

  INSERT INTO stats_totals (key, value) SELECT 'rx_pending', 1 WHERE NEW.status = 'pending'
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER trg_rx_update AFTER UPDATE OF status, deleted_at ON prescriptions
WHEN OLD.status <> NEW.status OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  UPDATE stats_totals SET value = value - 1
  WHERE key = 'rx_total' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL;

  UPDATE stats_totals SET value = value - 1
  WHERE key = 'rx_pending' AND OLD.status = 'pending' AND OLD.deleted_at IS NULL;

  INSERT INTO stats_totals (key, value)
  SELECT 'rx_pending', 1 WHERE NEW.status = 'pending' AND NEW.deleted_at IS NULL
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
END;
