const express = require('express');
const router = express.Router();
const channelRepo = require('../../database/repositories/channel-repo');
const counterRepo = require('../../database/repositories/counter-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('counter-routes');

/**
 * List counters for a channel
 */
router.get('/:id/counters', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const counters = counterRepo.findByChannel(channelId);

  res.render('counters/list', {
    title: `Counters - ${channel.display_name || channel.twitch_username}`,
    channel,
    counters
  });
});

/**
 * New counter form
 */
router.get('/:id/counters/new', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  res.render('counters/form', {
    title: `New Counter - ${channel.display_name || channel.twitch_username}`,
    channel,
    counter: null,
    chatMemberships,
    emojiPositions: counterRepo.EMOJI_POSITIONS,
    isNew: true
  });
});

/**
 * Create counter
 */
router.post('/:id/counters', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    let { counter_name, response_template, initial_count, chat_scope, emoji, emoji_position } = req.body;
    let chatScopes = req.body.chat_scopes || [];

    // Ensure chatScopes is an array
    if (!Array.isArray(chatScopes)) {
      chatScopes = chatScopes ? [chatScopes] : [];
    }

    logger.debug('Create counter request', { channelId, body: req.body });

    // Validate counter_name exists
    if (!counter_name) {
      req.flash('error', 'Counter name is required');
      return res.redirect(`/channels/${channelId}/counters/new`);
    }

    // Clean up counter name
    counter_name = counter_name.toLowerCase().replace(/\+\+$/, '').trim();

    // Validate
    if (!counter_name || !counter_name.match(/^[a-z0-9_]+$/)) {
      req.flash('error', 'Counter name must be alphanumeric (letters, numbers, underscores only)');
      return res.redirect(`/channels/${channelId}/counters/new`);
    }

    if (counterRepo.exists(channelId, counter_name)) {
      req.flash('error', `Counter ${counter_name}++ already exists`);
      return res.redirect(`/channels/${channelId}/counters/new`);
    }

    // Validate chat scope
    if (chat_scope === 'selected' && chatScopes.length === 0) {
      req.flash('error', 'At least one chat must be selected when using "Selected Chats Only"');
      return res.redirect(`/channels/${channelId}/counters/new`);
    }

    counterRepo.create(channelId, counter_name, {
      initialCount: parseInt(initial_count, 10) || 0,
      responseTemplate: response_template || '{counter} count: {count}',
      chatScope: chat_scope || 'all',
      chatScopes: chatScopes,
      emoji: emoji && emoji.trim() ? emoji.trim() : null,
      emojiPosition: emoji_position || 'start'
    });

    logger.info(`Counter created: ${counter_name}++ for ${channel.twitch_username}`);
    req.flash('success', `Counter ${counter_name}++ created successfully`);
    res.redirect(`/channels/${channelId}/counters`);
  } catch (err) {
    logger.error('Failed to create counter', { error: err.message });
    req.flash('error', `Failed to create counter: ${err.message}`);
    res.redirect(`/channels/${channelId}/counters/new`);
  }
});

/**
 * Edit counter form
 */
router.get('/:id/counters/:cntId/edit', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cntId = parseInt(req.params.cntId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const counter = counterRepo.findById(cntId);
  if (!counter || counter.channel_id !== channelId) {
    req.flash('error', 'Counter not found');
    return res.redirect(`/channels/${channelId}/counters`);
  }

  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  res.render('counters/form', {
    title: `Edit ${counter.counter_name}++ - ${channel.display_name || channel.twitch_username}`,
    channel,
    counter,
    chatMemberships,
    emojiPositions: counterRepo.EMOJI_POSITIONS,
    isNew: false
  });
});

/**
 * Update counter
 */
router.post('/:id/counters/:cntId', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cntId = parseInt(req.params.cntId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const counter = counterRepo.findById(cntId);
  if (!counter || counter.channel_id !== channelId) {
    req.flash('error', 'Counter not found');
    return res.redirect(`/channels/${channelId}/counters`);
  }

  try {
    const { response_template, is_enabled, chat_scope, emoji, emoji_position } = req.body;
    let chatScopes = req.body.chat_scopes || [];

    // Ensure chatScopes is an array
    if (!Array.isArray(chatScopes)) {
      chatScopes = chatScopes ? [chatScopes] : [];
    }

    // Validate chat scope
    if (chat_scope === 'selected' && chatScopes.length === 0) {
      req.flash('error', 'At least one chat must be selected when using "Selected Chats Only"');
      return res.redirect(`/channels/${channelId}/counters/${cntId}/edit`);
    }

    counterRepo.update(cntId, {
      response_template: response_template || '{counter} count: {count}',
      is_enabled: is_enabled === 'on',
      chat_scope: chat_scope || 'all',
      chatScopes: chatScopes,
      emoji: emoji && emoji.trim() ? emoji.trim() : null,
      emoji_position: emoji_position || 'start'
    });

    logger.info(`Counter updated: ${counter.counter_name}++ for ${channel.twitch_username}`);
    req.flash('success', `Counter ${counter.counter_name}++ updated successfully`);
    res.redirect(`/channels/${channelId}/counters`);
  } catch (err) {
    logger.error('Failed to update counter', { error: err.message });
    req.flash('error', `Failed to update counter: ${err.message}`);
    res.redirect(`/channels/${channelId}/counters/${cntId}/edit`);
  }
});

/**
 * Reset counter to 0
 */
router.post('/:id/counters/:cntId/reset', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cntId = parseInt(req.params.cntId, 10);

  const counter = counterRepo.findById(cntId);
  if (!counter || counter.channel_id !== channelId) {
    req.flash('error', 'Counter not found');
    return res.redirect(`/channels/${channelId}/counters`);
  }

  try {
    counterRepo.reset(cntId, 0);
    logger.info(`Counter reset: ${counter.counter_name}++`);
    req.flash('success', `Counter ${counter.counter_name}++ has been reset to 0`);
  } catch (err) {
    req.flash('error', `Failed to reset counter: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/counters`);
});

/**
 * Toggle counter enabled
 */
router.post('/:id/counters/:cntId/toggle', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cntId = parseInt(req.params.cntId, 10);

  const counter = counterRepo.findById(cntId);
  if (!counter || counter.channel_id !== channelId) {
    req.flash('error', 'Counter not found');
    return res.redirect(`/channels/${channelId}/counters`);
  }

  try {
    counterRepo.toggleEnabled(cntId);
    req.flash('success', `Counter ${counter.counter_name}++ ${counter.is_enabled ? 'disabled' : 'enabled'}`);
  } catch (err) {
    req.flash('error', `Failed to toggle counter: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/counters`);
});

/**
 * Delete counter
 */
router.post('/:id/counters/:cntId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cntId = parseInt(req.params.cntId, 10);

  const counter = counterRepo.findById(cntId);
  if (!counter || counter.channel_id !== channelId) {
    req.flash('error', 'Counter not found');
    return res.redirect(`/channels/${channelId}/counters`);
  }

  try {
    counterRepo.remove(cntId);
    logger.info(`Counter deleted: ${counter.counter_name}++`);
    req.flash('success', `Counter ${counter.counter_name}++ deleted`);
  } catch (err) {
    req.flash('error', `Failed to delete counter: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/counters`);
});

module.exports = router;
