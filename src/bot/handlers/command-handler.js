const commandRepo = require('../../database/repositories/command-repo');
const commandResponsesRepo = require('../../database/repositories/command-responses-repo');
const counterRepo = require('../../database/repositories/counter-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { formatTemplate, sanitizeMessage } = require('../../utils/template');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('command-handler');

/**
 * Format response with emoji if configured
 * @param {string} response - The response text
 * @param {string|null} emoji - The emoji to add (or null)
 * @param {string} position - Position of emoji ('start' or 'end')
 * @returns {string} Formatted response with emoji
 */
function formatWithEmoji(response, emoji, position) {
  if (!emoji) {
    return response;
  }

  if (position === 'end') {
    return `${response} ${emoji}`;
  }
  // Default to start position
  return `${emoji} ${response}`;
}

/**
 * Handles chat commands (!commands and counters++)
 */
class CommandHandler {
  constructor(chatClient, channelManager) {
    this.chatClient = chatClient;
    this.channelManager = channelManager;
    this.cooldowns = new Map(); // 'channelId_commandName' -> timestamp
  }

  /**
   * Handle a chat message
   * @param {string} channelName - Channel name (without #)
   * @param {string} user - Username
   * @param {string} message - Message text
   * @param {Object} msg - Full message object from Twurple
   */
  async handle(channelName, user, message, msg) {
    const chatName = channelName.replace('#', '').toLowerCase();
    const trimmedMessage = message.trim();

    // Get all channels that have access to this chat
    const channelsForChat = this.channelManager.getChannelsForChat(chatName);
    if (channelsForChat.length === 0) {
      return; // No channels manage this chat
    }

    // Check for counter pattern (word++)
    const counterMatch = this.parseCounter(trimmedMessage);
    if (counterMatch) {
      for (const { channel } of channelsForChat) {
        await this.handleCounter(channel.id, chatName, channel.twitch_username, user, counterMatch, msg);
      }
      return;
    }

    // Check for command pattern (!command)
    const command = this.parseCommand(trimmedMessage);
    if (command) {
      for (const { channel } of channelsForChat) {
        await this.handleCommand(channel.id, chatName, channel.twitch_username, user, command, msg);
      }
    }
  }

  /**
   * Parse a command from message
   * @param {string} message - Message text
   * @returns {Object|null} Command info or null
   */
  parseCommand(message) {
    if (!message.startsWith('!')) return null;

    const parts = message.slice(1).split(' ');
    const name = parts[0].toLowerCase();

    if (!name || name.length === 0) return null;

    return {
      name,
      args: parts.slice(1),
      argsString: parts.slice(1).join(' ')
    };
  }

  /**
   * Parse a counter pattern from message
   * @param {string} message - Message text
   * @returns {string|null} Counter name or null
   */
  parseCounter(message) {
    const match = message.match(/^(\w+)\+\+$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Handle a custom command
   * @param {number} channelId - Channel ID (the owning channel)
   * @param {string} chatName - The chat where the message was sent
   * @param {string} ownerUsername - The username of the owning channel
   * @param {string} user - Username who triggered the command
   * @param {Object} command - Parsed command
   * @param {Object} msg - Message object
   */
  async handleCommand(channelId, chatName, ownerUsername, user, command, msg) {
    // Look up command in database
    const cmd = commandRepo.findByName(channelId, command.name);
    if (!cmd || !cmd.is_enabled) {
      return; // Command doesn't exist or is disabled
    }

    // Check chat scope - is this command enabled for this chat?
    if (!commandRepo.isEnabledForChat(cmd, chatName, ownerUsername)) {
      logger.debug(`Command !${command.name} not enabled for chat ${chatName}`);
      return;
    }

    // Check user level
    if (!this.checkUserLevel(msg, cmd.user_level)) {
      logger.debug(`User ${user} doesn't have permission for !${command.name}`);
      return;
    }

    // Check cooldown
    const cooldownKey = `${channelId}_${command.name}`;
    if (!this.checkCooldown(cooldownKey, cmd.cooldown_seconds)) {
      logger.debug(`Command !${command.name} is on cooldown`);
      return;
    }

    try {
      // Get response text based on response mode
      let responseText;
      if (cmd.response_mode === 'random') {
        // Get random response from command_responses table
        const randomResponse = commandResponsesRepo.getRandomResponse(cmd.id);
        if (!randomResponse) {
          // No responses configured, fall back to single response
          responseText = cmd.response;
        } else {
          responseText = randomResponse.response_text;
        }
      } else {
        // Single mode - use the response field
        responseText = cmd.response;
      }

      // Format response
      const response = formatTemplate(responseText, {
        user,
        channel: chatName,
        args: command.argsString,
        arg1: command.args[0] || '',
        arg2: command.args[1] || '',
        arg3: command.args[2] || ''
      });

      // Add emoji if configured
      const responseWithEmoji = formatWithEmoji(response, cmd.emoji, cmd.emoji_position);

      const sanitized = sanitizeMessage(responseWithEmoji);
      await this.chatClient.say(chatName, sanitized);

      // Update cooldown
      this.setCooldown(cooldownKey);

      // Increment use count
      commandRepo.incrementUseCount(cmd.id);

      logger.debug(`Executed !${command.name} for ${user} in ${chatName}`);
    } catch (error) {
      logger.error('Failed to execute command', {
        command: command.name,
        error: error.message
      });
    }
  }

  /**
   * Handle a counter increment
   * @param {number} channelId - Channel ID (the owning channel)
   * @param {string} chatName - The chat where the message was sent
   * @param {string} ownerUsername - The username of the owning channel
   * @param {string} user - Username who triggered the counter
   * @param {string} counterName - Counter name
   * @param {Object} msg - Message object
   */
  async handleCounter(channelId, chatName, ownerUsername, user, counterName, msg) {
    // Look up counter in database
    const counter = counterRepo.findByName(channelId, counterName);
    if (!counter || !counter.is_enabled) {
      return; // Counter doesn't exist or is disabled
    }

    // Check chat scope - is this counter enabled for this chat?
    if (!counterRepo.isEnabledForChat(counter, chatName, ownerUsername)) {
      logger.debug(`Counter ${counterName}++ not enabled for chat ${chatName}`);
      return;
    }

    try {
      // Increment counter
      const newCount = counterRepo.increment(counter.id);

      // Format response
      const response = formatTemplate(counter.response_template, {
        counter: counterName,
        count: newCount,
        user
      });

      // Add emoji if configured
      const responseWithEmoji = formatWithEmoji(response, counter.emoji, counter.emoji_position);

      const sanitized = sanitizeMessage(responseWithEmoji);
      await this.chatClient.say(chatName, sanitized);

      logger.debug(`Incremented ${counterName}++ to ${newCount} in ${chatName}`);
    } catch (error) {
      logger.error('Failed to increment counter', {
        counter: counterName,
        error: error.message
      });
    }
  }

  /**
   * Check if user has required permission level
   * @param {Object} msg - Message object
   * @param {string} requiredLevel - Required user level
   * @returns {boolean}
   */
  checkUserLevel(msg, requiredLevel) {
    const levels = {
      everyone: 0,
      subscriber: 1,
      vip: 2,
      moderator: 3,
      broadcaster: 4
    };

    const required = levels[requiredLevel] || 0;

    // Determine user's level
    let userLevel = 0;

    if (msg.userInfo) {
      if (msg.userInfo.isBroadcaster) userLevel = 4;
      else if (msg.userInfo.isMod) userLevel = 3;
      else if (msg.userInfo.isVip) userLevel = 2;
      else if (msg.userInfo.isSubscriber) userLevel = 1;
    }

    return userLevel >= required;
  }

  /**
   * Check if command is on cooldown
   * @param {string} key - Cooldown key
   * @param {number} cooldownSeconds - Cooldown duration
   * @returns {boolean} True if not on cooldown
   */
  checkCooldown(key, cooldownSeconds) {
    const lastUsed = this.cooldowns.get(key);
    if (!lastUsed) return true;

    const elapsed = (Date.now() - lastUsed) / 1000;
    return elapsed >= cooldownSeconds;
  }

  /**
   * Set cooldown for a command
   * @param {string} key - Cooldown key
   */
  setCooldown(key) {
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Clear all cooldowns
   */
  clearCooldowns() {
    this.cooldowns.clear();
  }
}

module.exports = CommandHandler;
