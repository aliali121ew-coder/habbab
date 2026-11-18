-- A delegate's profile card: contact details and the year they joined. All optional; when
-- joined_year is empty the profile shows the year the account was created.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN joined_year INTEGER;
