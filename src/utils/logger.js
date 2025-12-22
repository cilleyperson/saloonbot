const winston = require('winston');
const path = require('path');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

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
        timestamp(),
        errors({ stack: true }),
        fileFormat
      )
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: combine(
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
