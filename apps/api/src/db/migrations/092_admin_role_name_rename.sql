-- "parent_role_name" was a holdover from an early test-server role and had no
-- relation to actual admin-level access. Rename the key so it reads for what
-- it actually gates. Safe to run whether the row still has its original key
-- or was already renamed (idempotent no-op in the latter case).
UPDATE server_settings
SET
  key = 'admin_role_name',
  description = 'The Discord role name that grants admin access to this app. Overrides the ADMIN_ROLE_NAME environment variable.'
WHERE key = 'parent_role_name';
