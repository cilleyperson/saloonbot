const express = require('express');
const router = express.Router();
const channelRepo = require('../../database/repositories/channel-repo');
const objectDetectionRepo = require('../../database/repositories/object-detection-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const yoloClasses = require('../../constants/yolo-classes');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('object-detection-routes');

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate confidence value (0-1)
 * @param {string|number} value - Confidence value
 * @returns {number|null} Parsed confidence or null if invalid
 */
function parseConfidence(value) {
  const confidence = parseFloat(value);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }
  return confidence;
}

/**
 * Validate frame interval (500-10000ms)
 * @param {string|number} value - Frame interval value
 * @returns {number|null} Parsed interval or null if invalid
 */
function parseFrameInterval(value) {
  const interval = parseInt(value, 10);
  if (isNaN(interval) || interval < 500 || interval > 10000) {
    return null;
  }
  return interval;
}

/**
 * Validate message template (max 500 chars)
 * @param {string} template - Message template
 * @returns {boolean} True if valid
 */
function isValidMessageTemplate(template) {
  if (!template) return true; // Empty is valid
  return typeof template === 'string' && template.length <= 500;
}

/**
 * Validate object class against YOLO classes
 * @param {string} objectClass - Object class to validate
 * @returns {boolean} True if valid
 */
function isValidObjectClass(objectClass) {
  if (!objectClass || typeof objectClass !== 'string') return false;
  const allClasses = yoloClasses.getAllClasses();
  return allClasses.includes(objectClass.toLowerCase().trim());
}

/**
 * Auto-create chat membership for the channel's own chat if needed
 * @param {Object} channel - Channel object
 * @returns {boolean} True if membership was created
 */
function ensureChatMembership(channel) {
  // Check if a chat membership exists for the channel's own chat
  const existingMembership = chatMembershipRepo.findByChannelAndTarget(
    channel.id,
    channel.twitch_username
  );

  if (!existingMembership) {
    chatMembershipRepo.create(channel.id, channel.twitch_username);
    logger.info(`Auto-created chat membership for channel ${channel.twitch_username}`);
    return true;
  }

  return false;
}

// ==========================================
// Dashboard Route
// ==========================================

/**
 * Main detection dashboard - shows all channels
 */
router.get('/', (req, res) => {
  const channels = channelRepo.findAll();

  // Get detection config for each channel
  const channelsWithConfig = channels.map(channel => {
    const config = objectDetectionRepo.getConfig(channel.id);
    const stats = config ? objectDetectionRepo.getDetectionStats(config.id) : null;
    const rules = config ? objectDetectionRepo.getRules(config.id) : [];

    return {
      ...channel,
      detectionConfig: config,
      detectionStats: stats,
      ruleCount: rules.length,
      enabledRuleCount: rules.filter(r => r.is_enabled).length
    };
  });

  res.render('object-detection/dashboard', {
    title: 'Object Detection',
    channels: channelsWithConfig
  });
});

// ==========================================
// Channel Configuration Routes
// ==========================================

/**
 * View/edit detection config for a channel
 */
router.get('/channels/:id', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  // Get or create config for this channel
  const config = objectDetectionRepo.getOrCreateConfig(channelId);
  const rules = objectDetectionRepo.getRules(config.id);
  const stats = objectDetectionRepo.getDetectionStats(config.id);
  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  // Get available YOLO classes grouped by category
  const categories = yoloClasses.getAllCategories();
  const classesByCategory = {};
  categories.forEach(category => {
    classesByCategory[category] = yoloClasses.getClassesByCategory(category);
  });

  res.render('object-detection/channel', {
    title: `Object Detection - ${channel.display_name || channel.twitch_username}`,
    channel,
    config,
    rules,
    stats,
    chatMemberships,
    categories,
    classesByCategory,
    allClasses: yoloClasses.getAllClasses()
  });
});

/**
 * Update detection settings for a channel
 */
