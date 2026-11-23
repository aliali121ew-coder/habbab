-- طلبات المساعدة: each foundation's own requests for help (type, the person, the place and the
-- need), with a status the manager moves along. A request can be changed for one hour after it
-- is sent; after that only its status changes.

CREATE TABLE help_requests (
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
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_hreq_foundation ON help_requests(foundation_id, id DESC) WHERE deleted_at IS NULL;
