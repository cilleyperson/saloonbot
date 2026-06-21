const express = require('express');
const router = express.Router();
const botCore = require('../../bot');
const channelRepo = require('../../database/repositories/channel-repo');
const commandRepo = require('../../database/repositories/command-repo');
const counterRepo = require('../../database/repositories/counter-repo');
const authManager = require('../../bot/auth-manager');

/**
 * Dashboard - main overview page
 */
router.get('/', async (req, res) => {
  try {
    const botStatus = botCore.getStatus();
    const channels = channelRepo.findAllActive();

    // Get stats
    let totalCommands = 0;
    let totalCounters = 0;

    for (const channel of channels) {
      totalCommands += commandRepo.count(channel.id);
      totalCounters += counterRepo.count(channel.id);
    }

    // Get channel statuses
    const channelsWithStatus = channels.map(channel => ({
      ...channel,
      status: botCore.channelManager?.getChannelStatus(channel.id) || { status: 'unknown' }
    }));

    // Chat-membership health: reveals "connected but joined to zero chats"
    const chatHealth = botCore.channelManager?.getMembershipHealth
      ? botCore.channelManager.getMembershipHealth()
      : null;

    // Token health: per-user refresh state (no token values, states only)
    const authHealth = authManager.getAuthHealth ? authManager.getAuthHealth() : [];

    res.render('dashboard', {
      title: 'Dashboard',
      botStatus,
      channels: channelsWithStatus,
      chatHealth,
      authHealth,
      stats: {
        channels: channels.length,
        commands: totalCommands,
        counters: totalCounters
      },
      needsBotAuth: !authManager.isBotAuthenticated()
    });
  } catch (error) {
    res.render('dashboard', {
      title: 'Dashboard',
      botStatus: { running: false, authenticated: false },
      channels: [],
      chatHealth: null,
      authHealth: [],
      stats: { channels: 0, commands: 0, counters: 0 },
      needsBotAuth: true,
      error: error.message
    });
  }
});

/**
 * Admin-only machine-readable health (auth + chat membership) for monitoring.
 * Mounted under requireAuth (see web/index.js). The public /healthz route stays
 * a bare liveness check; this exposes detail only to authenticated admins and
 * never includes token values.
 */
router.get('/health/auth', (req, res) => {
  try {
    const authHealth = authManager.getAuthHealth ? authManager.getAuthHealth() : [];
    const chatHealth = botCore.channelManager?.getMembershipHealth
      ? botCore.channelManager.getMembershipHealth()
      : null;
    const degraded =
      authHealth.some(h => h.state !== 'healthy') || (chatHealth ? !chatHealth.healthy : false);
    res.status(degraded ? 503 : 200).json({
      status: degraded ? 'degraded' : 'ok',
      auth: authHealth,
      chat: chatHealth
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = router;
