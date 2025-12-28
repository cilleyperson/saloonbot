const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const authManager = require('../../bot/auth-manager');
const channelRepo = require('../../database/repositories/channel-repo');
const settingsRepo = require('../../database/repositories/settings-repo');
const botCore = require('../../bot');
const config = require('../../config');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('auth-routes');

/**
 * Initiate bot OAuth flow
 */
router.get('/bot', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthType = 'bot';

  const authUrl = authManager.getBotAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * Initiate channel OAuth flow
 */
router.get('/channel', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthType = 'channel';

  const authUrl = authManager.getChannelAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * Unified OAuth callback handler
 * Routes to appropriate handler based on session oauthType
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const oauthType = req.session.oauthType;

  // Determine redirect on error based on type
  const errorRedirect = oauthType === 'channel' ? '/channels' : '/';

  if (error) {
    logger.error('OAuth error', { error, type: oauthType });
    req.flash('error', `Authentication failed: ${error}`);
    return res.redirect(errorRedirect);
  }

  // Validate state
  if (state !== req.session.oauthState) {
    logger.error('OAuth state mismatch', { type: oauthType });
    req.flash('error', 'Authentication failed: Invalid state');
    return res.redirect(errorRedirect);
  }

  // Route to appropriate handler
  if (oauthType === 'bot') {
    return handleBotCallback(req, res, code);
  } else if (oauthType === 'channel') {
    return handleChannelCallback(req, res, code);
  } else {
    logger.error('Unknown OAuth type', { type: oauthType });
    req.flash('error', 'Authentication failed: Unknown auth type');
    return res.redirect('/');
  }
});

/**
 * Handle bot OAuth callback
 */
async function handleBotCallback(req, res, code) {
  delete req.session.oauthState;
  delete req.session.oauthType;

  try {
    // Exchange code for tokens
    const tokens = await authManager.exchangeCode(code, config.twitch.callbackUrl);

    // Get user info (includes Twitch ID)
    const userInfo = await authManager.getUserInfo(tokens.accessToken);
    if (!userInfo) {
      throw new Error('Failed to get user info');
    }

    // Save bot auth with Twitch ID for multi-user auth provider
    await authManager.saveBotAuth(tokens, userInfo.id, userInfo.login);

    // Try to reinitialize and start the bot
    const initialized = await botCore.initialize();
    if (initialized && !botCore.isRunning()) {
      await botCore.start();
    }

    logger.info(`Bot authenticated as: ${userInfo.login} (Twitch ID: ${userInfo.id})`);
    req.flash('success', `Bot authenticated as ${userInfo.display_name}`);
    res.redirect('/');
  } catch (err) {
    logger.error('Bot OAuth callback error', { error: err.message });
    req.flash('error', `Authentication failed: ${err.message}`);
    res.redirect('/');
  }
}

/**
 * Handle channel OAuth callback
 */
async function handleChannelCallback(req, res, code) {
  delete req.session.oauthState;
  delete req.session.oauthType;

  try {
    // Exchange code for tokens
    const tokens = await authManager.exchangeCode(code, config.twitch.callbackUrl);

    // Get user info (includes Twitch ID)
    const userInfo = await authManager.getUserInfo(tokens.accessToken);
    if (!userInfo) {
      throw new Error('Failed to get user info');
    }

    // Check if channel already exists
    let channel = channelRepo.findByTwitchId(userInfo.id);

    if (channel) {
      // Update existing channel
      channelRepo.update(channel.id, {
        twitch_username: userInfo.login,
        display_name: userInfo.display_name,
        is_active: 1
      });
      channel = channelRepo.findById(channel.id);
    } else {
      // Create new channel
      channel = channelRepo.create(userInfo.id, userInfo.login, userInfo.display_name);
    }

    // Save channel auth with Twitch ID for multi-user auth provider
    await authManager.addChannelAuth(channel.id, userInfo.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scope,
      expiresIn: tokens.expiresIn
    });

    // Ensure settings exist
    settingsRepo.getSettings(channel.id);

    // Add channel to bot if running
    if (botCore.isRunning()) {
      await botCore.addChannel(channel.id);
    }

    logger.info(`Channel authorized: ${userInfo.login} (Twitch ID: ${userInfo.id})`);
    req.flash('success', `Channel ${userInfo.display_name} has been added`);
    res.redirect(`/channels/${channel.id}`);
  } catch (err) {
    logger.error('Channel OAuth callback error', { error: err.message });
    req.flash('error', `Authentication failed: ${err.message}`);
    res.redirect('/channels');
  }
}

/**
 * Revoke channel authorization
 */
router.post('/channel/:id/revoke', async (req, res) => {
  const channelId = parseInt(req.params.id, 10);

  try {
    const channel = channelRepo.findById(channelId);
    if (!channel) {
      req.flash('error', 'Channel not found');
      return res.redirect('/channels');
    }

    // Remove from bot if running
    if (botCore.isRunning()) {
      await botCore.removeChannel(channelId);
    }

    // Remove auth
    authManager.removeChannelAuth(channelId);

    // Deactivate channel
    channelRepo.deactivate(channelId);

    logger.info(`Channel revoked: ${channel.twitch_username}`);
    req.flash('success', `Channel ${channel.display_name} has been disconnected`);
    res.redirect('/channels');
  } catch (err) {
    logger.error('Channel revoke error', { error: err.message });
    req.flash('error', `Failed to revoke channel: ${err.message}`);
    res.redirect('/channels');
  }
});

module.exports = router;
