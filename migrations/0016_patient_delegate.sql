-- Patients and delegates. A patient is followed by a delegate in one of two ways:
--  * through their family: a patient from a registered family follows that family's delegate;
--  * directly: the foundation's staff give the patient to a delegate (this wins over the family).
-- A patient with neither is seen by the foundation's staff only (manager, health officer).
ALTER TABLE patients ADD COLUMN family_id INTEGER REFERENCES families(id);
ALTER TABLE patients ADD COLUMN delegate_id INTEGER REFERENCES users(id);
CREATE INDEX idx_pat_family ON patients(family_id) WHERE deleted_at IS NULL AND family_id IS NOT NULL;
CREATE INDEX idx_pat_delegate ON patients(foundation_id, delegate_id) WHERE deleted_at IS NULL AND delegate_id IS NOT NULL;
