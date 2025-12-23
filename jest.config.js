/**
 * Jest Configuration
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/web/views/**',
    '!src/bot/**', // Bot requires Twurple ESM
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['./tests/setup.js'],
  // Mock Twurple ESM modules
  moduleNameMapper: {
    '^@twurple/api$': '<rootDir>/tests/__mocks__/twurple.js',
    '^@twurple/auth$': '<rootDir>/tests/__mocks__/twurple.js',
    '^@twurple/chat$': '<rootDir>/tests/__mocks__/twurple.js',
    '^@twurple/eventsub-ws$': '<rootDir>/tests/__mocks__/twurple.js',
  },
};
