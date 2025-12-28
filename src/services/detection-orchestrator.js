/**
 * Detection Orchestrator Service
 * Manages detection monitors for multiple channels concurrently
 */

const { createChildLogger } = require('../utils/logger');
const objectDetectionRepo = require('../database/repositories/object-detection-repo');
const channelRepo = require('../database/repositories/channel-repo');
const { YOLODetector } = require('./yolo-detection');
const { DetectionPipeline } = require('./detection-pipeline');

const logger = createChildLogger('detection-orchestrator');

/**
 * Detection Orchestrator class
 * Manages detection monitors for multiple Twitch channels concurrently
 */
class DetectionOrchestrator {
  /**
   * Create a new DetectionOrchestrator instance
   * @param {Object} botCore - Reference to the BotCore instance for sending chat messages
   */
  constructor(botCore) {
    this.botCore = botCore;
    this.monitors = new Map(); // Map<channelId, DetectionPipeline>
    this.detector = null;
    this.isInitialized = false;

    logger.debug('DetectionOrchestrator created');
  }

  /**
   * Initialize the orchestrator
   * Loads the YOLO model and auto-starts monitors for enabled configs
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('DetectionOrchestrator already initialized');
      return;
    }

    logger.info('Initializing detection orchestrator');

    try {
      // Create and initialize YOLO detector (load model once)
      this.detector = new YOLODetector();
      await this.detector.initialize();
      logger.info('YOLO model loaded successfully');

      // Auto-start monitors for enabled configs
      const enabledConfigs = objectDetectionRepo.getEnabledConfigs();
      logger.info(`Found ${enabledConfigs.length} enabled detection configs`);

      for (const config of enabledConfigs) {
        try {
          await this.startMonitoring(config.channel_id);
        } catch (error) {
          logger.error(`Failed to auto-start monitoring for channel ${config.channel_id}`, {
            error: error.message
          });
        }
      }

      this.isInitialized = true;
      logger.info('Detection orchestrator initialized', {
        activeMonitors: this.monitors.size
      });

    } catch (error) {
      logger.error('Failed to initialize detection orchestrator', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start monitoring for a channel
   * @param {number} channelId - Channel database ID
   * @returns {Promise<boolean>} True if monitoring started successfully
   */
  async startMonitoring(channelId) {
    // Check if already monitoring
    if (this.monitors.has(channelId)) {
      logger.debug(`Already monitoring channel ${channelId}`);
      return true;
    }

    // Get channel info
    const channel = channelRepo.findById(channelId);
    if (!channel) {
      logger.error(`Channel ${channelId} not found`);
      throw new Error(`Channel ${channelId} not found`);
    }

    // Get detection config
    const config = objectDetectionRepo.getConfig(channelId);
    if (!config) {
      logger.error(`No detection config found for channel ${channelId}`);
      throw new Error(`No detection config found for channel ${channelId}`);
    }

    if (!config.stream_url) {
      logger.error(`No stream URL configured for channel ${channelId}`);
      throw new Error(`No stream URL configured for channel ${channelId}`);
    }

    // Get enabled rules for this config
    const rules = objectDetectionRepo.getEnabledRules(config.id);
    if (rules.length === 0) {
      logger.warn(`No enabled detection rules for channel ${channelId}`);
    }

    logger.info(`Starting monitoring for channel ${channelId}`, {
      channel: channel.twitch_username,
      streamUrl: config.stream_url,
      ruleCount: rules.length
    });

    try {
      // Create detection pipeline
      const pipeline = new DetectionPipeline(config, channel, this.detector, this.botCore);

      // Set up event handlers
      pipeline.on('detection', (detection) => this._handleDetection(channelId, detection));
      pipeline.on('error', (error) => this._handlePipelineError(channelId, error));

      // Store in monitors map
      this.monitors.set(channelId, pipeline);

      // Start the pipeline
      await pipeline.start();

      // Update config to enabled if not already
      if (!config.is_enabled) {
        objectDetectionRepo.updateConfig(config.id, { is_enabled: true });
      }

      logger.info(`Started monitoring for channel ${channelId}`, {
        channel: channel.twitch_username
      });

      return true;

    } catch (error) {
      // Clean up on failure
      this.monitors.delete(channelId);
      logger.error(`Failed to start monitoring for channel ${channelId}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop monitoring for a channel
   * @param {number} channelId - Channel database ID
   * @returns {Promise<boolean>} True if monitoring stopped successfully
   */
  async stopMonitoring(channelId) {
    const pipeline = this.monitors.get(channelId);
    if (!pipeline) {
      logger.debug(`No active monitor for channel ${channelId}`);
      return false;
    }

    logger.info(`Stopping monitoring for channel ${channelId}`);

    try {
      // Stop the pipeline
      await pipeline.stop();

      // Remove from monitors map
      this.monitors.delete(channelId);

      // Update config to disabled
      const config = objectDetectionRepo.getConfig(channelId);
      if (config) {
        objectDetectionRepo.updateConfig(config.id, { is_enabled: false });
      }

      logger.info(`Stopped monitoring for channel ${channelId}`);
      return true;

    } catch (error) {
      logger.error(`Error stopping monitoring for channel ${channelId}`, {
        error: error.message
      });
      // Still remove from map even on error
      this.monitors.delete(channelId);
      throw error;
    }
  }

  /**
   * Get monitoring status for a channel
   * @param {number} channelId - Channel database ID
   * @returns {Object} Status object
   */
  getMonitoringStatus(channelId) {
    const pipeline = this.monitors.get(channelId);
    const config = objectDetectionRepo.getConfig(channelId);

    if (!pipeline) {
      return {
        isMonitoring: false,
        isEnabled: config ? config.is_enabled : false,
        hasConfig: !!config,
        streamUrl: config ? config.stream_url : null
      };
    }

    return {
      isMonitoring: true,
      isEnabled: config ? config.is_enabled : true,
      hasConfig: !!config,
      streamUrl: config ? config.stream_url : null,
      pipelineStatus: pipeline.getStatus ? pipeline.getStatus() : 'unknown'
    };
  }

  /**
   * Get all active monitors
   * @returns {Array<{channelId: number, status: Object}>} Array of active monitor info
   */
  getAllActiveMonitors() {
    const activeMonitors = [];

    for (const [channelId, pipeline] of this.monitors) {
      const channel = channelRepo.findById(channelId);
      activeMonitors.push({
        channelId,
        channelName: channel ? channel.twitch_username : 'unknown',
        status: pipeline.getStatus ? pipeline.getStatus() : 'active'
      });
    }

    return activeMonitors;
  }

  /**
   * Gracefully shutdown all monitors
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down detection orchestrator', {
      activeMonitors: this.monitors.size
    });

    const shutdownPromises = [];

    // Stop all active monitors
    for (const [channelId, pipeline] of this.monitors) {
      shutdownPromises.push(
        pipeline.stop().catch(error => {
          logger.error(`Error stopping pipeline for channel ${channelId}`, {
            error: error.message
          });
        })
      );
    }

    // Wait for all pipelines to stop
    await Promise.all(shutdownPromises);

    // Clear monitors map
    this.monitors.clear();

    // Dispose detector
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
    }

    this.isInitialized = false;
    logger.info('Detection orchestrator shutdown complete');
  }

  /**
   * Handle detection event from a pipeline
   * @param {number} channelId - Channel ID
   * @param {Object} detection - Detection data
   * @private
   */
  _handleDetection(channelId, detection) {
    logger.debug(`Detection in channel ${channelId}`, {
      class: detection.class,
      confidence: detection.confidence
    });

    // Log detection to database
    const config = objectDetectionRepo.getConfig(channelId);
    if (config) {
      objectDetectionRepo.logDetection(config.id, detection.ruleId || null, {
        objectClass: detection.class,
        confidence: detection.confidence,
        messageSent: detection.messageSent || null
      });
    }
  }

  /**
   * Handle error from a pipeline
   * @param {number} channelId - Channel ID
   * @param {Error} error - Error object
   * @private
   */
  _handlePipelineError(channelId, error) {
    logger.error(`Pipeline error for channel ${channelId}`, {
      error: error.message
    });

    // Optionally stop monitoring on persistent errors
    // This could be enhanced with retry logic or notification
  }

  /**
   * Check if the orchestrator is initialized
   * @returns {boolean}
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get orchestrator status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      detectorLoaded: this.detector !== null && this.detector.isInitialized,
      activeMonitorCount: this.monitors.size,
      monitors: this.getAllActiveMonitors()
    };
  }
}

// Create and export singleton instance
// Note: botCore should be set before initialization
let instance = null;

/**
 * Get or create the orchestrator instance
 * @param {Object} botCore - BotCore instance (required on first call)
 * @returns {DetectionOrchestrator}
 */
function getOrchestrator(botCore) {
  if (!instance) {
    if (!botCore) {
      throw new Error('botCore is required to create DetectionOrchestrator');
    }
    instance = new DetectionOrchestrator(botCore);
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
function resetOrchestrator() {
  if (instance) {
    instance.shutdown().catch(() => {});
    instance = null;
  }
}

module.exports = {
  DetectionOrchestrator,
  getOrchestrator,
  resetOrchestrator
};
