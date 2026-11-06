-- Preserve the legacy audience until the next customer-group or audience write.
-- NULL means the existing audience is the single customer group on reads.
ALTER TABLE onboarding_state ADD COLUMN customer_groups_json TEXT DEFAULT NULL;
