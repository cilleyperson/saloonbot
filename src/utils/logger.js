const winston = require('winston');
const path = require('path');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Sensitive field names to redact from logs
const sensitiveFields = ['password', 'token', 'access_token', 'refresh_token', 'secret', 'authorization', 'cookie'];

/**
 * Recursively redacts sensitive data from objects
 * @param {*} obj - Object to redact sensitive data from
 * @returns {*} - Copy of object with sensitive fields redacted
 */
function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(redacted)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitive(redacted[key]);
    }
  }

  return redacted;
}

/**
 * Winston format for redacting sensitive data
 */
const redactFormat = winston.format((info) => {
  // Redact message if it's an object
  if (typeof info.message === 'object') {
    info.message = redactSensitive(info.message);
  }

  // Redact all metadata fields
  const keysToRedact = Object.keys(info).filter(
    key => !['level', 'message', 'timestamp', 'stack', Symbol.for('level'), Symbol.for('message'), Symbol.for('splat')].includes(key)
  );

  for (const key of keysToRedact) {
    // Check if the key itself is sensitive
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      info[key] = '[REDACTED]';
    } else if (typeof info[key] === 'object' && info[key] !== null) {
      info[key] = redactSensitive(info[key]);
    }
  }

  return info;
})();

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  if (stack) {
    log += `\n${stack}`;
  }

  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }

  return log;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const log = {
    timestamp,
    level,
    message,
    ...meta
  };

  if (stack) {
    log.stack = stack;
  }

  return JSON.stringify(log);
});

// Create transports array
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: combine(
      redactFormat,
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      consoleFormat
    )
  })
];

// Add file transports in production or if logs directory exists
if (config.isProduction) {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: combine(
        redactFormat,
        timestamp(),
        errors({ stack: true }),
        fileFormat
      )
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: combine(
        redactFormat,
        timestamp(),
        errors({ stack: true }),
        fileFormat
      )
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false
});

// Create child loggers for different components
const createChildLogger = (component) => {
  return logger.child({ component });
};

module.exports = {
  logger,
  createChildLogger,
  // Convenience exports for direct use
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger)
};
