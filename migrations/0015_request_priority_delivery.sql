-- Help requests, step 3:
--  * priority in three levels (normal / medium / high = «قصوى») instead of urgent yes/no;
--    the map blinks a pin red for high and orange for medium;
--  * a last status, delivered («تم التسليم»): the foundation's staff record what was handed
--    over, the pin leaves the map, and the delegate is told;
--  * notifications: short messages to one user (a request given to a delegate, help delivered).
-- SQLite cannot change a CHECK, so help_requests is rebuilt with its rows.

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
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review', 'approved', 'rejected', 'delivered')),
  lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  delegate_id INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'public')),
  delivered_at TEXT,
  delivered_by INTEGER REFERENCES users(id),
  delivered_note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
INSERT INTO help_requests_new (id, foundation_id, kind, title, details, name, phone, province, area, landmark, members,
  priority, status, lat, lng, delegate_id, source, created_by, created_at, updated_at, deleted_at)
SELECT id, foundation_id, kind, title, details, name, phone, province, area, landmark, members,
  CASE urgent WHEN 1 THEN 'high' ELSE 'normal' END, status, lat, lng, delegate_id, source, created_by, created_at, updated_at, deleted_at
FROM help_requests;
DROP TABLE help_requests;
ALTER TABLE help_requests_new RENAME TO help_requests;
CREATE INDEX idx_hreq_foundation ON help_requests(foundation_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_hreq_delegate ON help_requests(foundation_id, delegate_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_hreq_phone ON help_requests(foundation_id, phone, created_at) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notif_user ON notifications(foundation_id, user_id, id DESC);
