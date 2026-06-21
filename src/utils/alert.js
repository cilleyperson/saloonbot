/**
 * Operator alerts.
 *
 * Posts a short message to an optional Discord webhook (config.alerts.discordWebhookUrl).
 * If no webhook is configured, alerting is a no-op (just logs). Alert delivery NEVER
 * throws -- a failed webhook must not crash the bot. De-duped per key so a single
 * disconnect episode does not spam (clear the key with clearAlert() on recovery).
 *
 *   sendAlert(msg, {dedupeKey}) ──▶ already alerted for key? ──yes──▶ skip
 *                                          │ no
 *                                          ▼
 *                              webhook set? ──no──▶ log warn (no push)
 *                                          │ yes
 *                                          ▼
 *                              POST (10s timeout), swallow errors ──▶ log
 */

const config = require('../config');
const { fetchWithTimeout } = require('./api-client');
const { createChildLogger } = require('./logger');

const logger = createChildLogger('alert');

// Keys we've already alerted on this episode. Cleared by clearAlert() on recovery.
const _alerted = new Set();

/**
 * Send an operator alert. Best-effort, never throws.
 * @param {string} message - Human-readable alert text
 * @param {Object} [opts]
 * @param {string} [opts.dedupeKey] - Suppress repeats for this key until clearAlert(key)
 * @returns {Promise<boolean>} true if a webhook POST was attempted and succeeded
 */
async function sendAlert(message, opts = {}) {
  const { dedupeKey } = opts;

  if (dedupeKey) {
    if (_alerted.has(dedupeKey)) {
      logger.debug(`Alert suppressed (already sent this episode): ${dedupeKey}`);
      return false;
    }
    _alerted.add(dedupeKey);
  }

  // Always log the alert regardless of webhook availability.
  logger.warn(`ALERT: ${message}`);

  const webhookUrl = config.alerts && config.alerts.discordWebhookUrl;
  if (!webhookUrl) {
    return false;
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `:rotating_light: **Saloon Bot**: ${message}` })
    });
    if (!response.ok) {
      logger.error(`Alert webhook returned ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    // Swallow: a failed alert must never crash the caller.
    logger.error('Alert webhook delivery failed', { error: error.message });
    return false;
  }
}

/**
 * Clear a dedupe key so the next sendAlert for it will fire again (call on recovery).
 * @param {string} dedupeKey
 */
function clearAlert(dedupeKey) {
  _alerted.delete(dedupeKey);
}

/**
 * Test/reset helper.
 */
function _resetAlerts() {
  _alerted.clear();
}

module.exports = { sendAlert, clearAlert, _resetAlerts };
