-- Help requests, step 2:
--  * the delegate a request is given to (the manager assigns it; the delegate sees it on their map);
--  * requests sent by families themselves from the foundation's public link (no account, so no
--    created_by) — marked source = 'public';
--  * the foundation's window for public requests: a secret link code and the open/close times.
-- SQLite cannot drop NOT NULL, so the table is rebuilt with its rows.

CREATE TABLE help_requests_new (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'doctor', 'medicine', 'food', 'money', 'home')),
  title TEXT NOT NULL,
  details TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  area TEXT,
  landmark TEXT,
  members INTEGER NOT NULL DEFAULT 1 CHECK (members BETWEEN 1 AND 30),
  urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review', 'approved', 'rejected')),
  lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  delegate_id INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'public')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
INSERT INTO help_requests_new (id, foundation_id, kind, title, details, name, phone, province, area, landmark, members, urgent,
  status, lat, lng, created_by, created_at, updated_at, deleted_at)
SELECT id, foundation_id, kind, title, details, name, phone, province, area, landmark, members, urgent,
  status, lat, lng, created_by, created_at, updated_at, deleted_at FROM help_requests;
DROP TABLE help_requests;
ALTER TABLE help_requests_new RENAME TO help_requests;
CREATE INDEX idx_hreq_foundation ON help_requests(foundation_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_hreq_delegate ON help_requests(foundation_id, delegate_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_hreq_phone ON help_requests(foundation_id, phone, created_at) WHERE deleted_at IS NULL;

ALTER TABLE foundations ADD COLUMN requests_code TEXT;
ALTER TABLE foundations ADD COLUMN requests_open_from TEXT;
ALTER TABLE foundations ADD COLUMN requests_open_until TEXT;
CREATE UNIQUE INDEX uq_foundations_requests_code ON foundations(requests_code) WHERE requests_code IS NOT NULL;
