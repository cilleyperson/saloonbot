const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('database');

let db = null;

/**
 * Initialize the database connection
 * @returns {Database} The database instance
 */
function initialize() {
  if (db) {
    return db;
  }

  // Ensure the directory exists
  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }

  try {
    db = new Database(config.database.path);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    logger.info(`Database connected: ${config.database.path}`);

    return db;
  } catch (error) {
    logger.error('Failed to initialize database', { error: error.message });
    throw error;
  }
}

/**
 * Get the database instance
 * @returns {Database} The database instance
 */
function getDb() {
  if (!db) {
    return initialize();
  }
  return db;
}

/**
 * Close the database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Run a function within a transaction
 * @param {Function} fn - Function to run within transaction
 * @returns {*} Result of the function
 */
function transaction(fn) {
  const database = getDb();
  return database.transaction(fn)();
}

module.exports = {
  initialize,
  getDb,
  close,
  transaction
};
