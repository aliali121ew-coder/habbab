-- Donations (المساعدات / التبرعات الواردة): what donors give the foundation — people inside the
-- foundation (members, staff) or outside it — either money (cash) or goods (in kind).
-- Cash donations feed the «التبرعات المالية» figure on the money pages.
CREATE TABLE donations (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  donor_name TEXT NOT NULL,
  -- internal: from within the foundation; external: anyone else.
  donor_type TEXT NOT NULL DEFAULT 'external' CHECK (donor_type IN ('internal', 'external')),
  donor_phone TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'in_kind')),
  -- cash: the amount; in kind: its estimated value, when known.
  amount INTEGER CHECK (amount IS NULL OR amount > 0),
  -- in kind: what was given, how many and in what unit (سلة، كغم، قطعة …).
  item TEXT,
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT,
  -- What the donation is for (عامة، العوائل، المرضى …).
  purpose TEXT,
  received_on TEXT NOT NULL,
  month TEXT NOT NULL,
  receipt_no TEXT,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  deleted_at TEXT,
  CHECK (kind = 'in_kind' OR amount IS NOT NULL),
  CHECK (kind = 'cash' OR item IS NOT NULL)
);
CREATE INDEX idx_donations_month ON donations(foundation_id, month) WHERE deleted_at IS NULL;
