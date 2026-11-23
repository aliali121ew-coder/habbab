-- العوائل المتعففة on the server (design: .claude/design/multi-foundation.md, phase 3).
-- Each foundation keeps its own file on a family (address, members, notes, visits are its own).
-- When two foundations confirm they hold the same family (matched by the head's four-part
-- name), their files share a link_id, and each sees the other's aid: type, amount, date and
-- foundation name only.

CREATE TABLE families (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  file_no TEXT NOT NULL,
  name TEXT NOT NULL,                 -- عائلة الأرملة زينب كاظم الربيعي
  head_name TEXT NOT NULL,            -- the head's four-part name
  head_norm TEXT NOT NULL,            -- normalised, for matching across foundations
  phone TEXT,
  category TEXT NOT NULL DEFAULT 'intensive' CHECK (category IN ('critical', 'intensive', 'stable')),
  social_status TEXT,
  region TEXT,
  address TEXT,
  housing TEXT,
  rent INTEGER NOT NULL DEFAULT 0,
  income TEXT,
  delegate_id INTEGER REFERENCES users(id),
  ent_salary INTEGER NOT NULL DEFAULT 0,
  ent_aid INTEGER NOT NULL DEFAULT 0,
  ent_medicine INTEGER NOT NULL DEFAULT 0,
  ent_checkups INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  photo_key TEXT,
  -- Files of the same family in different foundations share this (the first file's id).
  link_id INTEGER,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_fam_foundation ON families(foundation_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_fam_delegate ON families(delegate_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_fam_head ON families(head_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_fam_link ON families(link_id) WHERE deleted_at IS NULL AND link_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fam_file_no ON families(foundation_id, file_no) WHERE deleted_at IS NULL;

CREATE TABLE family_members (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  relation TEXT,
  age INTEGER,
  gender TEXT,
  status TEXT,
  chronic TEXT,
  phone TEXT,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);
CREATE INDEX idx_fmem_family ON family_members(family_id, sort, id) WHERE deleted_at IS NULL;

-- What the foundation paid a family. Its month's total is the family's «paid this month».
CREATE TABLE family_payments (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id),
  paid_on TEXT NOT NULL,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL,
  received_by TEXT,
  paid_by TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_fpay_family ON family_payments(family_id, paid_on DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_fpay_month ON family_payments(foundation_id, month, family_id) WHERE deleted_at IS NULL;

CREATE TABLE family_visits (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id),
  visited_on TEXT NOT NULL,
  delegate_name TEXT,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_fvisit_family ON family_visits(family_id, visited_on DESC, id DESC) WHERE deleted_at IS NULL;
