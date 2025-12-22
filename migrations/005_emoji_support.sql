-- Migration 005: Add emoji support to commands and counters
-- Adds emoji column and emoji_position (start/end) to custom_commands and counter_commands

-- Add emoji columns to custom_commands
ALTER TABLE custom_commands ADD COLUMN emoji TEXT DEFAULT NULL;
ALTER TABLE custom_commands ADD COLUMN emoji_position TEXT DEFAULT 'start';

-- Add emoji columns to counter_commands
ALTER TABLE counter_commands ADD COLUMN emoji TEXT DEFAULT NULL;
ALTER TABLE counter_commands ADD COLUMN emoji_position TEXT DEFAULT 'start';
