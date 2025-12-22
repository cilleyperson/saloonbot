-- =====================================================
-- Trivia Game Statistics Migration
-- =====================================================

-- Trivia user statistics per channel
CREATE TABLE IF NOT EXISTS trivia_user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  correct_answers INTEGER DEFAULT 0,
  incorrect_answers INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_played_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, user_id)
);

-- Indexes for trivia stats
CREATE INDEX IF NOT EXISTS idx_trivia_stats_channel
  ON trivia_user_stats(channel_id);
CREATE INDEX IF NOT EXISTS idx_trivia_stats_user
  ON trivia_user_stats(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_trivia_stats_leaderboard
  ON trivia_user_stats(channel_id, correct_answers DESC);
