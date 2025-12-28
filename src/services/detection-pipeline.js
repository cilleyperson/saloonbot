/**
 * Detection Pipeline Service
 * Connects stream capture to YOLO detection for automated object detection in Twitch streams
 */

const { EventEmitter } = require('events');
const { StreamCapture } = require('./stream-capture');
const objectDetectionRepo = require('../database/repositories/object-detection-repo');
const { formatTemplate } = require('../utils/template');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('detection-pipeline');

/**
 * Detection Pipeline class
 * Orchestrates stream capture, object detection, and chat message sending
 */
class DetectionPipeline extends EventEmitter {
  /**
   * Create a new DetectionPipeline instance
   * @param {Object} config - Object detection config record from database
   * @param {Object} channel - Channel record with twitch_username
   * @param {Object} detector - YOLODetector instance
   * @param {Object} botCore - BotCore instance for sending chat messages
   */
  constructor(config, channel, detector, botCore) {
    super();

    if (!config) {
      throw new Error('Config is required');
    }
    if (!channel || !channel.twitch_username) {
      throw new Error('Channel with twitch_username is required');
    }
    if (!detector) {
      throw new Error('Detector is required');
    }
    if (!botCore) {
      throw new Error('BotCore is required');
    }

    this.config = config;
    this.channel = channel;
    this.detector = detector;
    this.botCore = botCore;

    this.streamCapture = null;
    this._running = false;

    // Cooldown tracking: Map<object_class, lastDetectionTime>
    this._cooldowns = new Map();

    // Stats tracking
    this._stats = {
      framesProcessed: 0,
      detectionsTotal: 0,
      messagesSent: 0,
      startTime: null,
      lastDetection: null
    };

    // Cache enabled rules for performance
    this._rulesCache = null;
    this._rulesCacheTime = null;
    this._rulesCacheTTL = 60000; // 1 minute cache

    logger.debug('DetectionPipeline created', {
      configId: config.id,
      channelId: channel.id,
      channelName: channel.twitch_username
    });
  }

