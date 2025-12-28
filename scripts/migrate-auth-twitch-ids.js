#!/usr/bin/env node
/**
 * Backfill twitch_user_id for existing channel_auth entries
 *
 * This script is run manually to ensure any existing channel_auth entries
 * that may not have been migrated correctly get their twitch_user_id populated.
 *
 * Usage: node scripts/migrate-auth-twitch-ids.js
 */

const { getDb } = require('../src/database');

function migrate() {
  const db = getDb();

  console.log('Backfilling twitch_user_id for channel_auth entries...\n');

  // Find channel_auth entries without twitch_user_id
  const channelAuths = db.prepare(`
    SELECT ca.channel_id, ca.twitch_user_id, c.twitch_id as channel_twitch_id
    FROM channel_auth ca
    LEFT JOIN channels c ON c.id = ca.channel_id
    WHERE ca.twitch_user_id IS NULL OR ca.twitch_user_id = ''
  `).all();

  if (channelAuths.length === 0) {
    console.log('No entries need migration - all channel_auth entries have twitch_user_id set.');
    return;
  }

  console.log(`Found ${channelAuths.length} entries to migrate.\n`);

  let migrated = 0;
  let skipped = 0;

  for (const auth of channelAuths) {
    if (auth.channel_twitch_id) {
      db.prepare(`
        UPDATE channel_auth SET twitch_user_id = ? WHERE channel_id = ?
      `).run(auth.channel_twitch_id, auth.channel_id);

      console.log(`  ✓ Migrated channel_id ${auth.channel_id} -> twitch_user_id ${auth.channel_twitch_id}`);
      migrated++;
    } else {
      console.log(`  ✗ WARNING: channel_id ${auth.channel_id} has no twitch_id in channels table - skipping`);
      skipped++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  - Migrated: ${migrated}`);
  console.log(`  - Skipped: ${skipped}`);
}

// Check for bot_auth as well
function migrateBotAuth() {
  const db = getDb();

  console.log('\nChecking bot_auth table...\n');

  const botAuth = db.prepare(`
    SELECT id, twitch_user_id, bot_username
    FROM bot_auth
    WHERE twitch_user_id IS NULL OR twitch_user_id = ''
  `).get();

  if (!botAuth) {
    console.log('Bot auth already has twitch_user_id set or no bot auth exists.');
    return;
  }

  console.log(`Bot auth for "${botAuth.bot_username}" is missing twitch_user_id.`);
  console.log('The twitch_user_id will be set on the next bot OAuth authorization.');
  console.log('Please re-authorize the bot via /auth/bot to fix this.');
}

try {
  migrate();
  migrateBotAuth();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
