-- =====================================================
-- Admin Users Authentication Migration
-- =====================================================

-- Admin users table for web interface authentication
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1,
  failed_attempts INTEGER DEFAULT 0,
  locked_until DATETIME
);

-- Indexes for admin users
CREATE INDEX IF NOT EXISTS idx_admin_users_username
  ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_active
  ON admin_users(is_active);
