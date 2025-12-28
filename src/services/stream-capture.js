const ffmpeg = require('fluent-ffmpeg');
const { EventEmitter } = require('events');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('stream-capture');

/**
 * Status constants for stream capture
 */
const StreamStatus = {
  STOPPED: 'stopped',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

/**
 * Default configuration values
 */
const DEFAULTS = {
  FRAME_INTERVAL_MS: 5000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_BASE_DELAY_MS: 1000,
  RECONNECT_MAX_DELAY_MS: 30000,
  MAX_FRAME_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_BUFFER_FRAMES: 5,
  CONNECTION_TIMEOUT_MS: 30000,
  FRAME_QUALITY: 2 // JPEG quality 2-31, lower is better
};

/**
 * Validates that a URL is a valid Twitch HLS stream URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid Twitch URL
 */
function isValidTwitchUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Allow Twitch channel URLs
    if (parsed.hostname === 'twitch.tv' || parsed.hostname === 'www.twitch.tv') {
      return true;
    }

    // Allow Twitch HLS/usher URLs (where actual streams come from)
    if (parsed.hostname.endsWith('.twitch.tv') ||
        parsed.hostname.endsWith('.ttvnw.net') ||
        parsed.hostname.includes('usher.ttvnw.net') ||
        parsed.hostname.includes('video-weaver')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * StreamCapture class for capturing frames from Twitch HLS streams
 *
 * @example
 * const capture = new StreamCapture('https://twitch.tv/channelname', {
 *   frameIntervalMs: 5000
 * });
 *
 * capture.onFrame((frame) => {
 *   console.log('Got frame:', frame.length, 'bytes');
 * });
 *
 * capture.onError((error) => {
 *   console.error('Stream error:', error);
 * });
 *
 * await capture.start();
 */
class StreamCapture extends EventEmitter {
  /**
   * Create a new StreamCapture instance
   * @param {string} streamUrl - Twitch channel URL or HLS stream URL
   * @param {Object} options - Configuration options
   * @param {number} options.frameIntervalMs - Interval between frame captures (default 5000)
   * @param {number} options.reconnectAttempts - Max reconnection attempts (default 5)
   * @param {number} options.maxFrameSizeBytes - Maximum frame size in bytes (default 10MB)
   * @param {number} options.maxBufferFrames - Maximum frames to buffer (default 5)
   * @param {number} options.connectionTimeoutMs - Connection timeout in ms (default 30000)
   * @param {number} options.frameQuality - JPEG quality 2-31, lower is better (default 2)
   */
  constructor(streamUrl, options = {}) {
    super();

    if (!isValidTwitchUrl(streamUrl)) {
      throw new Error('Invalid stream URL: only Twitch URLs are allowed');
    }

    this.streamUrl = streamUrl;
    this.options = {
      frameIntervalMs: options.frameIntervalMs || DEFAULTS.FRAME_INTERVAL_MS,
      reconnectAttempts: options.reconnectAttempts ?? DEFAULTS.RECONNECT_ATTEMPTS,
      maxFrameSizeBytes: options.maxFrameSizeBytes || DEFAULTS.MAX_FRAME_SIZE_BYTES,
      maxBufferFrames: options.maxBufferFrames || DEFAULTS.MAX_BUFFER_FRAMES,
      connectionTimeoutMs: options.connectionTimeoutMs || DEFAULTS.CONNECTION_TIMEOUT_MS,
      frameQuality: options.frameQuality || DEFAULTS.FRAME_QUALITY
    };

    this._status = StreamStatus.STOPPED;
    this._ffmpegProcess = null;
    this._frameBuffer = [];
    this._reconnectCount = 0;
    this._reconnectTimeoutId = null;
    this._connectionTimeoutId = null;
    this._frameCallbacks = [];
    this._errorCallbacks = [];
    this._isShuttingDown = false;

    logger.debug('StreamCapture created', {
      streamUrl: this._sanitizeUrlForLog(streamUrl),
      options: this.options
    });
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
      // Remove query parameters which might contain tokens
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }

  /**
   * Get current stream status
   * @returns {string} Current status (stopped, connecting, connected, reconnecting, error)
   */
  getStatus() {
    return this._status;
  }

  /**
   * Register a callback to receive frame buffers
   * @param {Function} callback - Function called with (frameBuffer, timestamp)
   */
  onFrame(callback) {
    if (typeof callback !== 'function') {
      throw new Error('onFrame callback must be a function');
    }
    this._frameCallbacks.push(callback);
  }

  /**
   * Register a callback for errors
   * @param {Function} callback - Function called with (error)
   */
  onError(callback) {
    if (typeof callback !== 'function') {
      throw new Error('onError callback must be a function');
    }
    this._errorCallbacks.push(callback);
  }

  /**
   * Start capturing frames from the stream
   * @returns {Promise<void>} Resolves when connected, rejects on failure
   */
  async start() {
    if (this._status === StreamStatus.CONNECTED || this._status === StreamStatus.CONNECTING) {
      logger.warn('Stream capture already started');
      return;
    }

    this._isShuttingDown = false;
    this._reconnectCount = 0;

    return this._connect();
  }

  /**
   * Stop capturing and clean up resources
   * @returns {Promise<void>}
   */
  async stop() {
    logger.info('Stopping stream capture');
    this._isShuttingDown = true;

    this._clearTimeouts();
    await this._killFfmpeg();

    this._frameBuffer = [];
    this._status = StreamStatus.STOPPED;

    logger.info('Stream capture stopped');
  }

  /**
   * Clear all pending timeouts
   * @private
   */
  _clearTimeouts() {
    if (this._reconnectTimeoutId) {
      clearTimeout(this._reconnectTimeoutId);
      this._reconnectTimeoutId = null;
    }
    if (this._connectionTimeoutId) {
      clearTimeout(this._connectionTimeoutId);
      this._connectionTimeoutId = null;
    }
  }

  /**
   * Kill the FFmpeg process
   * @private
   */
  async _killFfmpeg() {
    return new Promise((resolve) => {
      if (!this._ffmpegProcess) {
        resolve();
        return;
      }

      const process = this._ffmpegProcess;
      this._ffmpegProcess = null;

      // Set up a timeout in case the process doesn't exit cleanly
      const killTimeout = setTimeout(() => {
        logger.warn('FFmpeg process did not exit cleanly, forcing kill');
        try {
          process.kill('SIGKILL');
        } catch {
          // Process might already be dead
        }
        resolve();
      }, 5000);

      process.on('end', () => {
        clearTimeout(killTimeout);
        resolve();
      });

      process.on('error', () => {
        clearTimeout(killTimeout);
        resolve();
      });

      try {
        process.kill('SIGTERM');
      } catch {
        clearTimeout(killTimeout);
        resolve();
      }
    });
  }

  /**
   * Connect to the stream and start FFmpeg
   * @private
   */
  async _connect() {
    this._status = StreamStatus.CONNECTING;
    logger.info('Connecting to stream', { url: this._sanitizeUrlForLog(this.streamUrl) });

    return new Promise((resolve, reject) => {
      // Set connection timeout
      this._connectionTimeoutId = setTimeout(() => {
        logger.error('Connection timeout');
        this._handleError(new Error('Connection timeout'));
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeoutMs);

      try {
        this._startFfmpeg(resolve, reject);
      } catch (error) {
        this._clearTimeouts();
        this._handleError(error);
        reject(error);
      }
    });
  }

  /**
   * Start the FFmpeg process for frame extraction
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  _startFfmpeg(resolve, reject) {
    // Calculate frame rate from interval
    const frameRate = 1000 / this.options.frameIntervalMs;

    // Current frame data buffer
    let currentFrameData = [];
    let hasConnected = false;

    this._ffmpegProcess = ffmpeg(this.streamUrl)
      // Input options for HLS streams
      .inputOptions([
        '-re', // Read at native frame rate
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      ])
      // Output options for JPEG frames
      .outputOptions([
        '-vf', `fps=${frameRate}`, // Set frame rate
        '-q:v', String(this.options.frameQuality), // JPEG quality
        '-f', 'image2pipe', // Output as pipe
        '-vcodec', 'mjpeg', // Output JPEG frames
        '-an' // No audio
      ])
      .output('pipe:1') // Output to stdout
      .on('start', (commandLine) => {
        logger.debug('FFmpeg started', { command: commandLine });
      })
      .on('stderr', (stderrLine) => {
        // FFmpeg outputs progress info to stderr
        logger.debug('FFmpeg stderr', { line: stderrLine });

        // Detect successful connection
        if (!hasConnected && stderrLine.includes('frame=')) {
          hasConnected = true;
          this._clearTimeouts();
          this._status = StreamStatus.CONNECTED;
          this._reconnectCount = 0;
          logger.info('Stream connected');
          resolve();
        }
      })
      .on('error', (error) => {
        this._clearTimeouts();

        if (this._isShuttingDown) {
          logger.debug('FFmpeg stopped during shutdown');
          return;
        }

        logger.error('FFmpeg error', { error: error.message });

        if (!hasConnected) {
          reject(error);
        }

        this._handleStreamDisconnect(error);
      })
      .on('end', () => {
        this._clearTimeouts();

        if (this._isShuttingDown) {
          logger.debug('FFmpeg ended during shutdown');
          return;
        }

        logger.info('FFmpeg stream ended');
        this._handleStreamDisconnect(new Error('Stream ended'));
      });

    // Get the FFmpeg stream and handle frame data
    const ffmpegStream = this._ffmpegProcess.pipe();

    ffmpegStream.on('data', (chunk) => {
      currentFrameData.push(chunk);

      // Check for JPEG end marker (0xFF 0xD9)
      const combined = Buffer.concat(currentFrameData);
      const endMarkerIndex = this._findJpegEndMarker(combined);

      if (endMarkerIndex !== -1) {
        // Extract the complete JPEG frame
        const frameData = combined.slice(0, endMarkerIndex + 2);

        // Keep remaining data for next frame
        const remaining = combined.slice(endMarkerIndex + 2);
        currentFrameData = remaining.length > 0 ? [remaining] : [];

        this._handleFrame(frameData);
      }

      // Prevent memory exhaustion from accumulating data
      const totalSize = currentFrameData.reduce((sum, buf) => sum + buf.length, 0);
      if (totalSize > this.options.maxFrameSizeBytes * 2) {
        logger.warn('Frame data accumulation exceeded limit, clearing buffer');
        currentFrameData = [];
      }
    });

    ffmpegStream.on('error', (error) => {
      logger.error('FFmpeg stream error', { error: error.message });
    });

    // Start the FFmpeg process
    this._ffmpegProcess.run();
  }

  /**
   * Find JPEG end marker in buffer
   * @param {Buffer} buffer - Buffer to search
   * @returns {number} Index of end marker or -1 if not found
   * @private
   */
  _findJpegEndMarker(buffer) {
    // JPEG end marker is 0xFF 0xD9
    for (let i = buffer.length - 2; i >= 0; i--) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Handle a received frame
   * @param {Buffer} frameData - JPEG frame data
   * @private
   */
  _handleFrame(frameData) {
    // Validate frame size
    if (frameData.length > this.options.maxFrameSizeBytes) {
      logger.warn('Frame exceeds size limit, dropping', {
        size: frameData.length,
        limit: this.options.maxFrameSizeBytes
      });
      return;
    }

    // Validate JPEG header (starts with 0xFF 0xD8)
    if (frameData.length < 2 || frameData[0] !== 0xFF || frameData[1] !== 0xD8) {
      logger.warn('Invalid JPEG frame header, dropping');
      return;
    }

    const timestamp = Date.now();

    // Add to buffer, removing oldest if at capacity
    if (this._frameBuffer.length >= this.options.maxBufferFrames) {
      this._frameBuffer.shift();
    }
    this._frameBuffer.push({ data: frameData, timestamp });

    logger.debug('Frame captured', {
      size: frameData.length,
      bufferSize: this._frameBuffer.length
    });

    // Notify callbacks
    for (const callback of this._frameCallbacks) {
      try {
        callback(frameData, timestamp);
      } catch (error) {
        logger.error('Frame callback error', { error: error.message });
      }
    }
  }

  /**
   * Handle stream disconnection
   * @param {Error} error - Disconnection error
   * @private
   */
  _handleStreamDisconnect(error) {
    if (this._isShuttingDown) {
      return;
    }

    if (this._reconnectCount >= this.options.reconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      this._status = StreamStatus.ERROR;
      // Emit error but don't throw - let the pipeline handle it
      this._handleError(new Error('Max reconnection attempts reached'));
      // Clean up any remaining resources
      this._killFfmpeg().catch(() => {});
      return;
    }

    this._status = StreamStatus.RECONNECTING;
    this._reconnectCount++;

    // Calculate exponential backoff delay
    const delay = Math.min(
      DEFAULTS.RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectCount - 1),
      DEFAULTS.RECONNECT_MAX_DELAY_MS
    );

    logger.info('Scheduling reconnection', {
      attempt: this._reconnectCount,
      maxAttempts: this.options.reconnectAttempts,
      delayMs: delay
    });

    this._reconnectTimeoutId = setTimeout(async () => {
      if (this._isShuttingDown) {
        return;
      }

      try {
        await this._killFfmpeg();
        await this._connect();
      } catch (reconnectError) {
        logger.error('Reconnection failed', { error: reconnectError.message });
        this._handleStreamDisconnect(reconnectError);
      }
    }, delay);
  }

  /**
   * Handle errors and notify callbacks
   * @param {Error} error - Error to handle
   * @private
   */
  _handleError(error) {
    for (const callback of this._errorCallbacks) {
      try {
        callback(error);
      } catch (callbackError) {
        logger.error('Error callback error', { error: callbackError.message });
      }
    }

    this.emit('error', error);
  }

  /**
   * Get the current frame buffer
   * @returns {Array<{data: Buffer, timestamp: number}>} Array of buffered frames
   */
  getFrameBuffer() {
    return [...this._frameBuffer];
  }

  /**
   * Get the most recent frame from the buffer
   * @returns {{data: Buffer, timestamp: number}|null} Most recent frame or null
   */
  getLatestFrame() {
    if (this._frameBuffer.length === 0) {
      return null;
    }
    return this._frameBuffer[this._frameBuffer.length - 1];
  }

  /**
   * Clear the frame buffer
   */
  clearFrameBuffer() {
    this._frameBuffer = [];
    logger.debug('Frame buffer cleared');
  }
}

module.exports = {
  StreamCapture,
  StreamStatus,
  isValidTwitchUrl,
  DEFAULTS
};
