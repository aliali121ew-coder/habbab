-- Charity boxes (صناديق الصدقات): a box handed to a person — one of the foundation's delegates or
-- anyone else (a shop, a mosque, a family) — and the money collected from it, month by month.
CREATE TABLE charity_boxes (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  -- The number written on the box, if the foundation numbers them.
  code TEXT,
  holder_name TEXT NOT NULL,
  -- Set when the holder is one of the foundation's delegates (holder_name then copies their name).
  delegate_id INTEGER REFERENCES users(id),
  phone TEXT,
  -- العمل: where the box sits or what the holder does (shop, pharmacy, mosque …).
  work TEXT,
  address TEXT,
  delivered_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_boxes_foundation ON charity_boxes(foundation_id, id) WHERE deleted_at IS NULL;

-- One opening of a box: the amount found and the day it was collected; month is YYYY-MM of that day.
CREATE TABLE charity_box_collections (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  box_id INTEGER NOT NULL REFERENCES charity_boxes(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  month TEXT NOT NULL,
  collected_on TEXT NOT NULL,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_boxcol_month ON charity_box_collections(foundation_id, month) WHERE deleted_at IS NULL;
CREATE INDEX idx_boxcol_box ON charity_box_collections(box_id, collected_on DESC) WHERE deleted_at IS NULL;
