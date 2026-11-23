-- مدير النظام (design: .claude/design/multi-foundation.md, phase 2). A system admin manages the
-- foundations, chooses each one's features, and can enter any foundation to see it. The flag sits
-- on an ordinary user row; which account gets it is set by hand at release time.
ALTER TABLE users ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

-- The first system admin: the original manager account of foundation 1 (the only admin when
-- this was written, 2026-11-23). Others are named later from the foundations page.
UPDATE users SET is_system = 1 WHERE username = 'admin' AND foundation_id = 1 AND role = 'admin';