router.post('/channels/:id/config', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  try {
    const {
      stream_url,
      frame_interval_ms,
      max_concurrent_detections,
      cooldown_seconds
    } = req.body;

    // Validate frame interval
    const frameInterval = parseFrameInterval(frame_interval_ms);
    if (frameInterval === null) {
      req.flash('error', 'Frame interval must be between 500 and 10000 milliseconds');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    // Validate max concurrent detections
    const maxConcurrent = parseInt(max_concurrent_detections, 10);
    if (isNaN(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 10) {
      req.flash('error', 'Max concurrent detections must be between 1 and 10');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    // Validate cooldown seconds
    const cooldown = parseInt(cooldown_seconds, 10);
    if (isNaN(cooldown) || cooldown < 0 || cooldown > 3600) {
      req.flash('error', 'Cooldown must be between 0 and 3600 seconds');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    const config = objectDetectionRepo.getOrCreateConfig(channelId);
    objectDetectionRepo.updateConfig(config.id, {
      stream_url: stream_url || null,
      frame_interval_ms: frameInterval,
      max_concurrent_detections: maxConcurrent,
      cooldown_seconds: cooldown
    });

    logger.info(`Updated detection config for channel ${channel.twitch_username}`);
    req.flash('success', 'Detection settings updated successfully');
  } catch (err) {
    logger.error('Failed to update detection config', { error: err.message });
    req.flash('error', `Failed to update settings: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

// ==========================================
// Detection Rules Routes
// ==========================================

/**
 * Add a new detection rule
 */
router.post('/channels/:id/rules', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  try {
    const { object_class, min_confidence, message_template, is_enabled } = req.body;

    // Validate object class
    if (!isValidObjectClass(object_class)) {
      req.flash('error', 'Invalid object class selected');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    // Validate confidence
    const confidence = parseConfidence(min_confidence);
    if (confidence === null) {
      req.flash('error', 'Confidence must be between 0 and 1');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    // Validate message template
    if (!isValidMessageTemplate(message_template)) {
      req.flash('error', 'Message template must be 500 characters or less');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    const config = objectDetectionRepo.getOrCreateConfig(channelId);
    objectDetectionRepo.createRule(config.id, {
      objectClass: object_class.toLowerCase().trim(),
      minConfidence: confidence,
      messageTemplate: message_template || null,
      isEnabled: is_enabled === 'on'
    });

    logger.info(`Created detection rule for ${object_class} in channel ${channel.twitch_username}`);
    req.flash('success', `Detection rule for "${object_class}" created`);
  } catch (err) {
    logger.error('Failed to create detection rule', { error: err.message });
    req.flash('error', `Failed to create rule: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

/**
 * Update a detection rule
 */
router.post('/channels/:id/rules/:ruleId/update', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const ruleId = parseInt(req.params.ruleId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  const rule = objectDetectionRepo.getRule(ruleId);
  if (!rule) {
    req.flash('error', 'Rule not found');
    return res.redirect(`/detection/channels/${channelId}`);
  }

  // Verify rule belongs to this channel's config
  const config = objectDetectionRepo.getConfig(channelId);
  if (!config || rule.config_id !== config.id) {
    req.flash('error', 'Rule does not belong to this channel');
    return res.redirect(`/detection/channels/${channelId}`);
  }

  try {
    const { object_class, min_confidence, message_template, is_enabled } = req.body;

    // Build update object with validated fields
    const updates = {};

    // Validate object class if provided
    if (object_class !== undefined) {
      if (!isValidObjectClass(object_class)) {
        req.flash('error', 'Invalid object class selected');
        return res.redirect(`/detection/channels/${channelId}`);
      }
      updates.object_class = object_class.toLowerCase().trim();
    }

    // Validate confidence if provided
    if (min_confidence !== undefined) {
      const confidence = parseConfidence(min_confidence);
      if (confidence === null) {
        req.flash('error', 'Confidence must be between 0 and 1');
        return res.redirect(`/detection/channels/${channelId}`);
      }
      updates.min_confidence = confidence;
    }

    // Validate message template if provided
    if (message_template !== undefined) {
      if (!isValidMessageTemplate(message_template)) {
        req.flash('error', 'Message template must be 500 characters or less');
        return res.redirect(`/detection/channels/${channelId}`);
      }
      updates.message_template = message_template || null;
    }

    // Handle enabled toggle
    updates.is_enabled = is_enabled === 'on';

    objectDetectionRepo.updateRule(ruleId, updates);

    logger.info(`Updated detection rule ${ruleId} for channel ${channel.twitch_username}`);
    req.flash('success', 'Detection rule updated');
  } catch (err) {
    logger.error('Failed to update detection rule', { error: err.message });
    req.flash('error', `Failed to update rule: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

/**
 * Delete a detection rule
 */
router.post('/channels/:id/rules/:ruleId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const ruleId = parseInt(req.params.ruleId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  const rule = objectDetectionRepo.getRule(ruleId);
  if (!rule) {
    req.flash('error', 'Rule not found');
    return res.redirect(`/detection/channels/${channelId}`);
  }

  // Verify rule belongs to this channel's config
  const config = objectDetectionRepo.getConfig(channelId);
  if (!config || rule.config_id !== config.id) {
    req.flash('error', 'Rule does not belong to this channel');
    return res.redirect(`/detection/channels/${channelId}`);
  }

  try {
    objectDetectionRepo.deleteRule(ruleId);
    logger.info(`Deleted detection rule ${ruleId} for channel ${channel.twitch_username}`);
    req.flash('success', 'Detection rule deleted');
  } catch (err) {
    logger.error('Failed to delete detection rule', { error: err.message });
    req.flash('error', `Failed to delete rule: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

// ==========================================
// Monitoring Control Routes
// ==========================================

/**
 * Start monitoring a channel
 */
router.post('/channels/:id/start', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  try {
    const config = objectDetectionRepo.getOrCreateConfig(channelId);

    // Check if there are any enabled rules
    const enabledRules = objectDetectionRepo.getEnabledRules(config.id);
    if (enabledRules.length === 0) {
      req.flash('error', 'Cannot start monitoring: No enabled detection rules');
      return res.redirect(`/detection/channels/${channelId}`);
    }

    // Auto-create chat membership if needed
    ensureChatMembership(channel);

    // Enable monitoring
    objectDetectionRepo.updateConfig(config.id, { is_enabled: true });

    // TODO: Notify detection orchestrator service to start monitoring
    // This will be implemented when the orchestrator service is created

    logger.info(`Started object detection monitoring for channel ${channel.twitch_username}`);
    req.flash('success', 'Object detection monitoring started');
  } catch (err) {
    logger.error('Failed to start monitoring', { error: err.message });
    req.flash('error', `Failed to start monitoring: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

/**
 * Stop monitoring a channel
 */
router.post('/channels/:id/stop', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  try {
    const config = objectDetectionRepo.getConfig(channelId);
    if (config) {
      // Disable monitoring
      objectDetectionRepo.updateConfig(config.id, { is_enabled: false });

      // TODO: Notify detection orchestrator service to stop monitoring
      // This will be implemented when the orchestrator service is created

      logger.info(`Stopped object detection monitoring for channel ${channel.twitch_username}`);
      req.flash('success', 'Object detection monitoring stopped');
    } else {
      req.flash('info', 'Monitoring was not active');
    }
  } catch (err) {
    logger.error('Failed to stop monitoring', { error: err.message });
    req.flash('error', `Failed to stop monitoring: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}`);
});

// ==========================================
// Logs Routes
// ==========================================

/**
 * View detection logs for a channel
 */
router.get('/channels/:id/logs', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  const config = objectDetectionRepo.getConfig(channelId);
  if (!config) {
    req.flash('error', 'No detection config found for this channel');
    return res.redirect(`/detection/channels/${channelId}`);
  }

  // Get pagination params
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const logs = objectDetectionRepo.getRecentLogs(config.id, limit);
  const stats = objectDetectionRepo.getDetectionStats(config.id);
  const logCount = objectDetectionRepo.getLogCount(config.id);

  res.render('object-detection/logs', {
    title: `Detection Logs - ${channel.display_name || channel.twitch_username}`,
    channel,
    config,
    logs,
    stats,
    logCount,
    limit
  });
});

/**
 * Clear detection logs for a channel
 */
router.post('/channels/:id/logs/clear', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/detection');
  }

  try {
    const config = objectDetectionRepo.getConfig(channelId);
    if (config) {
      const deletedCount = objectDetectionRepo.clearLogs(config.id);
      logger.info(`Cleared ${deletedCount} detection logs for channel ${channel.twitch_username}`);
      req.flash('success', `Cleared ${deletedCount} detection logs`);
    } else {
      req.flash('info', 'No logs to clear');
    }
  } catch (err) {
    logger.error('Failed to clear logs', { error: err.message });
    req.flash('error', `Failed to clear logs: ${err.message}`);
  }

  res.redirect(`/detection/channels/${channelId}/logs`);
});

// ==========================================
// API Endpoints
// ==========================================

/**
 * Return JSON list of available YOLO objects
 */
router.get('/api/objects', (req, res) => {
  const categories = yoloClasses.getAllCategories();
  const classesByCategory = {};
  categories.forEach(category => {
    classesByCategory[category] = yoloClasses.getClassesByCategory(category);
  });

  res.json({
    classes: yoloClasses.getAllClasses(),
    categories: classesByCategory
  });
});

module.exports = router;
