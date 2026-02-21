const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');
const { EventSubWsListener } = require('@twurple/eventsub-ws');
const authManager = require('./auth-manager');
const ChannelManager = require('./channel-manager');
const EventHandler = require('./event-handler');
const RaidHandler = require('./handlers/raid-handler');
const SubHandler = require('./handlers/sub-handler');
const CommandHandler = require('./handlers/command-handler');
const PredefinedCommandHandler = require('./handlers/predefined-command-handler');
const { getOrchestrator } = require('../services/detection-orchestrator');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('bot-core');

/**
 * Main bot core class - manages all Twitch connections and event handling
 */
class BotCore {
  constructor() {
    this.apiClient = null;
    this.chatClient = null;
    this.eventSubListener = null;
    this.channelManager = new ChannelManager();
    this.eventHandler = new EventHandler();
    this.detectionOrchestrator = null;
    this.running = false;
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    logger.info('Initializing bot core');

    // Initialize auth manager
    await authManager.initialize();

    // Check if bot is authenticated
    if (!authManager.isBotAuthenticated()) {
      logger.warn('Bot is not authenticated. Please authenticate via the admin interface.');
      return false;
    }

    // Create API client with shared multi-user auth provider
    // This provider contains tokens for both the bot AND all connected channels,
    // enabling EventSub to find the correct token for channel-specific subscriptions
    const authProvider = authManager.getAuthProvider();
    this.apiClient = new ApiClient({ authProvider });

    // Create Chat client (uses same auth provider)
    this.chatClient = new ChatClient({
      authProvider,
      channels: [], // We'll join channels dynamically
      isAlwaysMod: false
    });

    // Create EventSub listener
    // The apiClient has access to all channel tokens via the multi-user auth provider
    this.eventSubListener = new EventSubWsListener({
      apiClient: this.apiClient
    });

    // Initialize handlers
    const raidHandler = new RaidHandler(this.chatClient, this.apiClient);
    const subHandler = new SubHandler(this.chatClient);
    const commandHandler = new CommandHandler(this.chatClient, this.channelManager);
    const predefinedCommandHandler = new PredefinedCommandHandler(this.chatClient, this.channelManager);

    // Set up event handler
    this.eventHandler.setHandlers({ raidHandler, subHandler, commandHandler, predefinedCommandHandler });
    this.eventHandler.setChatClient(this.chatClient);

    // Set up channel manager
    this.channelManager.setDependencies(this.chatClient, this.eventSubListener, this.eventHandler);

    // Set up chat message handler
    this.chatClient.onMessage((channel, user, message, msg) => {
      this.eventHandler.onChatMessage(channel, user, message, msg);
    });

    // Set up connection event handlers
    this.setupConnectionHandlers();

    // Initialize detection orchestrator (lazy - will be fully initialized on start)
    try {
      this.detectionOrchestrator = getOrchestrator(this);
      logger.debug('Detection orchestrator created');
    } catch (error) {
      // Detection orchestrator is optional - log warning but continue
      logger.warn('Failed to create detection orchestrator', { error: error.message });
    }

    logger.info('Bot core initialized');
    return true;
  }

  /**
   * Set up connection event handlers
   */
  setupConnectionHandlers() {
    // Chat client events
    this.chatClient.onConnect(() => {
      logger.info('Connected to Twitch chat');
    });

    this.chatClient.onDisconnect((manually, reason) => {
      if (manually) {
        logger.info('Disconnected from Twitch chat (manual)');
      } else {
        logger.warn('Disconnected from Twitch chat', { reason });
      }
    });

    this.chatClient.onJoin((channel, user) => {
      if (user === this.chatClient.currentNick) {
        logger.debug(`Joined channel: ${channel}`);
      }
    });

    this.chatClient.onPart((channel, user) => {
      if (user === this.chatClient.currentNick) {
        logger.debug(`Left channel: ${channel}`);
      }
    });

    this.chatClient.onAuthenticationFailure((message) => {
      logger.error('Chat authentication failed', { message });
    });

    // EventSub events
    this.eventSubListener.onSubscriptionCreateFailure((subscription, error) => {
      logger.error('EventSub subscription failed', {
        type: subscription.type,
        error: error.message
      });
    });
  }

