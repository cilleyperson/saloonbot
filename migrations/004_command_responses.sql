-- =====================================================
-- Migration 004: Command Multi-Response Support
-- =====================================================
-- Allows commands to have either a single response or
-- select randomly from a list of multiple responses

-- Add response_mode column to custom_commands
-- 'single' = use the existing response field
-- 'random' = select randomly from command_responses table
ALTER TABLE custom_commands ADD COLUMN response_mode TEXT DEFAULT 'single';

-- Command responses table for multi-response commands
CREATE TABLE IF NOT EXISTS command_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id INTEGER NOT NULL REFERENCES custom_commands(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  weight INTEGER DEFAULT 1,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for command responses
CREATE INDEX IF NOT EXISTS idx_command_responses_command
  ON command_responses(command_id);
CREATE INDEX IF NOT EXISTS idx_command_responses_enabled
  ON command_responses(command_id, is_enabled);
