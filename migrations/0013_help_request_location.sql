-- The point picked on the map for a help request (latitude, longitude). Optional: a request
-- typed by hand without a map point keeps them empty.
ALTER TABLE help_requests ADD COLUMN lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE help_requests ADD COLUMN lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
