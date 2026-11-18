-- The foundation's monthly spending, entry by entry, under the seventeen headings of the
-- paper sheet «جدول صرفيات لشهر». A heading with several beneficiaries (patients, operations,
-- appliances) simply has several entries, each naming its person in `details`.
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN (
    'cash_gift', 'medicine', 'foundation_balance', 'patient_aid', 'salaries', 'building_aid',
    'operation_aid', 'marriage_aid', 'food', 'general_aid', 'cattle', 'foundation_costs',
    'appliances', 'prayer_fasting', 'religious_events', 'appliance_repair', 'other_aid'
  )),
  amount INTEGER NOT NULL CHECK (amount > 0),
  -- YYYY-MM, the sheet the entry belongs to; spent_on is the day it was paid.
  month TEXT NOT NULL,
  spent_on TEXT NOT NULL,
  details TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX idx_expenses_month ON expenses(month, category, id) WHERE deleted_at IS NULL;
