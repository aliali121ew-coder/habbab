-- المرضى on the server (design: .claude/design/multi-foundation.md, phase 4).
-- Each foundation keeps its own file on a patient (address, phone, condition, notes, doctor and
-- delegate of each aid are its own). When two foundations confirm they hold the same patient
-- (matched by the four-part name), their files share a link_id and each sees the other's aid:
-- cash, medicine, exam fees, date and foundation name only.

CREATE TABLE patients (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  file_no TEXT NOT NULL,
  name TEXT NOT NULL,                 -- the four-part name
  name_norm TEXT NOT NULL,            -- normalised, for matching across foundations
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female')),
  condition TEXT,
  address TEXT,
  phone TEXT,
  notes TEXT,
  photo_key TEXT,
  link_id INTEGER,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_pat_foundation ON patients(foundation_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_pat_name ON patients(name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_pat_link ON patients(link_id) WHERE deleted_at IS NULL AND link_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pat_file_no ON patients(foundation_id, file_no) WHERE deleted_at IS NULL;

-- One visit's aid: any of cash, medicine bought and the exam fee.
CREATE TABLE patient_aids (
  id INTEGER PRIMARY KEY,
  foundation_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  given_on TEXT NOT NULL,
  cash INTEGER NOT NULL DEFAULT 0 CHECK (cash >= 0),
  medicine INTEGER NOT NULL DEFAULT 0 CHECK (medicine >= 0),
  exams INTEGER NOT NULL DEFAULT 0 CHECK (exams >= 0),
  doctor TEXT,
  delegate TEXT,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK (cash + medicine + exams > 0)
);
CREATE INDEX idx_paid_patient ON patient_aids(patient_id, given_on DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_paid_foundation ON patient_aids(foundation_id, given_on DESC) WHERE deleted_at IS NULL;
