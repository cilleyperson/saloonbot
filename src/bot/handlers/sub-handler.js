const settingsRepo = require('../../database/repositories/settings-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { formatTemplate, sanitizeMessage, formatTier } = require('../../utils/template');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('sub-handler');

/**
 * Handles subscription events
 */
class SubHandler {
  constructor(chatClient) {
    this.chatClient = chatClient;
  }

  /**
   * Handle a new subscription event
   * @param {number} channelId - Database channel ID
   * @param {Object} event - Twitch subscription event
   */
  async handleNewSub(channelId, event) {
    const settings = settingsRepo.getSettings(channelId);

    if (!settings.sub_notification_enabled) {
      logger.debug(`Sub notification disabled for channel ${channelId}`);
      return;
    }

    const channel = channelRepo.findById(channelId);
    if (!channel) {
      logger.error(`Channel ${channelId} not found`);
      return;
    }

    try {
      const message = formatTemplate(settings.sub_notification_template, {
        subscriber: event.userName,
        subscriber_display: event.userDisplayName,
        tier: formatTier(event.tier),
        channel: channel.display_name || channel.twitch_username
      });

      const sanitized = sanitizeMessage(message);
      await this.chatClient.say(channel.twitch_username, sanitized);

      logger.info(`Sent sub notification for ${event.userDisplayName} in ${channel.twitch_username}`);
    } catch (error) {
      logger.error('Failed to handle new sub', {
        channelId,
        user: event.userName,
        error: error.message
      });
    }
  }

  /**
   * Handle a resub event (subscription message)
   * @param {number} channelId - Database channel ID
   * @param {Object} event - Twitch subscription message event
   */
  async handleResub(channelId, event) {
    const settings = settingsRepo.getSettings(channelId);

    if (!settings.sub_notification_enabled) {
      logger.debug(`Sub notification disabled for channel ${channelId}`);
      return;
    }

    const channel = channelRepo.findById(channelId);
    if (!channel) {
      logger.error(`Channel ${channelId} not found`);
      return;
    }

    try {
      const message = formatTemplate(settings.resub_notification_template, {
        subscriber: event.userName,
        subscriber_display: event.userDisplayName,
        tier: formatTier(event.tier),
        months: event.cumulativeMonths,
        streak: event.streakMonths || 0,
        message: event.messageText || '',
        channel: channel.display_name || channel.twitch_username
      });

      const sanitized = sanitizeMessage(message);
      await this.chatClient.say(channel.twitch_username, sanitized);

      logger.info(`Sent resub notification for ${event.userDisplayName} (${event.cumulativeMonths} months) in ${channel.twitch_username}`);
    } catch (error) {
      logger.error('Failed to handle resub', {
        channelId,
        user: event.userName,
        error: error.message
      });
    }
  }

  /**
   * Handle a gift subscription event
   * @param {number} channelId - Database channel ID
   * @param {Object} event - Twitch gift subscription event
   */
  async handleGiftSub(channelId, event) {
    const settings = settingsRepo.getSettings(channelId);

    if (!settings.sub_notification_enabled) {
      logger.debug(`Sub notification disabled for channel ${channelId}`);
      return;
    }

    const channel = channelRepo.findById(channelId);
    if (!channel) {
      logger.error(`Channel ${channelId} not found`);
      return;
    }

    try {
      // For community gifts (multiple), we might want a different message
      const isAnonymous = event.isAnonymous;
      const gifterName = isAnonymous ? 'An anonymous gifter' : event.gifterDisplayName;

      const message = formatTemplate(settings.gift_sub_notification_template, {
        gifter: gifterName,
        gifter_display: gifterName,
        gift_count: event.amount || 1,
        tier: formatTier(event.tier),
        subscriber: '', // Community gifts don't have a specific recipient
        channel: channel.display_name || channel.twitch_username
      });

      const sanitized = sanitizeMessage(message);
      await this.chatClient.say(channel.twitch_username, sanitized);

      logger.info(`Sent gift sub notification from ${gifterName} (${event.amount} subs) in ${channel.twitch_username}`);
    } catch (error) {
      logger.error('Failed to handle gift sub', {
        channelId,
        gifter: event.gifterName,
        error: error.message
      });
    }
  }
}

module.exports = SubHandler;
