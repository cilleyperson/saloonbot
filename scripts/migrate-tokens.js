#!/usr/bin/env node

/**
 * Token Migration Script
 *
 * Migrates unencrypted OAuth tokens in the database to encrypted format.
 * Processes both bot_auth and channel_auth tables.
 *
 * Usage:
 *   node scripts/migrate-tokens.js           # Run migration
 *   node scripts/migrate-tokens.js --dry-run # Preview changes
 */

const Database = require('better-sqlite3');
const path = require('path');
const config = require('../src/config');
const { encrypt, isEncrypted } = require('../src/utils/crypto');

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');

/**
 * Check if encryption key is available
 */
function validateEncryptionKey() {
  if (!config.security?.tokenEncryptionKey) {
    console.error('ERROR: TOKEN_ENCRYPTION_KEY is not configured');
    console.error('Please set TOKEN_ENCRYPTION_KEY in your .env file');
    console.error('Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  // Validate key format
  if (!/^[a-fA-F0-9]{64}$/.test(config.security.tokenEncryptionKey)) {
    console.error('ERROR: TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    process.exit(1);
  }
}

/**
 * Process tokens in a table
 */
function processTable(db, tableName, tokenColumns) {
  console.log(`\nChecking ${tableName} table...`);

  // Get all rows with tokens
  const rows = db.prepare(`SELECT id, ${tokenColumns.join(', ')} FROM ${tableName}`).all();

  if (rows.length === 0) {
    console.log(`  - No records found`);
    return { total: 0, needsEncryption: 0, encrypted: 0, errors: [] };
  }

  let needsEncryption = 0;
  let encrypted = 0;
  const errors = [];

  for (const row of rows) {
    for (const column of tokenColumns) {
      const tokenValue = row[column];

      if (!tokenValue) {
        continue;
      }

      // Check if already encrypted
      if (isEncrypted(tokenValue)) {
        continue;
      }

      needsEncryption++;

      if (!isDryRun) {
        try {
          // Encrypt the token
          const encryptedValue = encrypt(tokenValue, config.security.tokenEncryptionKey);

          // Update the database
          const updateSql = `UPDATE ${tableName} SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          db.prepare(updateSql).run(encryptedValue, row.id);

          encrypted++;
        } catch (error) {
          const errorMsg = `Failed to encrypt ${column} for ${tableName} id=${row.id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`  - ERROR: ${errorMsg}`);
        }
      }
    }
  }

  console.log(`  - ${rows.length} total record(s)`);
  console.log(`  - ${needsEncryption} token(s) need encryption`);

  if (!isDryRun && encrypted > 0) {
    console.log(`  - ${encrypted} token(s) encrypted successfully`);
  }

  return { total: rows.length, needsEncryption, encrypted, errors };
}

/**
 * Main migration function
 */
function migrateTokens() {
  console.log('Token Migration Tool');
  console.log('====================');

  if (isDryRun) {
    console.log('Mode: DRY RUN (no changes will be made)\n');
  } else {
    console.log('Mode: LIVE MIGRATION (database will be updated)\n');
  }

  // Validate configuration
  validateEncryptionKey();

  // Resolve database path
  const dbPath = path.resolve(config.database.path);

  // Check if database exists
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: Database not found at ${dbPath}`);
    process.exit(1);
  }

  console.log(`Database: ${dbPath}`);

  // Open database
  let db;
  try {
    db = new Database(dbPath);
  } catch (error) {
    console.error(`ERROR: Failed to open database: ${error.message}`);
    process.exit(1);
  }

  // Start transaction for safety
  if (!isDryRun) {
    db.prepare('BEGIN TRANSACTION').run();
  }

  try {
    // Process bot_auth table
    const botResults = processTable(db, 'bot_auth', ['access_token', 'refresh_token']);

    // Process channel_auth table
    const channelResults = processTable(db, 'channel_auth', ['access_token', 'refresh_token']);

    // Calculate totals
    const totalRecords = botResults.total + channelResults.total;
    const totalNeedingEncryption = botResults.needsEncryption + channelResults.needsEncryption;
    const totalEncrypted = botResults.encrypted + channelResults.encrypted;
    const allErrors = [...botResults.errors, ...channelResults.errors];

    // Print summary
    console.log('\nSummary:');
    console.log('--------');
    console.log(`Total records processed: ${totalRecords}`);
    console.log(`Total tokens needing migration: ${totalNeedingEncryption}`);

    if (isDryRun) {
      if (totalNeedingEncryption === 0) {
        console.log('\n✓ All tokens are already encrypted! No migration needed.');
      } else {
        console.log(`\n⚠ Run without --dry-run to encrypt ${totalNeedingEncryption} token(s)`);
      }
    } else {
      console.log(`Total tokens encrypted: ${totalEncrypted}`);

      if (allErrors.length > 0) {
        console.log(`\nErrors encountered: ${allErrors.length}`);
        console.log('Rolling back transaction...');
        db.prepare('ROLLBACK').run();
        console.error('\n✗ Migration failed. Database unchanged.');
        process.exit(1);
      } else {
        db.prepare('COMMIT').run();
        if (totalEncrypted > 0) {
          console.log('\n✓ Migration completed successfully!');
        } else {
          console.log('\n✓ All tokens were already encrypted. No changes made.');
        }
      }
    }
  } catch (error) {
    if (!isDryRun) {
      db.prepare('ROLLBACK').run();
    }
    console.error(`\nFATAL ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
try {
  migrateTokens();
} catch (error) {
  console.error(`\nUnexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
