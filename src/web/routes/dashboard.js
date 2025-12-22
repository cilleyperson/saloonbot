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

    res.render('dashboard', {
      title: 'Dashboard',
      botStatus,
      channels: channelsWithStatus,
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
      stats: { channels: 0, commands: 0, counters: 0 },
      needsBotAuth: true,
      error: error.message
    });
  }
});

module.exports = router;
