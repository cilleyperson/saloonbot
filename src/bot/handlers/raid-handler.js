const settingsRepo = require('../../database/repositories/settings-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { formatTemplate, sanitizeMessage } = require('../../utils/template');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('raid-handler');

/**
 * Handles raid events and sends shoutout messages
 */
class RaidHandler {
  constructor(chatClient, apiClient) {
    this.chatClient = chatClient;
    this.apiClient = apiClient;
  }

  /**
   * Handle an incoming raid event
   * @param {number} channelId - Database channel ID
   * @param {Object} event - Twitch raid event
   */
  async handle(channelId, event) {
    // Get channel settings
    const settings = settingsRepo.getSettings(channelId);

    if (!settings.raid_shoutout_enabled) {
      logger.debug(`Raid shoutout disabled for channel ${channelId}`);
      return;
    }

    // Get channel info
    const channel = channelRepo.findById(channelId);
    if (!channel) {
      logger.error(`Channel ${channelId} not found`);
      return;
    }

    try {
      // Get raider info for additional template variables
      let raiderGame = 'Just Chatting';

      if (this.apiClient) {
        try {
          const raiderChannel = await this.apiClient.channels.getChannelInfoById(event.raidingBroadcasterId);
          if (raiderChannel) {
            raiderGame = raiderChannel.gameName || 'Just Chatting';
          }
        } catch (error) {
          logger.debug('Could not fetch raider channel info', { error: error.message });
        }
      }

      // Format the shoutout message
      const message = formatTemplate(settings.raid_shoutout_template, {
        raider: event.raidingBroadcasterName,
        raider_display: event.raidingBroadcasterDisplayName,
        viewers: event.viewers,
        game: raiderGame,
        channel: channel.display_name || channel.twitch_username
      });

      // Send the message
      const sanitized = sanitizeMessage(message);
      await this.chatClient.say(channel.twitch_username, sanitized);

      logger.info(`Sent raid shoutout for ${event.raidingBroadcasterDisplayName} in ${channel.twitch_username}`);

      // Optionally use native Twitch shoutout
      if (this.apiClient) {
        try {
          await this.apiClient.chat.shoutoutUser(
            event.raidedBroadcasterId,
            event.raidingBroadcasterId
          );
          logger.debug('Sent native Twitch shoutout');
        } catch (error) {
          // Native shoutout may fail due to cooldowns or permissions
          logger.debug('Native shoutout failed (may be on cooldown)', { error: error.message });
        }
      }
    } catch (error) {
      logger.error('Failed to handle raid', {
        channelId,
        raider: event.raidingBroadcasterName,
        error: error.message
      });
    }
  }
}

module.exports = RaidHandler;
