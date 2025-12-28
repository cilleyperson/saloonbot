const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');
const yoloClasses = require('../../constants/yolo-classes');

const logger = createChildLogger('object-detection-repo');

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate confidence value (must be between 0 and 1)
 * @param {number} confidence - Confidence value to validate
 * @param {string} fieldName - Name of the field for error message
 * @throws {Error} If confidence is invalid
 */
function validateConfidence(confidence, fieldName = 'confidence') {
  if (typeof confidence !== 'number' || isNaN(confidence)) {
    throw new Error(`${fieldName} must be a number`);
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }
}

/**
 * Validate object class against YOLO classes
 * @param {string} objectClass - Object class to validate
 * @returns {string} Normalized class name
 * @throws {Error} If object class is invalid
 */
function validateObjectClass(objectClass) {
  if (!objectClass || typeof objectClass !== 'string') {
    throw new Error('Object class is required and must be a string');
  }
  const normalizedClass = objectClass.toLowerCase().trim();
  const allClasses = yoloClasses.getAllClasses();
  if (!allClasses.includes(normalizedClass)) {
    throw new Error(`Invalid object class: ${objectClass}`);
  }
  return normalizedClass;
}

/**
 * Validate message template
 * @param {string} template - Message template
 * @throws {Error} If template is invalid
 */
function validateMessageTemplate(template) {
  if (template && typeof template !== 'string') {
    throw new Error('Message template must be a string');
  }
  if (template && template.length > 500) {
    throw new Error('Message template must be 500 characters or less');
  }
}

// ==========================================
// Config Functions
// ==========================================

/**
 * Get detection config for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Config or null
 */
function getConfig(channelId) {
  if (!channelId || typeof channelId !== 'number') {
    return null;
  }
  const db = getDb();
  const config = db.prepare(`
    SELECT * FROM object_detection_configs
    WHERE channel_id = ?
  `).get(channelId);

  if (config) {
    config.is_enabled = Boolean(config.is_enabled);
  }

  return config || null;
}

/**
 * Create a new detection config for a channel
 * @param {number} channelId - Channel ID
 * @param {Object} options - Configuration options
 * @returns {Object} Created config
 */
function createConfig(channelId, options = {}) {
  const db = getDb();

  const {
    isEnabled = false,
    streamUrl = null,
    frameIntervalMs = 1000,
    maxConcurrentDetections = 1,
    cooldownSeconds = 30
  } = options;

  // Check if config already exists
  const existing = getConfig(channelId);
  if (existing) {
    throw new Error(`Config already exists for channel ${channelId}`);
  }

  const stmt = db.prepare(`
    INSERT INTO object_detection_configs
    (channel_id, is_enabled, stream_url, frame_interval_ms, max_concurrent_detections, cooldown_seconds)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    channelId,
    isEnabled ? 1 : 0,
    streamUrl,
    frameIntervalMs,
    maxConcurrentDetections,
    cooldownSeconds
  );

  logger.info(`Created object detection config for channel ${channelId}`, { id: result.lastInsertRowid });
  return findConfigById(result.lastInsertRowid);
}

/**
 * Find config by ID
 * @param {number} id - Config ID
 * @returns {Object|null} Config or null
 */
function findConfigById(id) {
  const db = getDb();
  const config = db.prepare('SELECT * FROM object_detection_configs WHERE id = ?').get(id);
  if (config) {
    config.is_enabled = Boolean(config.is_enabled);
  }
  return config || null;
}

/**
 * Update an existing detection config
 * @param {number} configId - Config ID
 * @param {Object} options - Data to update
 * @returns {Object|null} Updated config or null
 */
function updateConfig(configId, options) {
  const db = getDb();

  const allowedFields = ['is_enabled', 'stream_url', 'frame_interval_ms', 'max_concurrent_detections', 'cooldown_seconds'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(options)) {
    if (allowedFields.includes(key)) {
      if (key === 'is_enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (updates.length === 0) return findConfigById(configId);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(configId);

  const sql = `UPDATE object_detection_configs SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated object detection config ${configId}`, { options });
  return findConfigById(configId);
}

/**
 * Delete a detection config
 * @param {number} configId - Config ID
 * @returns {boolean} Success
 */
function deleteConfig(configId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM object_detection_configs WHERE id = ?').run(configId);
  logger.info(`Deleted object detection config ${configId}`);
  return result.changes > 0;
}

/**
 * Get all enabled configs
 * @returns {Object[]} Array of enabled configs
 */
function getEnabledConfigs() {
  const db = getDb();
  const configs = db.prepare(`
    SELECT * FROM object_detection_configs
    WHERE is_enabled = 1
    ORDER BY channel_id
  `).all();

  return configs.map(config => ({
    ...config,
    is_enabled: Boolean(config.is_enabled)
  }));
}

/**
 * Check if monitoring is active for a channel
 * @param {number} channelId - Channel ID
 * @returns {boolean} True if monitoring is active
 */
function isMonitoringActive(channelId) {
  const config = getConfig(channelId);
  return config !== null && config.is_enabled === true;
}

/**
 * Get or create config for a channel
 * @param {number} channelId - Channel ID
 * @param {Object} defaults - Default options if creating
 * @returns {Object} Config
 */
function getOrCreateConfig(channelId, defaults = {}) {
  let config = getConfig(channelId);
  if (!config) {
    config = createConfig(channelId, defaults);
  }
  return config;
}

// ==========================================
// Rule Functions
// ==========================================

/**
 * Get all rules for a config
 * @param {number} configId - Config ID
 * @returns {Object[]} Array of rules
 */
function getRules(configId) {
  const db = getDb();
  const rules = db.prepare(`
    SELECT * FROM object_detection_rules
    WHERE config_id = ?
    ORDER BY object_class
  `).all(configId);

  return rules.map(rule => ({
    ...rule,
    is_enabled: Boolean(rule.is_enabled)
  }));
}

/**
 * Get a single rule by ID
 * @param {number} ruleId - Rule ID
 * @returns {Object|null} Rule or null
 */
function getRule(ruleId) {
  const db = getDb();
  const rule = db.prepare('SELECT * FROM object_detection_rules WHERE id = ?').get(ruleId);
  if (rule) {
    rule.is_enabled = Boolean(rule.is_enabled);
  }
  return rule || null;
}

/**
 * Create a new detection rule
 * @param {number} configId - Config ID
 * @param {Object} ruleData - Rule data
 * @returns {Object} Created rule
 */
function createRule(configId, ruleData) {
  const db = getDb();

  const {
    objectClass,
    minConfidence = 0.5,
    messageTemplate = null,
    isEnabled = true
  } = ruleData;

  // Validate required fields
  const normalizedObjectClass = validateObjectClass(objectClass);
  validateConfidence(minConfidence, 'minConfidence');
  validateMessageTemplate(messageTemplate);

  // Verify config exists
  const config = findConfigById(configId);
  if (!config) {
    throw new Error(`Config ${configId} not found`);
  }

  // Check for duplicate rule
  const existing = getRulesByObject(configId, normalizedObjectClass);
  if (existing.length > 0) {
    throw new Error(`Rule for object class '${normalizedObjectClass}' already exists in this config`);
  }

  const stmt = db.prepare(`
    INSERT INTO object_detection_rules
    (config_id, object_class, min_confidence, message_template, is_enabled)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    configId,
    normalizedObjectClass,
    minConfidence,
    messageTemplate,
    isEnabled ? 1 : 0
  );

  logger.info(`Created detection rule for ${normalizedObjectClass} in config ${configId}`, { id: result.lastInsertRowid });
  return getRule(result.lastInsertRowid);
}

