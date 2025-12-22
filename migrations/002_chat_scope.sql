-- Add chat_scope column to custom_commands
-- 'all' = works in all chats (own + memberships)
-- 'selected' = only works in selected chats (stored in command_chat_scopes)
ALTER TABLE custom_commands ADD COLUMN chat_scope TEXT DEFAULT 'all';

-- Add chat_scope column to counter_commands
ALTER TABLE counter_commands ADD COLUMN chat_scope TEXT DEFAULT 'all';
