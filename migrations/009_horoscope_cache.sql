-- =====================================================
-- Horoscope Cache Migration
-- =====================================================

-- Cache table for daily horoscope readings
-- Stores scraped horoscope text per zodiac sign
-- Data is refreshed when older than 12:00 AM ET of current day
CREATE TABLE IF NOT EXISTS horoscope_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sign TEXT NOT NULL UNIQUE,
  horoscope_text TEXT NOT NULL,
  horoscope_date TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for sign lookups
CREATE INDEX IF NOT EXISTS idx_horoscope_cache_sign
  ON horoscope_cache(sign);

-- Index for date-based cache invalidation
CREATE INDEX IF NOT EXISTS idx_horoscope_cache_date
  ON horoscope_cache(horoscope_date);
