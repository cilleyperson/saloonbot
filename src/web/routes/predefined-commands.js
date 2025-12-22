const express = require('express');
const router = express.Router();
const channelRepo = require('../../database/repositories/channel-repo');
const predefinedSettingsRepo = require('../../database/repositories/predefined-settings-repo');
const magic8ballRepo = require('../../database/repositories/magic-8ball-repo');
const dictionaryRepo = require('../../database/repositories/dictionary-repo');
const rpsStatsRepo = require('../../database/repositories/rps-stats-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('predefined-command-routes');

/**
 * List predefined commands for a channel
 */
router.get('/:id/predefined', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const settings = predefinedSettingsRepo.findByChannel(channelId);
  const commandInfos = settings.map(s => ({
    ...s,
    info: predefinedSettingsRepo.getCommandInfo(s.command_name)
  }));

  res.render('predefined-commands/list', {
    title: `Predefined Commands - ${channel.display_name || channel.twitch_username}`,
    channel,
    commands: commandInfos
  });
});

/**
 * Edit predefined command settings
 */
router.get('/:id/predefined/:name', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const commandName = req.params.name;

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  if (!predefinedSettingsRepo.PREDEFINED_COMMANDS.includes(commandName)) {
    req.flash('error', 'Invalid predefined command');
    return res.redirect(`/channels/${channelId}/predefined`);
  }

  const settings = predefinedSettingsRepo.getSettings(channelId, commandName);
  const commandInfo = predefinedSettingsRepo.getCommandInfo(commandName);
  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  res.render('predefined-commands/settings', {
    title: `${commandInfo.displayName} Settings - ${channel.display_name || channel.twitch_username}`,
    channel,
    settings,
    commandInfo,
    chatMemberships
  });
});

/**
 * Update predefined command settings
 */
router.post('/:id/predefined/:name', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const commandName = req.params.name;

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  if (!predefinedSettingsRepo.PREDEFINED_COMMANDS.includes(commandName)) {
    req.flash('error', 'Invalid predefined command');
    return res.redirect(`/channels/${channelId}/predefined`);
  }

  try {
    const { cooldown_seconds, is_enabled, chat_scope } = req.body;
    let chatScopes = req.body.chat_scopes || [];

    if (!Array.isArray(chatScopes)) {
      chatScopes = chatScopes ? [chatScopes] : [];
    }

    // Validate chat scope
    if (chat_scope === 'selected' && chatScopes.length === 0) {
      req.flash('error', 'At least one chat must be selected when using "Selected Chats Only"');
      return res.redirect(`/channels/${channelId}/predefined/${commandName}`);
    }

    const settings = predefinedSettingsRepo.getSettings(channelId, commandName);

    predefinedSettingsRepo.update(settings.id, {
      cooldown_seconds: parseInt(cooldown_seconds, 10) || 5,
      is_enabled: is_enabled === 'on',
      chat_scope: chat_scope || 'all',
      chatScopes: chatScopes
    });

    const commandInfo = predefinedSettingsRepo.getCommandInfo(commandName);
    logger.info(`Predefined command ${commandName} updated for ${channel.twitch_username}`);
    req.flash('success', `${commandInfo.displayName} settings updated`);
    res.redirect(`/channels/${channelId}/predefined`);
  } catch (err) {
    logger.error('Failed to update predefined command', { error: err.message });
    req.flash('error', `Failed to update settings: ${err.message}`);
    res.redirect(`/channels/${channelId}/predefined/${commandName}`);
  }
});

/**
 * Toggle predefined command enabled
 */
router.post('/:id/predefined/:name/toggle', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const commandName = req.params.name;

  if (!predefinedSettingsRepo.PREDEFINED_COMMANDS.includes(commandName)) {
    req.flash('error', 'Invalid predefined command');
    return res.redirect(`/channels/${channelId}/predefined`);
  }

  try {
    const settings = predefinedSettingsRepo.getSettings(channelId, commandName);
    predefinedSettingsRepo.toggleEnabled(settings.id);

    const commandInfo = predefinedSettingsRepo.getCommandInfo(commandName);
    req.flash('success', `${commandInfo.displayName} ${settings.is_enabled ? 'disabled' : 'enabled'}`);
  } catch (err) {
    req.flash('error', `Failed to toggle command: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined`);
});

// ================== MAGIC 8 BALL RESPONSES ==================

/**
 * List Magic 8 Ball responses
 */
router.get('/:id/predefined/ball/responses', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const responses = magic8ballRepo.findAll();
  const counts = magic8ballRepo.countByType();

  res.render('predefined-commands/magic-8ball', {
    title: `Magic 8 Ball Responses - ${channel.display_name || channel.twitch_username}`,
    channel,
    responses,
    counts,
    responseTypes: magic8ballRepo.RESPONSE_TYPES
  });
});

/**
 * Add Magic 8 Ball response
 */
router.post('/:id/predefined/ball/responses', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const { response_text, response_type } = req.body;

  try {
    if (!response_text || response_text.trim().length === 0) {
      req.flash('error', 'Response text is required');
      return res.redirect(`/channels/${channelId}/predefined/ball/responses`);
    }

    magic8ballRepo.create(response_text.trim(), response_type || 'neutral');
    req.flash('success', 'Response added successfully');
  } catch (err) {
    req.flash('error', `Failed to add response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/ball/responses`);
});

