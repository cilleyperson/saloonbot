const channelRepo = require('../database/repositories/channel-repo');
const settingsRepo = require('../database/repositories/settings-repo');
const chatMembershipRepo = require('../database/repositories/chat-membership-repo');
const authRepo = require('../database/repositories/auth-repo');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('channel-manager');

/**
 * Manages channel connections and their EventSub subscriptions
 */
class ChannelManager {
  constructor() {
    this.activeChannels = new Map(); // channelId -> { channel, subscriptions, status }
    this.joinedChats = new Set(); // Set of channel usernames the bot has joined
    this.chatClient = null;
    this.eventSubListener = null;
    this.eventHandler = null;
  }

  /**
   * Set dependencies
   * @param {ChatClient} chatClient - Twurple ChatClient
   * @param {EventSubWsListener} eventSubListener - EventSub listener
   * @param {EventHandler} eventHandler - Event handler
   */
  setDependencies(chatClient, eventSubListener, eventHandler) {
    this.chatClient = chatClient;
    this.eventSubListener = eventSubListener;
    this.eventHandler = eventHandler;
  }

  /**
   * Load and connect to all active channels
   */
  async loadActiveChannels() {
    const channels = channelRepo.findAllActive();
    logger.info(`Loading ${channels.length} active channels`);

    for (const channel of channels) {
      try {
        await this.addChannel(channel.id);
      } catch (error) {
        logger.error(`Failed to add channel ${channel.twitch_username}`, { error: error.message });
      }
    }

    // Load and join all chat memberships
    await this.loadChatMemberships();
  }

  /**
   * Load and join all active chat memberships
   */
  async loadChatMemberships() {
    const targetChannels = chatMembershipRepo.getAllActiveTargetChannels();
    logger.info(`Loading ${targetChannels.length} chat memberships`);

    for (const targetChannel of targetChannels) {
      try {
        await this.joinChat(targetChannel);
      } catch (error) {
        logger.error(`Failed to join chat ${targetChannel}`, { error: error.message });
      }
    }
  }

