-- A delegate can cover more than one area (e.g. الهاشمية and القاسم); the register prints
-- each area on its own sheets. NULL for delegates with a single list.
ALTER TABLE subscribers ADD COLUMN area TEXT;
