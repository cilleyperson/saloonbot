const express = require('express');
const router = express.Router();
const channelRepo = require('../../database/repositories/channel-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const botCore = require('../../bot');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('chat-membership-routes');

/**
 * List chat memberships for a channel
 */
router.get('/:id/chat-memberships', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const memberships = chatMembershipRepo.findByChannel(channelId);
  const joinedChats = botCore.channelManager?.getJoinedChats() || [];

  res.render('chat-memberships/list', {
    title: `Chat Memberships - ${channel.display_name || channel.twitch_username}`,
    channel,
    memberships,
    joinedChats
  });
});

/**
 * New chat membership form
 */
router.get('/:id/chat-memberships/new', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  res.render('chat-memberships/form', {
    title: `Join Chat - ${channel.display_name || channel.twitch_username}`,
    channel,
    membership: null,
    isNew: true
  });
});

/**
 * Create chat membership
 */
router.post('/:id/chat-memberships', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    let { target_channel } = req.body;

    logger.debug('Create chat membership request', { channelId, body: req.body });

    // Validate target_channel exists
    if (!target_channel) {
      req.flash('error', 'Target channel is required');
      return res.redirect(`/channels/${channelId}/chat-memberships/new`);
    }

    // Clean up target channel name
    target_channel = target_channel.toLowerCase().replace(/^@/, '').trim();

    // Validate format
    if (!target_channel || !target_channel.match(/^[a-z0-9_]+$/)) {
      req.flash('error', 'Channel name must be alphanumeric (letters, numbers, underscores only)');
      return res.redirect(`/channels/${channelId}/chat-memberships/new`);
    }

    // Check if already exists
    if (chatMembershipRepo.exists(channelId, target_channel)) {
      req.flash('error', `Already configured to join ${target_channel}`);
      return res.redirect(`/channels/${channelId}/chat-memberships/new`);
    }

    // Prevent joining own channel (it's automatic)
    if (target_channel === channel.twitch_username) {
      req.flash('error', 'The bot automatically joins your own channel');
      return res.redirect(`/channels/${channelId}/chat-memberships/new`);
    }

    // Add the membership and join if bot is running
    if (botCore.isRunning() && botCore.channelManager) {
      await botCore.channelManager.addChatMembership(channelId, target_channel);
    } else {
      chatMembershipRepo.create(channelId, target_channel);
    }

    logger.info(`Chat membership created: ${channel.twitch_username} -> ${target_channel}`);
    req.flash('success', `Now joining chat: ${target_channel}`);
    res.redirect(`/channels/${channelId}/chat-memberships`);
  } catch (err) {
    logger.error('Failed to create chat membership', { error: err.message });
    req.flash('error', `Failed to join chat: ${err.message}`);
    res.redirect(`/channels/${channelId}/chat-memberships/new`);
  }
});

/**
 * Toggle chat membership active status
 */
router.post('/:id/chat-memberships/:memId/toggle', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const memId = parseInt(req.params.memId, 10);

  const membership = chatMembershipRepo.findById(memId);
  if (!membership || membership.channel_id !== channelId) {
    req.flash('error', 'Chat membership not found');
    return res.redirect(`/channels/${channelId}/chat-memberships`);
  }

  try {
    if (botCore.isRunning() && botCore.channelManager) {
      await botCore.channelManager.toggleChatMembership(memId);
    } else {
      chatMembershipRepo.toggleActive(memId);
    }

    const updated = chatMembershipRepo.findById(memId);
    req.flash('success', `Chat ${membership.target_channel} ${updated.is_active ? 'enabled' : 'disabled'}`);
  } catch (err) {
    req.flash('error', `Failed to toggle chat: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/chat-memberships`);
});

/**
 * Delete chat membership
 */
router.post('/:id/chat-memberships/:memId/delete', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const memId = parseInt(req.params.memId, 10);

  const membership = chatMembershipRepo.findById(memId);
  if (!membership || membership.channel_id !== channelId) {
    req.flash('error', 'Chat membership not found');
    return res.redirect(`/channels/${channelId}/chat-memberships`);
  }

  try {
    if (botCore.isRunning() && botCore.channelManager) {
      await botCore.channelManager.removeChatMembership(memId);
    } else {
      chatMembershipRepo.remove(memId);
    }

    logger.info(`Chat membership deleted: ${membership.target_channel}`);
    req.flash('success', `Removed chat: ${membership.target_channel}`);
  } catch (err) {
    req.flash('error', `Failed to remove chat: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/chat-memberships`);
});

module.exports = router;