  /**
   * Add a channel and set up its connections
   * @param {number} channelId - Channel database ID
   */
  async addChannel(channelId) {
    const channel = channelRepo.findById(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    if (this.activeChannels.has(channelId)) {
      logger.debug(`Channel ${channel.twitch_username} already active`);
      return;
    }

    logger.info(`Adding channel: ${channel.twitch_username}`);

    // Ensure settings exist
    settingsRepo.getSettings(channelId);

    // Join the channel's own chat
    await this.joinChat(channel.twitch_username);

    // Subscribe to EventSub events
    const subscriptions = await this.subscribeToEvents(channel);

    // Track the channel
    this.activeChannels.set(channelId, {
      channel,
      subscriptions,
      status: 'connected',
      connectedAt: new Date()
    });

    logger.info(`Channel added: ${channel.twitch_username}`);
  }

  /**
   * Remove a channel and clean up connections
   * @param {number} channelId - Channel database ID
   */
  async removeChannel(channelId) {
    const channelData = this.activeChannels.get(channelId);
    if (!channelData) {
      logger.debug(`Channel ${channelId} not active`);
      return;
    }

    const { channel, subscriptions } = channelData;
    logger.info(`Removing channel: ${channel.twitch_username}`);

    // Unsubscribe from EventSub
    for (const sub of subscriptions) {
      try {
        sub.stop();
      } catch (error) {
        logger.debug(`Error stopping subscription`, { error: error.message });
      }
    }

    // Leave the channel's own chat (if not needed by other memberships)
    await this.leaveChat(channel.twitch_username);

    // Remove from tracking
    this.activeChannels.delete(channelId);
    logger.info(`Channel removed: ${channel.twitch_username}`);
  }

  /**
   * Join a chat channel
   * @param {string} channelName - Twitch username to join
   */
  async joinChat(channelName) {
    const normalizedName = channelName.toLowerCase();

    if (this.joinedChats.has(normalizedName)) {
      logger.debug(`Already in chat: ${normalizedName}`);
      return;
    }

    if (this.chatClient) {
      try {
        await this.chatClient.join(normalizedName);
        this.joinedChats.add(normalizedName);
        logger.info(`Joined chat: ${normalizedName}`);
      } catch (error) {
        logger.error(`Failed to join chat ${normalizedName}`, { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Leave a chat channel (only if not needed by any active channel or membership)
   * @param {string} channelName - Twitch username to leave
   */
  async leaveChat(channelName) {
    const normalizedName = channelName.toLowerCase();

    if (!this.joinedChats.has(normalizedName)) {
      return;
    }

    // Check if any active channel owns this chat
    for (const [, data] of this.activeChannels) {
      if (data.channel.twitch_username === normalizedName) {
        logger.debug(`Cannot leave ${normalizedName}: owned by active channel`);
        return;
      }
    }

    // Check if any active membership needs this chat
    const activeTargets = chatMembershipRepo.getAllActiveTargetChannels();
    if (activeTargets.includes(normalizedName)) {
      logger.debug(`Cannot leave ${normalizedName}: needed by active membership`);
      return;
    }

    if (this.chatClient) {
      try {
        await this.chatClient.part(normalizedName);
        this.joinedChats.delete(normalizedName);
        logger.info(`Left chat: ${normalizedName}`);
      } catch (error) {
        logger.debug(`Error leaving chat ${normalizedName}`, { error: error.message });
      }
    }
  }

  /**
   * Add a chat membership (join an additional channel's chat)
   * @param {number} channelId - The owning channel's ID
   * @param {string} targetChannel - The channel to join
   */
  async addChatMembership(channelId, targetChannel) {
    const normalizedTarget = targetChannel.toLowerCase();

    // Create the membership in database if it doesn't exist
    if (!chatMembershipRepo.exists(channelId, normalizedTarget)) {
      chatMembershipRepo.create(channelId, normalizedTarget);
    } else {
      // Reactivate if it exists but was inactive
      const existing = chatMembershipRepo.findByChannelAndTarget(channelId, normalizedTarget);
      if (existing && !existing.is_active) {
        chatMembershipRepo.update(existing.id, { is_active: true });
      }
    }

    // Join the chat
    await this.joinChat(normalizedTarget);
    logger.info(`Added chat membership: channel ${channelId} -> ${normalizedTarget}`);
  }

  /**
   * Remove a chat membership
   * @param {number} membershipId - The membership ID to remove
   */
  async removeChatMembership(membershipId) {
    const membership = chatMembershipRepo.findById(membershipId);
    if (!membership) {
      return;
    }

    const targetChannel = membership.target_channel;

    // Remove from database
    chatMembershipRepo.remove(membershipId);

    // Leave chat if no longer needed
    await this.leaveChat(targetChannel);

    logger.info(`Removed chat membership ${membershipId} for ${targetChannel}`);
  }

  /**
   * Toggle a chat membership's active status
   * @param {number} membershipId - The membership ID
   */
  async toggleChatMembership(membershipId) {
    const membership = chatMembershipRepo.findById(membershipId);
    if (!membership) {
      return;
    }

    const wasActive = membership.is_active;
    chatMembershipRepo.toggleActive(membershipId);

    if (wasActive) {
      // Was active, now inactive - try to leave
      await this.leaveChat(membership.target_channel);
    } else {
      // Was inactive, now active - join
      await this.joinChat(membership.target_channel);
    }
  }

  /**
   * Get list of all joined chat channels
   * @returns {string[]}
   */
  getJoinedChats() {
    return Array.from(this.joinedChats);
  }

  /**
   * Subscribe to EventSub events for a channel
   * @param {Object} channel - Channel object
   * @returns {Array} Array of subscription handles
   */
  async subscribeToEvents(channel) {
    const subscriptions = [];

    if (!this.eventSubListener || !this.eventHandler) {
      logger.warn('EventSub listener or handler not available');
      return subscriptions;
    }

    // Check if channel has OAuth authentication
    // EventSub subscriptions require the channel owner's token
    const channelAuth = authRepo.getChannelAuth(channel.id);
    if (!channelAuth) {
      logger.warn(`Channel ${channel.twitch_username} is not authenticated. EventSub subscriptions require the channel owner to connect their Twitch account.`);
      return subscriptions;
    }

    const twitchId = channel.twitch_id;

    try {
      // Raid events
      const raidSub = this.eventSubListener.onChannelRaidTo(twitchId, (event) => {
        this.eventHandler.onRaid(channel.id, event);
      });
      subscriptions.push(raidSub);

      // Subscription events
      const subSub = this.eventSubListener.onChannelSubscription(twitchId, (event) => {
        this.eventHandler.onSubscription(channel.id, event);
      });
      subscriptions.push(subSub);

      // Subscription message (resubs)
      const resubSub = this.eventSubListener.onChannelSubscriptionMessage(twitchId, (event) => {
        this.eventHandler.onSubscriptionMessage(channel.id, event);
      });
      subscriptions.push(resubSub);

      // Gift subscriptions
      const giftSub = this.eventSubListener.onChannelSubscriptionGift(twitchId, (event) => {
        this.eventHandler.onSubscriptionGift(channel.id, event);
      });
      subscriptions.push(giftSub);

      logger.debug(`Subscribed to events for ${channel.twitch_username}`);
    } catch (error) {
      logger.error(`Failed to subscribe to events for ${channel.twitch_username}`, { error: error.message });
    }

    return subscriptions;
  }

  /**
   * Get channel status
   * @param {number} channelId - Channel ID
   * @returns {Object|null} Channel status or null
   */
  getChannelStatus(channelId) {
    const channelData = this.activeChannels.get(channelId);
    if (!channelData) {
      return { status: 'disconnected' };
    }

    return {
      status: channelData.status,
      connectedAt: channelData.connectedAt,
      subscriptionCount: channelData.subscriptions.length
    };
  }

  /**
   * Get all active channel IDs
   * @returns {number[]}
   */
  getActiveChannelIds() {
    return Array.from(this.activeChannels.keys());
  }

  /**
   * Get channel by Twitch username from active channels
   * @param {string} username - Twitch username
   * @returns {Object|null}
   */
  getChannelByUsername(username) {
    for (const [, data] of this.activeChannels) {
      if (data.channel.twitch_username === username.toLowerCase()) {
        return data.channel;
      }
    }
    return null;
  }

  /**
   * Get all active channels that have access to a specific chat
   * This includes channels whose own chat it is, and channels with memberships to it
   * @param {string} chatName - The chat name to check
   * @returns {Object[]} Array of { channel, isOwnChat } objects
   */
  getChannelsForChat(chatName) {
    const normalizedChat = chatName.toLowerCase();
    const result = [];

    for (const [, data] of this.activeChannels) {
      const channel = data.channel;
      const isOwnChat = channel.twitch_username.toLowerCase() === normalizedChat;

      if (isOwnChat) {
        result.push({ channel, isOwnChat: true });
      } else {
        // Check if this channel has a membership to the chat
        const memberships = chatMembershipRepo.findByChannel(channel.id, true);
        const hasMembership = memberships.some(m => m.target_channel.toLowerCase() === normalizedChat);
        if (hasMembership) {
          result.push({ channel, isOwnChat: false });
        }
      }
    }

    return result;
  }

  /**
   * Get all active channels
   * @returns {Object[]}
   */
  getActiveChannels() {
    return Array.from(this.activeChannels.values()).map(data => ({
      ...data.channel,
      status: data.status,
      connectedAt: data.connectedAt
    }));
  }

  /**
   * Disconnect all channels
   */
  async disconnectAll() {
    const channelIds = Array.from(this.activeChannels.keys());
    for (const channelId of channelIds) {
      await this.removeChannel(channelId);
    }
    logger.info('All channels disconnected');
  }

  /**
   * Reconnect all channels
   */
  async reconnectAll() {
    await this.disconnectAll();
    await this.loadActiveChannels();
  }
}

module.exports = ChannelManager;