  /**
   * Start the detection pipeline
   * @returns {Promise<void>}
   */
  async start() {
    if (this._running) {
      logger.warn('Detection pipeline already running', {
        channelName: this.channel.twitch_username
      });
      return;
    }

    logger.info('Starting detection pipeline', {
      channelName: this.channel.twitch_username,
      configId: this.config.id
    });

    try {
      // Determine stream URL - use config stream_url or construct from Twitch username
      const streamUrl = this.config.stream_url || `https://twitch.tv/${this.channel.twitch_username}`;

      // Create StreamCapture instance
      this.streamCapture = new StreamCapture(streamUrl, {
        frameIntervalMs: this.config.frame_interval_ms || 1000
      });

      // Set up frame callback
      this.streamCapture.onFrame(async (frameBuffer, timestamp) => {
        await this._processFrame(frameBuffer, timestamp);
      });

      // Set up error callback
      this.streamCapture.onError((error) => {
        logger.error('Stream capture error', {
          channelName: this.channel.twitch_username,
          error: error.message
        });
        this.emit('error', error);
      });

      // Start stream capture
      await this.streamCapture.start();

      this._running = true;
      this._stats.startTime = Date.now();

      logger.info('Detection pipeline started', {
        channelName: this.channel.twitch_username,
        streamUrl: this._sanitizeUrlForLog(streamUrl)
      });

      this.emit('started');

    } catch (error) {
      logger.error('Failed to start detection pipeline', {
        channelName: this.channel.twitch_username,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop the detection pipeline
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._running) {
      logger.debug('Detection pipeline not running', {
        channelName: this.channel.twitch_username
      });
      return;
    }

    logger.info('Stopping detection pipeline', {
      channelName: this.channel.twitch_username
    });

    try {
      if (this.streamCapture) {
        await this.streamCapture.stop();
        this.streamCapture = null;
      }

      this._running = false;
      this._cooldowns.clear();
      this._rulesCache = null;

      logger.info('Detection pipeline stopped', {
        channelName: this.channel.twitch_username,
        stats: this.getStats()
      });

      this.emit('stopped');

    } catch (error) {
      logger.error('Error stopping detection pipeline', {
        channelName: this.channel.twitch_username,
        error: error.message
      });
    }
  }

  /**
   * Get pipeline statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this._stats,
      uptime: this._stats.startTime ? Date.now() - this._stats.startTime : 0,
      isRunning: this._running
    };
  }

  /**
   * Check if the pipeline is running
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Get pipeline status for display
   * @returns {Object} Status object
   */
  getStatus() {
    const captureStatus = this.streamCapture ? this.streamCapture.getStatus() : 'not-initialized';
    return {
      running: this._running,
      captureStatus,
      stats: this.getStats()
    };
  }

  /**
   * Process a frame through object detection
   * @param {Buffer} frameBuffer - JPEG frame data
   * @param {number} timestamp - Frame timestamp
   * @private
   */
  async _processFrame(frameBuffer, timestamp) {
    this._stats.framesProcessed++;

    try {
      // Run detection
      const result = await this.detector.detect(frameBuffer);

      if (result.detections.length === 0) {
        return;
      }

      // Get enabled rules (with caching)
      const rules = await this._getEnabledRules();

      // Process each detection
      for (const detection of result.detections) {
        await this._handleDetection(detection, rules, timestamp);
      }

    } catch (error) {
      logger.error('Frame processing error', {
        channelName: this.channel.twitch_username,
        error: error.message
      });
    }
  }

  /**
   * Handle a single detection
   * @param {Object} detection - Detection object from YOLO
   * @param {Array} rules - Array of enabled detection rules
   * @param {number} timestamp - Detection timestamp
   * @private
   */
  async _handleDetection(detection, rules, timestamp) {
    const objectClass = detection.class.toLowerCase();
    const confidence = detection.confidence;

    this._stats.detectionsTotal++;

    // Find matching rule for this object class
    const rule = rules.find(r => r.object_class === objectClass && r.is_enabled);

    if (!rule) {
      // No rule configured for this object class
      return;
    }

    // Check if confidence meets minimum threshold
    if (confidence < rule.min_confidence) {
      logger.debug('Detection below confidence threshold', {
        objectClass,
        confidence,
        minConfidence: rule.min_confidence
      });
      return;
    }

    // Check cooldown
    if (this._isOnCooldown(objectClass)) {
      logger.debug('Detection on cooldown', {
        objectClass,
        cooldownSeconds: this.config.cooldown_seconds
      });
      return;
    }

    // Build message from template
    const messageTemplate = rule.message_template || `Detected {object} with {confidence_pct} confidence!`;
    const message = this._renderTemplate(messageTemplate, {
      object: detection.class,
      confidence: confidence.toFixed(2),
      confidence_pct: `${Math.round(confidence * 100)}%`,
      streamer: this.channel.twitch_username
    });

    // Send message
    try {
      await this.botCore.say(this.channel.twitch_username, message);
      this._stats.messagesSent++;
      this._stats.lastDetection = {
        objectClass,
        confidence,
        timestamp,
        message
      };

      logger.info('Detection message sent', {
        channelName: this.channel.twitch_username,
        objectClass,
        confidence: confidence.toFixed(3)
      });

      // Update cooldown
      this._setCooldown(objectClass);

      // Log detection to database
      this._logDetection(objectClass, confidence, rule.id, message);

      // Emit detection event
      this.emit('detection', {
        objectClass,
        confidence,
        message,
        timestamp
      });

    } catch (error) {
      logger.error('Failed to send detection message', {
        channelName: this.channel.twitch_username,
        error: error.message
      });
    }
  }

  /**
   * Get enabled rules with caching
   * @returns {Promise<Array>} Array of enabled rules
   * @private
   */
  async _getEnabledRules() {
    const now = Date.now();

    // Check if cache is still valid
    if (this._rulesCache && this._rulesCacheTime && (now - this._rulesCacheTime) < this._rulesCacheTTL) {
      return this._rulesCache;
    }

    // Refresh cache
    try {
      this._rulesCache = objectDetectionRepo.getEnabledRules(this.config.id);
      this._rulesCacheTime = now;
      return this._rulesCache;
    } catch (error) {
      logger.error('Failed to get enabled rules', { error: error.message });
      return this._rulesCache || [];
    }
  }

  /**
   * Check if an object class is on cooldown
   * @param {string} objectClass - Object class to check
   * @returns {boolean} True if on cooldown
   * @private
   */
  _isOnCooldown(objectClass) {
    const lastDetection = this._cooldowns.get(objectClass);
    if (!lastDetection) {
      return false;
    }

    const cooldownMs = (this.config.cooldown_seconds || 30) * 1000;
    const elapsed = Date.now() - lastDetection;

    return elapsed < cooldownMs;
  }

  /**
   * Set cooldown for an object class
   * @param {string} objectClass - Object class to set cooldown for
   * @private
   */
  _setCooldown(objectClass) {
    this._cooldowns.set(objectClass, Date.now());
  }

  /**
   * Render a message template with variables
   * @param {string} template - Message template
   * @param {Object} variables - Template variables
   * @returns {string} Rendered message
   * @private
   */
  _renderTemplate(template, variables) {
    return formatTemplate(template, variables);
  }

  /**
   * Log a detection to the database
   * @param {string} objectClass - Detected object class
   * @param {number} confidence - Detection confidence
   * @param {number} ruleId - Rule ID that matched
   * @param {string} messageSent - Message that was sent
   * @private
   */
  _logDetection(objectClass, confidence, ruleId, messageSent) {
    try {
      objectDetectionRepo.logDetection(this.config.id, ruleId, {
        objectClass,
        confidence,
        messageSent
      });
    } catch (error) {
      logger.error('Failed to log detection', {
        error: error.message,
        objectClass,
        confidence
      });
    }
  }

  /**
   * Sanitize URL for logging (remove potential tokens/secrets)
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   * @private
   */
  _sanitizeUrlForLog(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }
}

module.exports = {
  DetectionPipeline
};
