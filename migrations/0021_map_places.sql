-- Saved map places (families, landmarks, mosques, clinics, offices) pinned on the requests map.
-- Admin additions are approved immediately; delegate/staff additions wait for admin approval
-- before appearing permanently to everyone on the map.
CREATE TABLE IF NOT EXISTS map_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  foundation_id INTEGER NOT NULL DEFAULT 1 REFERENCES foundations(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'landmark' CHECK (category IN ('family', 'landmark', 'mosque', 'health', 'office')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_map_places_lookup
  ON map_places(foundation_id, status, deleted_at);
