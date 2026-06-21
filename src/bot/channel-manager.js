const channelRepo = require('../database/repositories/channel-repo');
const settingsRepo = require('../database/repositories/settings-repo');
const chatMembershipRepo = require('../database/repositories/chat-membership-repo');
const authManager = require('./auth-manager');
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
   * Report chat-membership health: what the bot intends to be in (expected) vs
   * what the IRC connection is actually in (actual). Drift -- expected channels
   * missing from actual -- is the "connected but absent from chat" symptom that
   * appears when a reconnect doesn't rejoin channels.
   *
   *   joinedChats (intent) ──┐
   *                          ├─▶ diff ─▶ missing[] (the bug) / extra[]
   *   chatClient.currentChannels (reality) ──┘
   *
   * @returns {{connected: (boolean|null), expectedCount: number, joinedCount: number,
   *   missing: string[], extra: string[], healthy: boolean, expected: string[], actual: string[]}}
   */
  getMembershipHealth() {
    const norm = (c) => String(c).replace(/^#/, '').toLowerCase();
    const expected = Array.from(this.joinedChats).map(norm).sort();

    let actual = [];
    let connected = null;
    if (this.chatClient) {
      if (Array.isArray(this.chatClient.currentChannels)) {
        actual = this.chatClient.currentChannels.map(norm).sort();
      }
      if (typeof this.chatClient.isConnected === 'boolean') {
        connected = this.chatClient.isConnected;
      }
    }

    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missing = expected.filter((c) => !actualSet.has(c));
    const extra = actual.filter((c) => !expectedSet.has(c));

    return {
      connected,
      expectedCount: expected.length,
      joinedCount: actual.length,
      missing,
      extra,
      healthy: missing.length === 0,
      expected,
      actual
    };
  }

  /**
   * Belt-and-suspenders rejoin: join any expected chat that is not currently
   * joined. The primary rejoin mechanism is twurple's rejoinChannelsOnReconnect;
   * this is a safety net for channels it misses. Idempotent -- a no-op when
   * membership is healthy.
   * @returns {Promise<string[]>} channels that were re-joined
   */
  async rejoinMissing() {
    const health = this.getMembershipHealth();
    if (health.missing.length === 0) {
      return [];
    }

    logger.warn(`Rejoining ${health.missing.length} missing chat(s) after reconnect`, { missing: health.missing });
    const rejoined = [];
    for (const name of health.missing) {
      if (!this.chatClient) {
        break;
      }
      try {
        await this.chatClient.join(name);
        rejoined.push(name);
      } catch (error) {
        logger.error(`Failed to rejoin chat ${name}`, { error: error.message });
      }
    }
    return rejoined;
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

    const twitchId = channel.twitch_id;

    // Verify we have a token registered for this channel
    // This is required for EventSub to make API calls on behalf of the channel
    if (!authManager.hasChannelToken(twitchId)) {
      logger.warn(`No token found for channel ${channel.twitch_username} (Twitch ID: ${twitchId}) - skipping EventSub subscriptions`);
      logger.info(`Channel ${channel.twitch_username} needs to re-authorize via OAuth to enable EventSub features`);
      return subscriptions;
    }

    try {
      // Raid events
      const raidSub = this.eventSubListener.onChannelRaidTo(twitchId, (event) => {
        this.eventHandler.onRaid(channel.id, event);
      });
      subscriptions.push(raidSub);
      logger.debug(`Subscribed to raid events for ${channel.twitch_username}`);
    } catch (error) {
      logger.error(`Failed to subscribe to raid events for ${channel.twitch_username}`, { error: error.message });
    }

    try {
      // Subscription events
      const subSub = this.eventSubListener.onChannelSubscription(twitchId, (event) => {
        this.eventHandler.onSubscription(channel.id, event);
      });
      subscriptions.push(subSub);
      logger.debug(`Subscribed to subscription events for ${channel.twitch_username}`);
    } catch (error) {
      logger.error(`Failed to subscribe to subscription events for ${channel.twitch_username}`, { error: error.message });
    }

    try {
      // Subscription message (resubs)
      const resubSub = this.eventSubListener.onChannelSubscriptionMessage(twitchId, (event) => {
        this.eventHandler.onSubscriptionMessage(channel.id, event);
      });
      subscriptions.push(resubSub);
      logger.debug(`Subscribed to resub message events for ${channel.twitch_username}`);
    } catch (error) {
      logger.error(`Failed to subscribe to resub message events for ${channel.twitch_username}`, { error: error.message });
    }

    try {
      // Gift subscriptions
      const giftSub = this.eventSubListener.onChannelSubscriptionGift(twitchId, (event) => {
        this.eventHandler.onSubscriptionGift(channel.id, event);
      });
      subscriptions.push(giftSub);
      logger.debug(`Subscribed to gift sub events for ${channel.twitch_username}`);
    } catch (error) {
      logger.error(`Failed to subscribe to gift sub events for ${channel.twitch_username}`, { error: error.message });
    }

    if (subscriptions.length > 0) {
      logger.info(`Created ${subscriptions.length} EventSub subscriptions for ${channel.twitch_username}`);
    }

    return subscriptions;
  }

  /**
   * Re-create EventSub subscriptions for the channel with this Twitch ID.
   * Called after the channel's token recovers -- subscriptions can drop silently
   * when a token goes bad. Stops the old handles first to avoid duplicates.
   * @param {string} twitchId
   */
  async resubscribeByTwitchId(twitchId) {
    for (const [, data] of this.activeChannels) {
      if (String(data.channel.twitch_id) !== String(twitchId)) {
        continue;
      }
      logger.info(`Re-subscribing EventSub for ${data.channel.twitch_username} after token recovery`);
      for (const sub of data.subscriptions) {
        try {
          sub.stop();
        } catch (error) {
          logger.debug('Error stopping old subscription', { error: error.message });
        }
      }
      try {
        data.subscriptions = await this.subscribeToEvents(data.channel);
      } catch (error) {
        logger.error(`Failed to re-subscribe EventSub for ${data.channel.twitch_username}`, { error: error.message });
      }
      return;
    }
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