  /**
   * Start the bot
   */
  async start() {
    if (this.running) {
      logger.warn('Bot is already running');
      return;
    }

    logger.info('Starting bot');

    try {
      // Connect to chat
      await this.chatClient.connect();
      logger.info('Chat client connected');

      // Start EventSub listener
      this.eventSubListener.start();
      logger.info('EventSub listener started');

      // Load and connect to active channels
      await this.channelManager.loadActiveChannels();

      // Initialize and start detection orchestrator
      if (this.detectionOrchestrator) {
        try {
          await this.detectionOrchestrator.initialize();
          logger.info('Detection orchestrator initialized');
        } catch (error) {
          // Detection is optional - log warning but continue
          logger.warn('Failed to initialize detection orchestrator', { error: error.message });
        }
      }

      this.running = true;
      logger.info('Bot started successfully');
    } catch (error) {
      logger.error('Failed to start bot', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (!this.running) {
      logger.debug('Bot is not running');
      return;
    }

    logger.info('Stopping bot');

    try {
      // Shutdown detection orchestrator first
      if (this.detectionOrchestrator) {
        try {
          await this.detectionOrchestrator.shutdown();
          logger.debug('Detection orchestrator stopped');
        } catch (error) {
          logger.warn('Error stopping detection orchestrator', { error: error.message });
        }
      }

      // Disconnect all channels
      await this.channelManager.disconnectAll();

      // Stop EventSub listener
      if (this.eventSubListener) {
        this.eventSubListener.stop();
        logger.debug('EventSub listener stopped');
      }

      // Disconnect chat
      if (this.chatClient) {
        this.chatClient.quit();
        logger.debug('Chat client disconnected');
      }

      this.running = false;
      logger.info('Bot stopped');
    } catch (error) {
      logger.error('Error stopping bot', { error: error.message });
    }
  }

  /**
   * Send a message to a channel
   * @param {string} channel - Channel name
   * @param {string} message - Message to send
   */
  async say(channel, message) {
    if (!this.chatClient) {
      logger.warn('Chat client not available');
      return;
    }

    try {
      // Ensure channel has # prefix
      const channelName = channel.startsWith('#') ? channel : `#${channel}`;
      await this.chatClient.say(channelName.slice(1), message);
    } catch (error) {
      logger.error('Failed to send message', { channel, error: error.message });
    }
  }

  /**
   * Add a channel at runtime
   * @param {number} channelId - Channel database ID
   */
  async addChannel(channelId) {
    if (!this.running) {
      logger.warn('Bot is not running, cannot add channel');
      return;
    }

    await this.channelManager.addChannel(channelId);
  }

  /**
   * Remove a channel at runtime
   * @param {number} channelId - Channel database ID
   */
  async removeChannel(channelId) {
    await this.channelManager.removeChannel(channelId);
  }

  /**
   * Check if bot is running
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }

  /**
   * Check if bot is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return authManager.isBotAuthenticated();
  }

  /**
   * Get bot status
   * @returns {Object}
   */
  getStatus() {
    const status = {
      running: this.running,
      authenticated: authManager.isBotAuthenticated(),
      botUsername: authManager.getBotUsername(),
      channelCount: this.channelManager.getActiveChannelIds().length,
      channels: this.channelManager.getActiveChannels()
    };

    // Include detection orchestrator status if available
    if (this.detectionOrchestrator) {
      status.detection = this.detectionOrchestrator.getStatus();
    }

    return status;
  }

  /**
   * Get the detection orchestrator instance
   * @returns {DetectionOrchestrator|null}
   */
  getDetectionOrchestrator() {
    return this.detectionOrchestrator;
  }
}

// Export singleton instance
module.exports = new BotCore();
