/**
 * Jest Test Setup
 *
 * This file runs before each test file.
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-jest';
process.env.DATABASE_PATH = ':memory:';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// The web layer resolves data/uploads at require-time (path-traversal guard in
// routes/commands.js). data/ is gitignored, so create it before any test that
// imports the Express app, or the require throws ENOENT.
const fs = require('fs');
const path = require('path');
fs.mkdirSync(path.join(__dirname, '..', 'data', 'uploads'), { recursive: true });

// Suppress console during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  };
}
