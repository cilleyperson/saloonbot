-- Migration 011: Add twitch_user_id to auth tables
-- This enables proper token lookup by Twitch user ID for EventSub subscriptions
--
-- The root cause of the EventSub token errors was that tokens were registered
-- with an empty string user ID instead of the actual Twitch user ID.
-- This migration adds the twitch_user_id column to both auth tables.

-- Add twitch_user_id column to channel_auth table
ALTER TABLE channel_auth ADD COLUMN twitch_user_id TEXT;

-- Backfill twitch_user_id from the channels table
UPDATE channel_auth
SET twitch_user_id = (
  SELECT twitch_id FROM channels WHERE channels.id = channel_auth.channel_id
);

-- Add twitch_user_id column to bot_auth table
ALTER TABLE bot_auth ADD COLUMN twitch_user_id TEXT;

-- Create index for efficient token lookup by Twitch user ID
CREATE INDEX IF NOT EXISTS idx_channel_auth_twitch_user_id ON channel_auth(twitch_user_id);
