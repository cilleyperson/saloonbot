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
