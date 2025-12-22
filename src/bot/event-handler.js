const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('event-handler');

/**
 * Routes Twitch events to appropriate handlers
 */
class EventHandler {
  constructor() {
    this.raidHandler = null;
    this.subHandler = null;
    this.commandHandler = null;
    this.predefinedCommandHandler = null;
    this.chatClient = null;
  }

  /**
   * Set the handlers
   * @param {Object} handlers - Handler instances
   */
  setHandlers({ raidHandler, subHandler, commandHandler, predefinedCommandHandler }) {
    this.raidHandler = raidHandler;
    this.subHandler = subHandler;
    this.commandHandler = commandHandler;
    this.predefinedCommandHandler = predefinedCommandHandler;
  }

  /**
   * Set the chat client for sending messages
   * @param {ChatClient} chatClient
   */
  setChatClient(chatClient) {
    this.chatClient = chatClient;
  }

  /**
   * Handle raid event
   * @param {number} channelId - Channel database ID
   * @param {Object} event - Raid event from Twitch
   */
  async onRaid(channelId, event) {
    logger.info(`Raid received on channel ${channelId}`, {
      from: event.raidingBroadcasterDisplayName,
      viewers: event.viewers
    });

    if (this.raidHandler) {
      try {
        await this.raidHandler.handle(channelId, event);
      } catch (error) {
        logger.error('Error handling raid', { channelId, error: error.message });
      }
    }
  }

  /**
   * Handle new subscription event
   * @param {number} channelId - Channel database ID
   * @param {Object} event - Subscription event from Twitch
   */
  async onSubscription(channelId, event) {
    logger.info(`New subscription on channel ${channelId}`, {
      user: event.userDisplayName,
      tier: event.tier
    });

    if (this.subHandler) {
      try {
        await this.subHandler.handleNewSub(channelId, event);
      } catch (error) {
        logger.error('Error handling subscription', { channelId, error: error.message });
      }
    }
  }

  /**
   * Handle subscription message (resub) event
   * @param {number} channelId - Channel database ID
   * @param {Object} event - Subscription message event from Twitch
   */
  async onSubscriptionMessage(channelId, event) {
    logger.info(`Resub on channel ${channelId}`, {
      user: event.userDisplayName,
      months: event.cumulativeMonths
    });

    if (this.subHandler) {
      try {
        await this.subHandler.handleResub(channelId, event);
      } catch (error) {
        logger.error('Error handling resub', { channelId, error: error.message });
      }
    }
  }

  /**
   * Handle gift subscription event
   * @param {number} channelId - Channel database ID
   * @param {Object} event - Gift subscription event from Twitch
   */
  async onSubscriptionGift(channelId, event) {
    logger.info(`Gift sub on channel ${channelId}`, {
      gifter: event.gifterDisplayName,
      amount: event.amount
    });

    if (this.subHandler) {
      try {
        await this.subHandler.handleGiftSub(channelId, event);
      } catch (error) {
        logger.error('Error handling gift sub', { channelId, error: error.message });
      }
    }
  }

  /**
   * Handle chat message
   * @param {string} channel - Channel name
   * @param {string} user - Username
   * @param {string} message - Message text
   * @param {Object} msg - Full message object
   */
  async onChatMessage(channel, user, message, msg) {
    // Try predefined commands first
    if (this.predefinedCommandHandler) {
      try {
        const handled = await this.predefinedCommandHandler.handle(channel, user, message, msg);
        if (handled) {
          return; // Predefined command was executed, don't process as custom command
        }
      } catch (error) {
        logger.error('Error handling predefined command', { channel, error: error.message });
      }
    }

    // Then try custom commands
    if (this.commandHandler) {
      try {
        await this.commandHandler.handle(channel, user, message, msg);
      } catch (error) {
        logger.error('Error handling chat message', { channel, error: error.message });
      }
    }
  }
}

module.exports = EventHandler;
