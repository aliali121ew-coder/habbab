-- The donor's address, asked for with every new donation (with the name and phone).
ALTER TABLE donations ADD COLUMN donor_address TEXT;