/**
 * Update a detection rule
 * @param {number} ruleId - Rule ID
 * @param {Object} ruleData - Data to update
 * @returns {Object|null} Updated rule or null
 */
function updateRule(ruleId, ruleData) {
  const db = getDb();

  const allowedFields = ['object_class', 'min_confidence', 'message_template', 'is_enabled'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(ruleData)) {
    if (allowedFields.includes(key)) {
      if (key === 'object_class') {
        const normalizedClass = validateObjectClass(value);
        updates.push(`${key} = ?`);
        values.push(normalizedClass);
      } else if (key === 'min_confidence') {
        validateConfidence(value, 'min_confidence');
        updates.push(`${key} = ?`);
        values.push(value);
      } else if (key === 'message_template') {
        validateMessageTemplate(value);
        updates.push(`${key} = ?`);
        values.push(value);
      } else if (key === 'is_enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (updates.length === 0) return getRule(ruleId);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(ruleId);

  const sql = `UPDATE object_detection_rules SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated detection rule ${ruleId}`, { ruleData });
  return getRule(ruleId);
}

/**
 * Delete a detection rule
 * @param {number} ruleId - Rule ID
 * @returns {boolean} Success
 */
function deleteRule(ruleId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM object_detection_rules WHERE id = ?').run(ruleId);
  logger.info(`Deleted detection rule ${ruleId}`);
  return result.changes > 0;
}

/**
 * Find rules by object class for a config
 * @param {number} configId - Config ID
 * @param {string} objectClass - Object class to search for
 * @returns {Object[]} Array of matching rules
 */
function getRulesByObject(configId, objectClass) {
  const db = getDb();

  const normalizedClass = objectClass.toLowerCase().trim();

  const rules = db.prepare(`
    SELECT * FROM object_detection_rules
    WHERE config_id = ? AND object_class = ?
  `).all(configId, normalizedClass);

  return rules.map(rule => ({
    ...rule,
    is_enabled: Boolean(rule.is_enabled)
  }));
}

/**
 * Get enabled rules for a config
 * @param {number} configId - Config ID
 * @returns {Object[]} Array of enabled rules
 */
function getEnabledRules(configId) {
  const db = getDb();
  const rules = db.prepare(`
    SELECT * FROM object_detection_rules
    WHERE config_id = ? AND is_enabled = 1
    ORDER BY object_class
  `).all(configId);

  return rules.map(rule => ({
    ...rule,
    is_enabled: Boolean(rule.is_enabled)
  }));
}

// ==========================================
// Log Functions
// ==========================================

/**
 * Log a detection event
 * @param {number} configId - Config ID
 * @param {number|null} ruleId - Rule ID (can be null if no rule matched)
 * @param {Object} data - Detection data
 * @returns {Object} Created log entry
 */
function logDetection(configId, ruleId, data) {
  const db = getDb();

  const {
    objectClass,
    confidence,
    messageSent = null
  } = data;

  // Validate inputs
  if (!objectClass || typeof objectClass !== 'string') {
    throw new Error('Object class is required for logging');
  }
  validateConfidence(confidence, 'confidence');

  const stmt = db.prepare(`
    INSERT INTO object_detection_logs
    (config_id, rule_id, object_class, confidence, message_sent)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    configId,
    ruleId || null,
    objectClass.toLowerCase().trim(),
    confidence,
    messageSent
  );

  logger.debug(`Logged detection: ${objectClass} (${(confidence * 100).toFixed(1)}%) for config ${configId}`);
  return findLogById(result.lastInsertRowid);
}

/**
 * Find log entry by ID
 * @param {number} id - Log ID
 * @returns {Object|null} Log entry or null
 */
function findLogById(id) {
  const db = getDb();
  const log = db.prepare('SELECT * FROM object_detection_logs WHERE id = ?').get(id);
  return log || null;
}

/**
 * Get recent detection logs for a config
 * @param {number} configId - Config ID
 * @param {number} limit - Maximum number of logs to return
 * @returns {Object[]} Array of log entries
 */
function getRecentLogs(configId, limit = 100) {
  const db = getDb();

  return db.prepare(`
    SELECT * FROM object_detection_logs
    WHERE config_id = ?
    ORDER BY detected_at DESC
    LIMIT ?
  `).all(configId, limit);
}

/**
 * Prune old detection logs
 * @param {number} daysToKeep - Number of days of logs to keep
 * @returns {number} Number of deleted entries
 */
function pruneOldLogs(daysToKeep = 30) {
  const db = getDb();

  if (typeof daysToKeep !== 'number' || daysToKeep < 0) {
    throw new Error('daysToKeep must be a non-negative number');
  }

  const result = db.prepare(`
    DELETE FROM object_detection_logs
    WHERE detected_at < datetime('now', '-' || ? || ' days')
  `).run(daysToKeep);

  logger.info(`Pruned ${result.changes} old detection logs (kept ${daysToKeep} days)`);
  return result.changes;
}

/**
 * Get log count for a config
 * @param {number} configId - Config ID
 * @returns {number} Log count
 */
function getLogCount(configId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM object_detection_logs WHERE config_id = ?').get(configId).count;
}

/**
 * Get detection statistics for a config
 * @param {number} configId - Config ID
 * @returns {Object} Statistics object
 */
function getDetectionStats(configId) {
  const db = getDb();

  const totalDetections = db.prepare(`
    SELECT COUNT(*) as count FROM object_detection_logs WHERE config_id = ?
  `).get(configId).count;

  const objectCounts = db.prepare(`
    SELECT object_class, COUNT(*) as count
    FROM object_detection_logs
    WHERE config_id = ?
    GROUP BY object_class
    ORDER BY count DESC
  `).all(configId);

  const avgConfidence = db.prepare(`
    SELECT AVG(confidence) as avg FROM object_detection_logs WHERE config_id = ?
  `).get(configId).avg;

  const last24Hours = db.prepare(`
    SELECT COUNT(*) as count FROM object_detection_logs
    WHERE config_id = ? AND detected_at > datetime('now', '-1 day')
  `).get(configId).count;

  return {
    totalDetections,
    objectCounts,
    averageConfidence: avgConfidence ? parseFloat(avgConfidence.toFixed(4)) : 0,
    detectionsLast24Hours: last24Hours
  };
}

/**
 * Clear all logs for a config
 * @param {number} configId - Config ID
 * @returns {number} Number of deleted entries
 */
function clearLogs(configId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM object_detection_logs WHERE config_id = ?').run(configId);
  logger.info(`Cleared ${result.changes} logs for config ${configId}`);
  return result.changes;
}

module.exports = {
  // Config functions
  getConfig,
  createConfig,
  findConfigById,
  updateConfig,
  deleteConfig,
  getEnabledConfigs,
  isMonitoringActive,
  getOrCreateConfig,

  // Rule functions
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  getRulesByObject,
  getEnabledRules,

  // Log functions
  logDetection,
  findLogById,
  getRecentLogs,
  pruneOldLogs,
  getLogCount,
  getDetectionStats,
  clearLogs,

  // Validation helpers (exported for testing)
  validateConfidence,
  validateObjectClass,
  validateMessageTemplate
};
