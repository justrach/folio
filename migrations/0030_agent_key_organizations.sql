-- A key can be limited to some of its owner's organizations, chosen when it is approved.
-- NULL means every organization the owner belongs to (all keys made before this). The owner's
-- own websites are always readable; the limit applies only to websites shared in organizations.
ALTER TABLE agent_api_keys ADD COLUMN organization_ids_json TEXT;
