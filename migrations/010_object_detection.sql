-- =====================================================
-- Object Detection Tables Migration
-- =====================================================

-- Configuration for object detection per channel
-- Stores settings for stream monitoring and detection parameters
CREATE TABLE IF NOT EXISTS object_detection_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  is_enabled INTEGER DEFAULT 0,
  stream_url TEXT,
  frame_interval_ms INTEGER DEFAULT 1000,
  max_concurrent_detections INTEGER DEFAULT 1,
  cooldown_seconds INTEGER DEFAULT 30,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id)
);

-- Detection rules for specific object classes
-- Defines what objects to detect and how to respond
CREATE TABLE IF NOT EXISTS object_detection_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL REFERENCES object_detection_configs(id) ON DELETE CASCADE,
  object_class TEXT NOT NULL,
  min_confidence REAL DEFAULT 0.5,
  message_template TEXT,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(config_id, object_class)
);

-- Log of object detection events
-- Tracks all detections for analytics and debugging
CREATE TABLE IF NOT EXISTS object_detection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL REFERENCES object_detection_configs(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES object_detection_rules(id) ON DELETE SET NULL,
  object_class TEXT NOT NULL,
  confidence REAL NOT NULL,
  message_sent TEXT,
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for object detection configs
CREATE INDEX IF NOT EXISTS idx_object_detection_configs_channel
  ON object_detection_configs(channel_id);

-- Indexes for object detection rules
CREATE INDEX IF NOT EXISTS idx_object_detection_rules_config
  ON object_detection_rules(config_id);
CREATE INDEX IF NOT EXISTS idx_object_detection_rules_class
  ON object_detection_rules(config_id, object_class);

-- Indexes for object detection logs
CREATE INDEX IF NOT EXISTS idx_object_detection_logs_config
  ON object_detection_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_object_detection_logs_rule
  ON object_detection_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_object_detection_logs_detected_at
  ON object_detection_logs(detected_at);
CREATE INDEX IF NOT EXISTS idx_object_detection_logs_class
  ON object_detection_logs(object_class);
