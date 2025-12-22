const express = require('express');
const router = express.Router();
const channelRepo = require('../../database/repositories/channel-repo');
const settingsRepo = require('../../database/repositories/settings-repo');
const commandRepo = require('../../database/repositories/command-repo');
const counterRepo = require('../../database/repositories/counter-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const botCore = require('../../bot');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('channel-routes');

/**
 * List all channels
 */
router.get('/', (req, res) => {
  const channels = channelRepo.findAll();

  const channelsWithStatus = channels.map(channel => ({
    ...channel,
    status: botCore.channelManager?.getChannelStatus(channel.id) || { status: 'disconnected' },
    commandCount: commandRepo.count(channel.id),
    counterCount: counterRepo.count(channel.id)
  }));

  res.render('channels/list', {
    title: 'Channels',
    channels: channelsWithStatus
  });
});

/**
 * Add new channel - redirects to OAuth
 */
router.get('/add', (req, res) => {
  res.redirect('/auth/channel');
});

/**
 * View channel details
 */
router.get('/:id', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const settings = settingsRepo.getSettings(channelId);
  const commands = commandRepo.findByChannel(channelId);
  const counters = counterRepo.findByChannel(channelId);
  const chatMemberships = chatMembershipRepo.findByChannel(channelId);
  const status = botCore.channelManager?.getChannelStatus(channelId) || { status: 'disconnected' };

  res.render('channels/detail', {
    title: channel.display_name || channel.twitch_username,
    channel,
    settings,
    commands,
    counters,
    chatMemberships,
    status
  });
});

/**
 * Channel settings page
 */
router.get('/:id/settings', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const settings = settingsRepo.getSettings(channelId);
  const defaults = settingsRepo.getDefaults();

  res.render('channels/settings', {
    title: `Settings - ${channel.display_name || channel.twitch_username}`,
    channel,
    settings,
    defaults
  });
});

/**
 * Update channel settings
 */
router.post('/:id/settings', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    const {
      raid_shoutout_enabled,
      raid_shoutout_template,
      sub_notification_enabled,
      sub_notification_template,
      resub_notification_template,
      gift_sub_notification_template
    } = req.body;

    settingsRepo.updateSettings(channelId, {
      raid_shoutout_enabled: raid_shoutout_enabled === 'on',
      raid_shoutout_template,
      sub_notification_enabled: sub_notification_enabled === 'on',
      sub_notification_template,
      resub_notification_template,
      gift_sub_notification_template
    });

    logger.info(`Settings updated for channel ${channel.twitch_username}`);
    req.flash('success', 'Settings updated successfully');
  } catch (err) {
    logger.error('Failed to update settings', { error: err.message });
    req.flash('error', `Failed to update settings: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/settings`);
});

/**
 * Disconnect channel
 */
router.post('/:id/disconnect', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    // Remove from bot if running
    if (botCore.isRunning()) {
      await botCore.removeChannel(channelId);
    }

    // Deactivate channel
    channelRepo.deactivate(channelId);

    logger.info(`Channel disconnected: ${channel.twitch_username}`);
    req.flash('success', `Channel ${channel.display_name} has been disconnected`);
  } catch (err) {
    logger.error('Failed to disconnect channel', { error: err.message });
    req.flash('error', `Failed to disconnect channel: ${err.message}`);
  }

  res.redirect('/channels');
});

/**
 * Reconnect channel
 */
router.post('/:id/reconnect', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    // Activate channel
    channelRepo.activate(channelId);

    // Add to bot if running
    if (botCore.isRunning()) {
      await botCore.addChannel(channelId);
    }

    logger.info(`Channel reconnected: ${channel.twitch_username}`);
    req.flash('success', `Channel ${channel.display_name} has been reconnected`);
  } catch (err) {
    logger.error('Failed to reconnect channel', { error: err.message });
    req.flash('error', `Failed to reconnect channel: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}`);
});

/**
 * Delete channel permanently
 */
router.post('/:id/delete', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    // Remove from bot if running
    if (botCore.isRunning()) {
      await botCore.removeChannel(channelId);
    }

    // Delete channel (cascades to settings, commands, counters, auth)
    channelRepo.remove(channelId);

    logger.info(`Channel deleted: ${channel.twitch_username}`);
    req.flash('success', `Channel ${channel.display_name} has been deleted`);
  } catch (err) {
    logger.error('Failed to delete channel', { error: err.message });
    req.flash('error', `Failed to delete channel: ${err.message}`);
  }

  res.redirect('/channels');
});

module.exports = router;
