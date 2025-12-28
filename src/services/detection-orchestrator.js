/**
 * Detection Orchestrator Service
 * Manages detection monitors for multiple channels concurrently
 */

const { createChildLogger } = require('../utils/logger');
const objectDetectionRepo = require('../database/repositories/object-detection-repo');
const channelRepo = require('../database/repositories/channel-repo');
const { YOLODetector } = require('./yolo-detection');
const { DetectionPipeline } = require('./detection-pipeline');
const { StreamStatusService, extractUsernameFromUrl } = require('./stream-status');

const logger = createChildLogger('detection-orchestrator');

// Default polling interval for stream status checks (60 seconds)
const DEFAULT_STATUS_POLL_INTERVAL_MS = 60000;

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
    this.pendingChannels = new Map(); // Map<channelId, config> - channels waiting for stream to go live
    this.detector = null;
    this.streamStatusService = null;
    this.statusPollInterval = null;
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
      // Create stream status service using bot's API client
      if (this.botCore.apiClient) {
        this.streamStatusService = new StreamStatusService(this.botCore.apiClient);
        logger.debug('Stream status service created');
      } else {
        logger.warn('No API client available - stream status checking disabled');
      }

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
          // Don't throw - continue with other channels
        }
      }

      // Start polling for stream status changes
      this._startStatusPolling();

      this.isInitialized = true;
      logger.info('Detection orchestrator initialized', {
        activeMonitors: this.monitors.size,
        pendingChannels: this.pendingChannels.size
      });

    } catch (error) {
      logger.error('Failed to initialize detection orchestrator', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start polling for stream status changes
   * @private
   */
  _startStatusPolling() {
    if (this.statusPollInterval) {
      return; // Already polling
    }

    logger.info('Starting stream status polling');

    this.statusPollInterval = setInterval(async () => {
      try {
        await this._pollStreamStatus();
      } catch (error) {
        logger.error('Error during stream status poll', { error: error.message });
      }
    }, DEFAULT_STATUS_POLL_INTERVAL_MS);
  }

  /**
   * Stop polling for stream status
   * @private
   */
  _stopStatusPolling() {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
      logger.debug('Stream status polling stopped');
    }
  }

  /**
   * Poll stream status for pending channels and active monitors
   * @private
   */
  async _pollStreamStatus() {
    if (!this.streamStatusService) {
      return;
    }

    // Check pending channels - start monitoring if they go live
    for (const [channelId, pendingData] of this.pendingChannels) {
      try {
        const { isLive } = await this.streamStatusService.isStreamLive(pendingData.streamUrl);

        if (isLive) {
          logger.info(`Stream went live, starting monitoring`, {
            channelId,
            channel: pendingData.channelName
          });

          // Remove from pending and start monitoring
          this.pendingChannels.delete(channelId);
          await this._startMonitoringInternal(channelId, pendingData.config, pendingData.channel);
        }
      } catch (error) {
        logger.debug(`Error checking pending channel ${channelId}`, { error: error.message });
      }
    }

    // Check active monitors - stop if stream goes offline
    for (const [channelId, pipeline] of this.monitors) {
      try {
        const config = objectDetectionRepo.getConfig(channelId);
        if (!config || !config.stream_url) {
          continue;
        }

        const { isLive } = await this.streamStatusService.isStreamLive(config.stream_url);

        if (!isLive) {
          logger.info(`Stream went offline, pausing monitoring`, {
            channelId
          });

          // Stop the pipeline but keep config enabled (move to pending)
          await this._pauseMonitoring(channelId);
        }
      } catch (error) {
        logger.debug(`Error checking active monitor ${channelId}`, { error: error.message });
      }
    }
  }

  /**
   * Pause monitoring for a channel (stream went offline)
   * Stops the pipeline but keeps it in pending state for when stream comes back
   * @param {number} channelId - Channel ID
   * @private
   */
  async _pauseMonitoring(channelId) {
    const pipeline = this.monitors.get(channelId);
    if (!pipeline) {
      return;
    }

    const channel = channelRepo.findById(channelId);
    const config = objectDetectionRepo.getConfig(channelId);

    try {
      // Stop the pipeline
      await pipeline.stop();
    } catch (error) {
      logger.warn(`Error stopping pipeline for pause`, { channelId, error: error.message });
    }

    // Remove from active monitors
    this.monitors.delete(channelId);

    // Add to pending if config is still enabled
    if (config && config.is_enabled) {
      this.pendingChannels.set(channelId, {
        config,
        channel,
        channelName: channel ? channel.twitch_username : 'unknown',
        streamUrl: config.stream_url,
        pausedAt: new Date()
      });
      logger.debug(`Channel ${channelId} moved to pending (stream offline)`);
    }
  }

  /**
   * Start monitoring for a channel
   * Checks if stream is live first and adds to pending if not
   * @param {number} channelId - Channel database ID
   * @returns {Promise<boolean>} True if monitoring started or added to pending
   */
  async startMonitoring(channelId) {
    // Check if already monitoring
    if (this.monitors.has(channelId)) {
      logger.debug(`Already monitoring channel ${channelId}`);
      return true;
    }

    // Check if already pending
    if (this.pendingChannels.has(channelId)) {
      logger.debug(`Channel ${channelId} already pending`);
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

    // Check if stream is live before starting
    if (this.streamStatusService) {
      try {
        const { isLive, error } = await this.streamStatusService.isStreamLive(config.stream_url);

        if (error) {
          logger.warn(`Could not check stream status for channel ${channelId}`, { error });
        }

        if (!isLive) {
          // Stream is offline - add to pending instead of starting
          logger.info(`Stream is offline, adding to pending`, {
            channelId,
            channel: channel.twitch_username,
            streamUrl: config.stream_url
          });

          this.pendingChannels.set(channelId, {
            config,
            channel,
            channelName: channel.twitch_username,
            streamUrl: config.stream_url,
            addedAt: new Date()
          });

          // Update config to enabled so it will be monitored when live
          if (!config.is_enabled) {
            objectDetectionRepo.updateConfig(config.id, { is_enabled: true });
          }

          return true; // Successfully added to pending
        }

        logger.info(`Stream is live, starting monitoring`, {
          channelId,
          channel: channel.twitch_username
        });
      } catch (error) {
        logger.warn(`Error checking stream status, will attempt to start anyway`, {
          channelId,
          error: error.message
        });
      }
    }

    // Stream is live or status check unavailable - start monitoring
    return this._startMonitoringInternal(channelId, config, channel);
  }

  /**
   * Internal method to start monitoring (bypasses stream status check)
   * @param {number} channelId - Channel database ID
   * @param {Object} config - Detection config
   * @param {Object} channel - Channel object
   * @returns {Promise<boolean>}
   * @private
   */
  async _startMonitoringInternal(channelId, config, channel) {
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

      // If stream capture failed, add to pending for retry later
      if (error.message.includes('Max reconnection attempts') ||
          error.message.includes('Connection timeout') ||
          error.message.includes('Invalid data found')) {
        logger.warn(`Stream capture failed, adding to pending for retry`, {
          channelId,
          error: error.message
        });

        this.pendingChannels.set(channelId, {
          config,
          channel,
          channelName: channel.twitch_username,
          streamUrl: config.stream_url,
          addedAt: new Date(),
          lastError: error.message
        });

        return true; // Added to pending instead of failing completely
      }

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
    // Remove from pending if present
    if (this.pendingChannels.has(channelId)) {
      this.pendingChannels.delete(channelId);
      logger.debug(`Removed channel ${channelId} from pending`);
    }

    const pipeline = this.monitors.get(channelId);
    if (!pipeline) {
      // Update config to disabled even if not monitoring
      const config = objectDetectionRepo.getConfig(channelId);
      if (config) {
        objectDetectionRepo.updateConfig(config.id, { is_enabled: false });
      }
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
      // Don't throw - we want to ensure cleanup happens
      return false;
    }
  }

  /**
   * Get monitoring status for a channel
   * @param {number} channelId - Channel database ID
   * @returns {Object} Status object
   */
  getMonitoringStatus(channelId) {
    const pipeline = this.monitors.get(channelId);
    const pending = this.pendingChannels.get(channelId);
    const config = objectDetectionRepo.getConfig(channelId);

    if (pending) {
      return {
        isMonitoring: false,
        isPending: true,
        isEnabled: config ? config.is_enabled : true,
        hasConfig: !!config,
        streamUrl: config ? config.stream_url : null,
        pendingReason: 'Stream offline - waiting for stream to go live',
        lastError: pending.lastError || null
      };
    }

    if (!pipeline) {
      return {
        isMonitoring: false,
        isPending: false,
        isEnabled: config ? config.is_enabled : false,
        hasConfig: !!config,
        streamUrl: config ? config.stream_url : null
      };
    }

    return {
      isMonitoring: true,
      isPending: false,
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
      activeMonitors: this.monitors.size,
      pendingChannels: this.pendingChannels.size
    });

    // Stop status polling
    this._stopStatusPolling();

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

    // Clear monitors map and pending channels
    this.monitors.clear();
    this.pendingChannels.clear();

    // Dispose detector
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
    }

    // Clear stream status service
    this.streamStatusService = null;

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

    // Check if this is a stream-related error that should trigger pause
    if (error.message.includes('Max reconnection attempts') ||
        error.message.includes('Connection timeout') ||
        error.message.includes('Invalid data found') ||
        error.message.includes('Stream ended')) {

      logger.info(`Moving channel ${channelId} to pending due to stream error`);

      // Move to pending instead of crashing
      this._pauseMonitoring(channelId).catch(pauseError => {
        logger.error(`Error pausing monitoring for channel ${channelId}`, {
          error: pauseError.message
        });
      });
    }
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
    // Get pending channel info
    const pendingInfo = [];
    for (const [channelId, data] of this.pendingChannels) {
      pendingInfo.push({
        channelId,
        channelName: data.channelName,
        streamUrl: data.streamUrl,
        lastError: data.lastError || null
      });
    }

    return {
      initialized: this.isInitialized,
      detectorLoaded: this.detector !== null && this.detector.isInitialized,
      activeMonitorCount: this.monitors.size,
      pendingChannelCount: this.pendingChannels.size,
      monitors: this.getAllActiveMonitors(),
      pendingChannels: pendingInfo
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
