require('dotenv').config();

const config = {
  // Twitch Application
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    botUsername: process.env.TWITCH_BOT_USERNAME,
    callbackUrl: process.env.CALLBACK_URL || 'http://localhost:3000/auth/callback',

    // OAuth Scopes
    botScopes: ['chat:read', 'chat:edit', 'user:read:email'],
    channelScopes: [
      'channel:read:subscriptions',
      'moderator:read:followers',
      'moderator:manage:shoutouts'
    ]
  },

  // Web Server
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'change-this-secret-in-production',

    // HTTPS Configuration
    https: {
      enabled: process.env.HTTPS_ENABLED === 'true',
      port: parseInt(process.env.HTTPS_PORT, 10) || 3443,
      keyPath: process.env.HTTPS_KEY_PATH || './certs/server.key',
      certPath: process.env.HTTPS_CERT_PATH || './certs/server.crt',
      // Redirect HTTP to HTTPS when HTTPS is enabled
      redirectHttp: process.env.HTTPS_REDIRECT_HTTP !== 'false'
    }
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || './data/bot.db'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production'
};

/**
 * Validate required configuration
 * @returns {string[]} Array of missing configuration keys
 */
function validateConfig() {
  const required = [
    ['twitch.clientId', config.twitch.clientId],
    ['twitch.clientSecret', config.twitch.clientSecret]
  ];

  const missing = required
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing;
}

/**
 * Check if configuration is valid for bot operation
 * @returns {boolean}
 */
function isConfigValid() {
  return validateConfig().length === 0;
}

module.exports = {
  ...config,
  validateConfig,
  isConfigValid
};
