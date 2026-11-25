-- A photo for each donor. Donors are keyed by name in the donations register, so the photo is too;
-- the image itself is stored encrypted in R2 under file_key.
CREATE TABLE donor_photos (
  foundation_id INTEGER NOT NULL,
  donor_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  updated_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (foundation_id, donor_name)
);