/**
 * Update Magic 8 Ball response
 */
router.post('/:id/predefined/ball/responses/:respId', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const respId = parseInt(req.params.respId, 10);
  const { response_text, response_type } = req.body;

  try {
    if (!response_text || response_text.trim().length === 0) {
      req.flash('error', 'Response text is required');
      return res.redirect(`/channels/${channelId}/predefined/ball/responses`);
    }

    magic8ballRepo.update(respId, {
      response_text: response_text.trim(),
      response_type: response_type || 'neutral'
    });
    req.flash('success', 'Response updated successfully');
  } catch (err) {
    req.flash('error', `Failed to update response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/ball/responses`);
});

/**
 * Toggle Magic 8 Ball response active
 */
router.post('/:id/predefined/ball/responses/:respId/toggle', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const respId = parseInt(req.params.respId, 10);

  try {
    magic8ballRepo.toggleActive(respId);
    req.flash('success', 'Response toggled');
  } catch (err) {
    req.flash('error', `Failed to toggle response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/ball/responses`);
});

/**
 * Delete Magic 8 Ball response
 */
router.post('/:id/predefined/ball/responses/:respId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const respId = parseInt(req.params.respId, 10);

  try {
    magic8ballRepo.remove(respId);
    req.flash('success', 'Response deleted');
  } catch (err) {
    req.flash('error', `Failed to delete response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/ball/responses`);
});

// ================== DICTIONARY DEFINITIONS ==================

/**
 * List custom definitions
 */
router.get('/:id/predefined/define/definitions', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const definitions = dictionaryRepo.findByChannel(channelId);

  res.render('predefined-commands/dictionary', {
    title: `Custom Definitions - ${channel.display_name || channel.twitch_username}`,
    channel,
    definitions
  });
});

/**
 * Add custom definition
 */
router.post('/:id/predefined/define/definitions', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const { word, definition, part_of_speech } = req.body;

  try {
    if (!word || word.trim().length === 0) {
      req.flash('error', 'Word is required');
      return res.redirect(`/channels/${channelId}/predefined/define/definitions`);
    }

    if (!definition || definition.trim().length === 0) {
      req.flash('error', 'Definition is required');
      return res.redirect(`/channels/${channelId}/predefined/define/definitions`);
    }

    dictionaryRepo.create(channelId, word.trim(), definition.trim(), part_of_speech?.trim() || null);
    req.flash('success', `Definition for "${word}" added`);
  } catch (err) {
    req.flash('error', `Failed to add definition: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/define/definitions`);
});

/**
 * Update custom definition
 */
router.post('/:id/predefined/define/definitions/:defId', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const defId = parseInt(req.params.defId, 10);
  const { word, definition, part_of_speech } = req.body;

  try {
    if (!word || word.trim().length === 0) {
      req.flash('error', 'Word is required');
      return res.redirect(`/channels/${channelId}/predefined/define/definitions`);
    }

    if (!definition || definition.trim().length === 0) {
      req.flash('error', 'Definition is required');
      return res.redirect(`/channels/${channelId}/predefined/define/definitions`);
    }

    dictionaryRepo.update(defId, {
      word: word.trim(),
      definition: definition.trim(),
      part_of_speech: part_of_speech?.trim() || null
    });
    req.flash('success', 'Definition updated');
  } catch (err) {
    req.flash('error', `Failed to update definition: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/define/definitions`);
});

/**
 * Delete custom definition
 */
router.post('/:id/predefined/define/definitions/:defId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const defId = parseInt(req.params.defId, 10);

  try {
    dictionaryRepo.remove(defId);
    req.flash('success', 'Definition deleted');
  } catch (err) {
    req.flash('error', `Failed to delete definition: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/define/definitions`);
});

// ================== RPS STATS ==================

/**
 * View RPS leaderboard
 */
router.get('/:id/predefined/rps/stats', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const leaderboard = rpsStatsRepo.getLeaderboard(channelId, 20);
  const totalGames = rpsStatsRepo.getTotalGames(channelId);
  const playerCount = rpsStatsRepo.getPlayerCount(channelId);

  // Add win percentage to each entry
  const leaderboardWithPct = leaderboard.map(stats => ({
    ...stats,
    win_percentage: rpsStatsRepo.calculateWinPercentage(stats)
  }));

  res.render('predefined-commands/rps', {
    title: `RPS Leaderboard - ${channel.display_name || channel.twitch_username}`,
    channel,
    leaderboard: leaderboardWithPct,
    totalGames,
    playerCount
  });
});

/**
 * Reset user RPS stats
 */
router.post('/:id/predefined/rps/stats/:userId/reset', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const userId = req.params.userId;

  try {
    rpsStatsRepo.resetStats(channelId, userId);
    req.flash('success', 'User stats reset');
  } catch (err) {
    req.flash('error', `Failed to reset stats: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/predefined/rps/stats`);
});

module.exports = router;
