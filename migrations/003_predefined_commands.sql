-- =====================================================
-- Phase 2: Predefined Commands Migration
-- =====================================================

-- Predefined command settings per channel
CREATE TABLE IF NOT EXISTS predefined_command_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  command_name TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 0,
  chat_scope TEXT DEFAULT 'all',
  cooldown_seconds INTEGER DEFAULT 5,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, command_name)
);

-- Chat scopes for predefined commands
CREATE TABLE IF NOT EXISTS predefined_command_chat_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_id INTEGER NOT NULL REFERENCES predefined_command_settings(id) ON DELETE CASCADE,
  chat_name TEXT NOT NULL,
  UNIQUE(setting_id, chat_name)
);

-- Magic 8 Ball responses (global)
CREATE TABLE IF NOT EXISTS magic_8ball_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_text TEXT NOT NULL,
  response_type TEXT DEFAULT 'neutral',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Custom word definitions per channel
CREATE TABLE IF NOT EXISTS custom_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  part_of_speech TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, word)
);

-- Rock Paper Scissors user statistics
CREATE TABLE IF NOT EXISTS rps_user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_played_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predefined_settings_channel
  ON predefined_command_settings(channel_id);
CREATE INDEX IF NOT EXISTS idx_predefined_settings_command
  ON predefined_command_settings(channel_id, command_name);
CREATE INDEX IF NOT EXISTS idx_predefined_chat_scopes_setting
  ON predefined_command_chat_scopes(setting_id);
CREATE INDEX IF NOT EXISTS idx_custom_definitions_channel
  ON custom_definitions(channel_id);
CREATE INDEX IF NOT EXISTS idx_custom_definitions_word
  ON custom_definitions(channel_id, word);
CREATE INDEX IF NOT EXISTS idx_rps_stats_channel
  ON rps_user_stats(channel_id);
CREATE INDEX IF NOT EXISTS idx_rps_stats_user
  ON rps_user_stats(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rps_stats_leaderboard
  ON rps_user_stats(channel_id, wins DESC);

-- Seed Magic 8 Ball responses
INSERT INTO magic_8ball_responses (response_text, response_type) VALUES
  ('It is certain.', 'positive'),
  ('It is decidedly so.', 'positive'),
  ('Without a doubt.', 'positive'),
  ('Yes definitely.', 'positive'),
  ('You may rely on it.', 'positive'),
  ('As I see it, yes.', 'positive'),
  ('Most likely.', 'positive'),
  ('Outlook good.', 'positive'),
  ('Yes.', 'positive'),
  ('Signs point to yes.', 'positive'),
  ('Reply hazy, try again.', 'neutral'),
  ('Ask again later.', 'neutral'),
  ('Better not tell you now.', 'neutral'),
  ('Cannot predict now.', 'neutral'),
  ('Concentrate and ask again.', 'neutral'),
  ('Don''t count on it.', 'negative'),
  ('My reply is no.', 'negative'),
  ('My sources say no.', 'negative'),
  ('Outlook not so good.', 'negative'),
  ('Very doubtful.', 'negative');
