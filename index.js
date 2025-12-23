/**
 * Saloon Bot - Main Entry Point
 *
 * This file initializes and starts all application components:
 * - Database connection and migrations
 * - Web admin interface
 * - Twitch bot core
 */

// Load environment variables first
require('dotenv').config();

const { initialize: initializeDatabase } = require('./src/database/index');
const { initializeSchema } = require('./src/database/schema');
const { createApp, startServer } = require('./src/web/index');
const botCore = require('./src/bot/index');
const { createChildLogger } = require('./src/utils/logger');

const logger = createChildLogger('main');

/**
 * Main startup function
 */
async function main() {
  logger.info('Starting Saloon Bot...');

  try {
    // Initialize database
    logger.info('Initializing database...');
    initializeDatabase();
    await initializeSchema();
    logger.info('Database initialized');

    // Create and start web server
    logger.info('Starting web server...');
    const app = createApp(botCore);
    const servers = await startServer(app);
    logger.info('Web server started', {
      http: servers.http ? `http://localhost:${servers.http.address()?.port || 'unknown'}` : null,
      https: servers.https ? `https://localhost:${servers.https.address()?.port || 'unknown'}` : null
    });

    // Initialize bot
    logger.info('Initializing bot...');
    const botInitialized = await botCore.initialize();

    if (botInitialized) {
      // Start bot if authenticated
      await botCore.start();
      logger.info('Bot started successfully');
    } else {
      logger.warn('Bot not authenticated - please authenticate via the admin interface');
    }

    logger.info('Saloon Bot is ready!');

    // Handle graceful shutdown
    setupShutdownHandlers(servers);

  } catch (error) {
    logger.error('Failed to start Saloon Bot', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupShutdownHandlers(servers) {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Stop the bot
      if (botCore.isRunning()) {
        await botCore.stop();
        logger.info('Bot stopped');
      }

      // Close HTTP server
      if (servers.http) {
        servers.http.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Close HTTPS server
      if (servers.https) {
        servers.https.close(() => {
          logger.info('HTTPS server closed');
        });
      }

      // Give time for connections to close
      setTimeout(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      }, 1000);

    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the application
main();
