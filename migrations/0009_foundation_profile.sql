-- Each foundation's own letterhead (design: .claude/design/multi-foundation.md, phase 2b): the
-- address in the footer of printed sheets, the short place under the stamp, and its phones.
-- The logo, stamp and signatures already have their columns (logo_key … signature2_key).
ALTER TABLE foundations ADD COLUMN address TEXT;
ALTER TABLE foundations ADD COLUMN stamp_place TEXT;
-- JSON array of phone numbers as printed, e.g. ["07808337805","0760107408"].
ALTER TABLE foundations ADD COLUMN phones TEXT;
-- The names printed above the two signatures.
ALTER TABLE foundations ADD COLUMN accountant_name TEXT;
ALTER TABLE foundations ADD COLUMN manager_name TEXT;

-- Foundation 1 keeps what its sheets print today.
UPDATE foundations SET
  address = 'بابل - قضاء الهاشمية - حي الزهراء',
  stamp_place = 'بابل - قضاء الهاشمية',
  phones = '["07808337805","0760107408"]',
  accountant_name = 'صباح محمد العيساوي',
  manager_name = 'سماحة السيد علي كاظم داود الشريفي'
WHERE id = 1;
