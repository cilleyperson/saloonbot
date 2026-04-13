const personalityRepo = require('../database/repositories/personality-repo');
const { formatTemplate } = require('../utils/template');
const { splitMessage } = require('../utils/message-splitter');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('personality-chat');

/**
 * Wrapper around Twurple ChatClient that applies personality templates.
 * Handlers call sayAs() for themed messages and say() for unthemed system messages.
 */
class PersonalityChatClient {
  constructor(chatClient) {
    this.chatClient = chatClient;
  }

  /**
   * Send a themed message. Looks up the channel's active personality pack,
   * finds a random template for the event type, and formats it with variables.
   * Falls back to the original message if no personality is set or no template exists.
   * Handles message splitting for long themed messages.
   *
   * @param {string} channelName - Channel name (without #)
   * @param {string} message - Original message (used as fallback)
   * @param {string} eventType - Event type (e.g., '8ball_response', 'raid_shoutout')
   * @param {Object} vars - Template variables
   */
  async sayAs(channelName, message, eventType, vars = {}) {
    const themed = this.applyPersonality(channelName, message, eventType, vars);
    const parts = splitMessage(themed);
    for (const part of parts) {
      await this.chatClient.say(channelName, part);
    }
  }

  /**
   * Send an unthemed message directly. Use for system messages,
   * usage instructions, and anything that should not be personality-wrapped.
   *
   * @param {string} channelName - Channel name (without #)
   * @param {string} message - Message to send
   */
  async say(channelName, message) {
    await this.chatClient.say(channelName, message);
  }

  /**
   * Apply personality template to a message
   * @param {string} channelName - Channel name
   * @param {string} originalMessage - Fallback message
   * @param {string} eventType - Event type
   * @param {Object} vars - Template variables
   * @returns {string} Themed message or original
   */
  applyPersonality(channelName, originalMessage, eventType, vars) {
    try {
      const packId = personalityRepo.getActivePackForChannel(channelName);
      if (!packId) return originalMessage;

      const template = personalityRepo.getRandomTemplate(packId, eventType);
      if (!template) return originalMessage;

      return formatTemplate(template, { ...vars, original: originalMessage });
    } catch (error) {
      logger.error('Failed to apply personality', { channelName, eventType, error: error.message });
      return originalMessage;
    }
  }

  /**
   * Proxy commonly used ChatClient properties and methods
   */
  get currentNick() {
    return this.chatClient.currentNick;
  }

  onMessage(...args) {
    return this.chatClient.onMessage(...args);
  }

  onConnect(...args) {
    return this.chatClient.onConnect(...args);
  }

  onDisconnect(...args) {
    return this.chatClient.onDisconnect(...args);
  }

  onJoin(...args) {
    return this.chatClient.onJoin(...args);
  }

  onPart(...args) {
    return this.chatClient.onPart(...args);
  }

  onAuthenticationFailure(...args) {
    return this.chatClient.onAuthenticationFailure(...args);
  }

  async connect() {
    return this.chatClient.connect();
  }

  quit() {
    return this.chatClient.quit();
  }

  async join(channel) {
    return this.chatClient.join(channel);
  }

  async part(channel) {
    return this.chatClient.part(channel);
  }
}

module.exports = PersonalityChatClient;
