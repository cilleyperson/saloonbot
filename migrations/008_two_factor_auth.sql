-- =====================================================
-- Two-Factor Authentication Migration
-- =====================================================

-- Add 2FA columns to admin_users table
ALTER TABLE admin_users ADD COLUMN totp_secret TEXT;
ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN totp_verified_at DATETIME;
ALTER TABLE admin_users ADD COLUMN backup_codes TEXT;

-- Index for finding users with 2FA enabled
CREATE INDEX IF NOT EXISTS idx_admin_users_totp_enabled
  ON admin_users(totp_enabled);
