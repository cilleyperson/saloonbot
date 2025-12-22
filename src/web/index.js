const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const config = require('../config');
const { createChildLogger } = require('../utils/logger');

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const commandRoutes = require('./routes/commands');
const counterRoutes = require('./routes/counters');
const chatMembershipRoutes = require('./routes/chat-memberships');
const predefinedCommandRoutes = require('./routes/predefined-commands');

const logger = createChildLogger('web');

/**
 * Create and configure the Express application
 * @returns {Express} Configured Express app
 */
function createApp() {
  const app = express();

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session configuration
  app.use(session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Static files
  app.use(express.static(path.join(__dirname, '../../public')));

  // Flash message middleware
  app.use((req, res, next) => {
    res.locals.flash = {
      success: req.session.flashSuccess,
      error: req.session.flashError,
      info: req.session.flashInfo
    };
    delete req.session.flashSuccess;
    delete req.session.flashError;
    delete req.session.flashInfo;
    next();
  });

  // Helper function for flash messages
  app.use((req, res, next) => {
    req.flash = (type, message) => {
      req.session[`flash${type.charAt(0).toUpperCase() + type.slice(1)}`] = message;
    };
    next();
  });

  // Make config available to views
  app.use((req, res, next) => {
    res.locals.config = {
      env: config.env
    };
    next();
  });

  // Routes
  app.use('/', dashboardRoutes);
  app.use('/auth', authRoutes);
  app.use('/channels', channelRoutes);
  app.use('/channels', commandRoutes);
  app.use('/channels', counterRoutes);
  app.use('/channels', chatMembershipRoutes);
  app.use('/channels', predefinedCommandRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Not Found',
      message: 'The page you are looking for does not exist.',
      error: { status: 404 }
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Web error', { error: err.message, stack: err.stack });

    res.status(err.status || 500).render('error', {
      title: 'Error',
      message: config.isDevelopment ? err.message : 'An error occurred',
      error: config.isDevelopment ? err : { status: err.status || 500 }
    });
  });

  return app;
}

/**
 * Load SSL certificates for HTTPS
 * @returns {Object|null} SSL options or null if not available
 */
function loadSslCertificates() {
  const { keyPath, certPath } = config.server.https;

  try {
    // Resolve paths relative to project root
    const keyFullPath = path.resolve(keyPath);
    const certFullPath = path.resolve(certPath);

    if (!fs.existsSync(keyFullPath)) {
      logger.warn(`SSL key not found at: ${keyFullPath}`);
      return null;
    }

    if (!fs.existsSync(certFullPath)) {
      logger.warn(`SSL certificate not found at: ${certFullPath}`);
      return null;
    }

    return {
      key: fs.readFileSync(keyFullPath),
      cert: fs.readFileSync(certFullPath)
    };
  } catch (error) {
    logger.error('Failed to load SSL certificates', { error: error.message });
    return null;
  }
}

/**
 * Create HTTP to HTTPS redirect middleware
 * @param {number} httpsPort - The HTTPS port to redirect to
 * @returns {Function} Express middleware
 */
function createHttpsRedirectMiddleware(httpsPort) {
  return (req, res, next) => {
    if (req.secure) {
      return next();
    }

    // Build the HTTPS URL
    const host = req.hostname;
    const portSuffix = httpsPort === 443 ? '' : `:${httpsPort}`;
    const httpsUrl = `https://${host}${portSuffix}${req.url}`;

    logger.debug(`Redirecting HTTP to HTTPS: ${httpsUrl}`);
    res.redirect(301, httpsUrl);
  };
}

/**
 * Start the web server with optional HTTPS support
 * @returns {Promise<Object>} Object containing server instances
 */
async function startServer() {
  const app = createApp();
  const servers = { http: null, https: null };
  const httpsConfig = config.server.https;

  // Check if HTTPS is enabled
  if (httpsConfig.enabled) {
    const sslOptions = loadSslCertificates();

    if (sslOptions) {
      // Start HTTPS server
      await new Promise((resolve) => {
        servers.https = https.createServer(sslOptions, app).listen(httpsConfig.port, () => {
          logger.info(`HTTPS server started on port ${httpsConfig.port}`);
          logger.info(`Admin interface (secure): https://localhost:${httpsConfig.port}`);
          resolve();
        });
      });

      // Start HTTP server for redirect or as fallback
      if (httpsConfig.redirectHttp) {
        // Create a simple redirect app
        const redirectApp = express();
        redirectApp.use(createHttpsRedirectMiddleware(httpsConfig.port));

        await new Promise((resolve) => {
          servers.http = http.createServer(redirectApp).listen(config.server.port, () => {
            logger.info(`HTTP server started on port ${config.server.port} (redirecting to HTTPS)`);
            resolve();
          });
        });
      } else {
        // Serve on both HTTP and HTTPS
        await new Promise((resolve) => {
          servers.http = http.createServer(app).listen(config.server.port, () => {
            logger.info(`HTTP server started on port ${config.server.port}`);
            logger.info(`Admin interface: http://localhost:${config.server.port}`);
            resolve();
          });
        });
      }
    } else {
      // HTTPS enabled but certificates not found - fall back to HTTP
      logger.warn('HTTPS enabled but certificates not found. Falling back to HTTP only.');
      logger.warn('Run `npm run generate-certs` to create self-signed certificates.');

      await new Promise((resolve) => {
        servers.http = app.listen(config.server.port, () => {
          logger.info(`HTTP server started on port ${config.server.port}`);
          logger.info(`Admin interface: http://localhost:${config.server.port}`);
          resolve();
        });
      });
    }
  } else {
    // HTTPS not enabled - start HTTP only
    await new Promise((resolve) => {
      servers.http = app.listen(config.server.port, () => {
        logger.info(`Web server started on port ${config.server.port}`);
        logger.info(`Admin interface: http://localhost:${config.server.port}`);
        resolve();
      });
    });
  }

  // Return a unified server object for shutdown handling
  return {
    close: (callback) => {
      let closed = 0;
      const total = (servers.http ? 1 : 0) + (servers.https ? 1 : 0);

      const checkComplete = () => {
        closed++;
        if (closed >= total && callback) {
          callback();
        }
      };

      if (servers.http) {
        servers.http.close(checkComplete);
      }
      if (servers.https) {
        servers.https.close(checkComplete);
      }
      if (total === 0 && callback) {
        callback();
      }
    },
    ...servers
  };
}

module.exports = {
  createApp,
  startServer
};
